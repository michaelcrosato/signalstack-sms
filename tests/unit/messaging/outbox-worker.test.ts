import { describe, expect, it, vi } from "vitest";
import { MessageTransport } from "@prisma/client";
import {
  processClaimedDirectMessageAttempt,
  processDueDirectMessageAttempts,
  type PreparedDirectMessageAttempt
} from "@/lib/messaging/outbox/worker";

const claim = {
  attemptId: "attempt_1",
  expectedOrgId: "org_1",
  processingToken: "d9428888-122b-4f4e-8e77-9f6f8b2e9a11",
  processingExpiresAt: new Date("2026-07-12T12:01:00.000Z")
};
const prepared: PreparedDirectMessageAttempt = {
  orgId: claim.expectedOrgId,
  attemptId: claim.attemptId,
  messageId: "message_1",
  attemptNumber: 1,
  processingToken: claim.processingToken,
  transport: MessageTransport.DUMMY,
  providerCallStartedAt: null,
  providerSnapshot: null,
  providerPhoneNumberId: null,
  from: "+15555550199",
  destination: "+15555550100",
  body: "hello",
  mediaUrls: [],
  requestFingerprint: "request_fingerprint_1",
  callbackCorrelationId: "d9428888-122b-4f4e-8e77-9f6f8b2e9a12",
  statusCallbackUrl: null
};
const twilioPrepared: PreparedDirectMessageAttempt = {
  ...prepared,
  transport: MessageTransport.TWILIO,
  providerCallStartedAt: new Date("2026-07-12T12:00:00.000Z"),
  providerSnapshot: {
    orgId: claim.expectedOrgId,
    provider: "twilio",
    providerAccountId: "provider_account_1",
    externalAccountId: `AC${"a".repeat(32)}`,
    externalAccountIdHash: `pvlookup_v1_${"b".repeat(43)}`,
    providerCredentialSecretId: "provider_secret_1",
    providerCredentialVersion: 1,
    secret: {
      envelopeVersion: 1,
      algorithm: "aes-256-gcm",
      keyVersion: 1,
      iv: "iv",
      ciphertext: "ciphertext",
      authTag: "auth-tag",
      fingerprint: `pvfp_${"c".repeat(22)}`
    }
  },
  providerPhoneNumberId: "provider_phone_1",
  callbackCorrelationId: "d9428888-122b-4f4e-8e77-9f6f8b2e9a13",
  statusCallbackUrl: "https://sms.example.test/api/webhooks/twilio/status"
};

describe("direct message outbox worker", () => {
  it("processes recovery before claims and reports every outcome", async () => {
    const order: string[] = [];
    const result = await processDueDirectMessageAttempts(10, {
      readiness: () => ({ allowed: true, transport: "dummy" }),
      recover: vi.fn(async () => {
        order.push("recover");
        return [{ attemptId: "ambiguous_1", expectedOrgId: "org_1" }];
      }),
      recordRecovery: vi.fn(async () => { order.push("record"); }),
      claim: vi.fn(async () => {
        order.push("claim");
        return [claim, { ...claim, attemptId: "attempt_2" }];
      }),
      processClaim: vi.fn()
        .mockResolvedValueOnce("sent")
        .mockResolvedValueOnce("ambiguous")
    });
    expect(order).toEqual(["recover", "record", "claim"]);
    expect(result).toMatchObject({
      recovered: 1,
      claimed: 2,
      sent: 1,
      ambiguous: 1,
      blocked: false
    });
  });

  it("does not claim work when direct worker readiness is blocked", async () => {
    const claimWork = vi.fn();
    const recover = vi.fn();
    await expect(processDueDirectMessageAttempts(10, {
      readiness: () => ({ allowed: false, reason: "worker-disabled" }),
      recover,
      claim: claimWork
    })).resolves.toMatchObject({ blocked: true, reason: "worker-disabled", claimed: 0 });
    expect(recover).not.toHaveBeenCalled();
    expect(claimWork).not.toHaveBeenCalled();
  });

  it("recovers post-frontier ambiguity but never claims when live provider readiness is invalid", async () => {
    const order: string[] = [];
    const claimWork = vi.fn();
    const result = await processDueDirectMessageAttempts(10, {
      readiness: () => ({ allowed: false, reason: "live-worker-invalid" }),
      recover: vi.fn(async () => {
        order.push("recover");
        return [{ attemptId: "ambiguous_1", expectedOrgId: "org_1" }];
      }),
      recordRecovery: vi.fn(async () => {
        order.push("record");
      }),
      claim: claimWork
    });
    expect(order).toEqual(["recover", "record"]);
    expect(claimWork).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      recovered: 1,
      claimed: 0,
      blocked: true,
      reason: "live-worker-invalid"
    });
  });

  it("finalizes a deterministic successful provider result", async () => {
    const finalize = vi.fn().mockResolvedValue(true);
    const adapter = {
      createMessage: vi.fn().mockResolvedValue({
        providerMessageId: "dummy_request_fingerprint_1",
        externalAccountId: "dummy-account",
        status: { status: "queued", providerStatus: "queued" },
        to: prepared.destination,
        from: prepared.from,
        messagingServiceId: null,
        providerErrorCode: null
      })
    };
    await expect(processClaimedDirectMessageAttempt(claim, {
      prepare: vi.fn().mockResolvedValue({ outcome: "prepared", prepared }),
      createAdapter: () => adapter as never,
      finalize
    })).resolves.toBe("sent");
    expect(adapter.createMessage).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledWith(claim, prepared, expect.objectContaining({ outcome: "sent" }));
  });

  it("never retries an ambiguous create error", async () => {
    const finalize = vi.fn().mockResolvedValue(true);
    const adapter = {
      createMessage: vi.fn().mockRejectedValue(new Error("possible impact")),
      classifyError: vi.fn().mockReturnValue({
        disposition: "ambiguous",
        retryable: false,
        safeCode: "TWILIO_NETWORK_ERROR",
        providerCode: null
      })
    };
    await expect(processClaimedDirectMessageAttempt(claim, {
      prepare: vi.fn().mockResolvedValue({ outcome: "prepared", prepared }),
      createAdapter: () => adapter as never,
      finalize
    })).resolves.toBe("ambiguous");
    expect(adapter.createMessage).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledWith(claim, prepared, expect.objectContaining({ outcome: "ambiguous" }));
  });

  it("bases a definitive successor deadline on the post-failure clock", async () => {
    const order: string[] = [];
    const failedAt = new Date("2026-07-12T12:00:30.000Z");
    const finalize = vi.fn().mockResolvedValue(true);
    const adapter = {
      createMessage: vi.fn().mockImplementation(async () => {
        order.push("create");
        throw new Error("definitive throttle");
      }),
      classifyError: vi.fn().mockReturnValue({
        disposition: "retryable",
        retryable: true,
        safeCode: "TWILIO_20429",
        providerCode: "TWILIO_20429"
      })
    };
    await expect(processClaimedDirectMessageAttempt(claim, {
      prepare: vi.fn().mockResolvedValue({ outcome: "prepared", prepared: twilioPrepared }),
      createAdapter: () => adapter as never,
      now: () => {
        order.push("clock");
        return failedAt;
      },
      finalize
    })).resolves.toBe("retried");
    expect(order).toEqual(["create", "clock"]);
    expect(finalize).toHaveBeenCalledWith(
      claim,
      twilioPrepared,
      expect.objectContaining({
        outcome: "retry",
        nextAttemptAt: new Date(failedAt.getTime() + 5_000)
      })
    );
  });

  it("persists a mismatched provider response as ambiguity without trusting its SID", async () => {
    const finalize = vi.fn().mockResolvedValue(true);
    const adapter = {
      createMessage: vi.fn().mockResolvedValue({
        providerMessageId: `SM${"d".repeat(32)}`,
        externalAccountId: `AC${"e".repeat(32)}`,
        status: { status: "queued", providerStatus: "queued" },
        to: "+15555550999",
        from: twilioPrepared.from,
        messagingServiceId: null,
        providerErrorCode: null
      })
    };
    await expect(processClaimedDirectMessageAttempt(claim, {
      prepare: vi.fn().mockResolvedValue({ outcome: "prepared", prepared: twilioPrepared }),
      createAdapter: () => adapter as never,
      finalize
    })).resolves.toBe("ambiguous");
    expect(adapter.createMessage).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledWith(claim, twilioPrepared, {
      outcome: "ambiguous",
      errorCode: "PROVIDER_RESPONSE_MISMATCH",
      providerErrorCode: null,
      disposition: "ambiguous"
    });
  });

  it("marks result persistence uncertainty instead of calling the provider again", async () => {
    const markPersistenceAmbiguous = vi.fn().mockResolvedValue(true);
    const adapter = {
      createMessage: vi.fn().mockResolvedValue({
        providerMessageId: "dummy_request_fingerprint_1",
        externalAccountId: "dummy-account",
        status: { status: "queued", providerStatus: "queued" },
        to: prepared.destination,
        from: prepared.from,
        messagingServiceId: null,
        providerErrorCode: null
      })
    };
    await expect(processClaimedDirectMessageAttempt(claim, {
      prepare: vi.fn().mockResolvedValue({ outcome: "prepared", prepared }),
      createAdapter: () => adapter as never,
      finalize: vi.fn().mockRejectedValue(new Error("commit lost")),
      markPersistenceAmbiguous
    })).resolves.toBe("ambiguous");
    expect(adapter.createMessage).toHaveBeenCalledTimes(1);
    expect(markPersistenceAmbiguous).toHaveBeenCalledTimes(1);
  });
});
