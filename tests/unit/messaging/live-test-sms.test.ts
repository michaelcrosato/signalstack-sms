import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLiveTestSmsStatus,
  liveTestSmsConfirmation,
  normalizeNorthAmericanPhone,
  parseLiveTestSmsAllowlist,
  sendLiveTestSms
} from "@/lib/messaging/live-test-sms";
import { liveTestSmsSchema } from "@/lib/validation/live-test-sms";

const mocks = vi.hoisted(() => ({
  messageFindUnique: vi.fn(),
  messageCreate: vi.fn(),
  messageUpdate: vi.fn(),
  readinessAuditFindFirst: vi.fn(),
  readinessAuditCreate: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    message: {
      findUnique: mocks.messageFindUnique,
      create: mocks.messageCreate,
      update: mocks.messageUpdate
    },
    liveReadinessAuditEvent: {
      findFirst: mocks.readinessAuditFindFirst,
      create: mocks.readinessAuditCreate
    }
  }
}));

const requestId = "123e4567-e89b-42d3-a456-426614174000";
const operatorToken = "test-operator-token-32-characters-minimum";
const liveEnv = {
  LIVE_TEST_SMS_ENABLED: "true",
  LIVE_MESSAGING_ENABLED: "true",
  MESSAGING_PROVIDER: "twilio",
  TWILIO_ACCOUNT_SID: "AC_test",
  TWILIO_AUTH_TOKEN: "secret",
  TWILIO_FROM_NUMBER: "+15555550199",
  LIVE_TEST_SMS_TO_ALLOWLIST: "+15879873814",
  LIVE_TEST_SMS_OPERATOR_TOKEN: operatorToken,
  LIVE_TEST_SMS_TIMEOUT_MS: "5000"
};

function sendInput(overrides: Partial<Parameters<typeof sendLiveTestSms>[0]> = {}) {
  return {
    orgId: "org_1",
    actorUserId: "user_1",
    requestId,
    to: "+15879873814",
    body: "Hello from the gated local test path",
    confirmation: liveTestSmsConfirmation,
    operatorToken,
    env: liveEnv,
    ...overrides
  };
}

function requestFingerprint(input = sendInput()) {
  return createHmac("sha256", operatorToken)
    .update(
      JSON.stringify([
        "live-test-sms:v1",
        input.actorUserId,
        normalizeNorthAmericanPhone(input.to),
        input.body.trim()
      ]),
      "utf8"
    )
    .digest("hex");
}

function reservationAudit(overrides: Record<string, unknown> = {}) {
  return {
    actorUserId: "user_1",
    metadata: {
      requestFingerprintVersion: "hmac-sha256-v2",
      requestFingerprint: requestFingerprint(),
      toLast4: "3814",
      fromLast4: "0199"
    },
    ...overrides
  };
}

describe("live test SMS gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.messageFindUnique.mockResolvedValue(null);
    mocks.messageCreate.mockResolvedValue({ id: "message_live_test" });
    mocks.messageUpdate.mockResolvedValue({ id: "message_live_test" });
    mocks.readinessAuditFindFirst.mockResolvedValue(null);
    mocks.readinessAuditCreate.mockResolvedValue({ id: "audit_live_test" });
    mocks.transaction.mockImplementation((operations: Array<Promise<unknown>>) => Promise.all(operations));
  });

  it("normalizes North American demo phone formats to E.164", () => {
    expect(normalizeNorthAmericanPhone("1.587.987.3814")).toBe("+15879873814");
    expect(normalizeNorthAmericanPhone("(587) 987-3814")).toBe("+15879873814");
    expect(normalizeNorthAmericanPhone("+15879873814")).toBe("+15879873814");
  });

  it("stays blocked by default", () => {
    const status = getLiveTestSmsStatus({});

    expect(status.enabled).toBe(false);
    expect(status.blockers).toEqual(
      expect.arrayContaining([
        "LIVE_TEST_SMS_DISABLED",
        "LIVE_MESSAGING_DISABLED",
        "TWILIO_PROVIDER_NOT_SELECTED",
        "TWILIO_ENV_CREDENTIALS_INCOMPLETE",
        "LIVE_TEST_SMS_ALLOWLIST_EMPTY",
        "LIVE_TEST_SMS_OPERATOR_TOKEN_INVALID"
      ])
    );
  });

  it("enables only with explicit live Twilio settings and allowlisted recipients", () => {
    const status = getLiveTestSmsStatus({
      LIVE_TEST_SMS_ENABLED: "true",
      LIVE_MESSAGING_ENABLED: "true",
      MESSAGING_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "AC_test",
      TWILIO_AUTH_TOKEN: "secret",
      TWILIO_FROM_NUMBER: "+15555550199",
      LIVE_TEST_SMS_TO_ALLOWLIST: "1.587.987.3814",
      LIVE_TEST_SMS_OPERATOR_TOKEN: operatorToken
    });

    expect(status).toMatchObject({
      enabled: true,
      allowedRecipientCount: 1,
      allowedRecipientLast4: ["3814"],
      fromNumberConfigured: true,
      fromNumberLast4: "0199",
      blockers: []
    });
    expect(JSON.stringify(status)).not.toContain("secret");
    expect(JSON.stringify(status)).not.toContain("+15879873814");
    expect(JSON.stringify(status)).not.toContain("+15555550199");
    expect(JSON.stringify(status)).not.toContain(operatorToken);
  });

  it("filters invalid allowlist entries", () => {
    expect(parseLiveTestSmsAllowlist({ LIVE_TEST_SMS_TO_ALLOWLIST: "nope,+15879873814" })).toEqual([
      "+15879873814"
    ]);
  });

  it("accepts live-test payload shape before gate evaluation", () => {
    expect(
      liveTestSmsSchema.safeParse({
        requestId,
        to: "+15879873814",
        body: "Hello",
        confirmation: liveTestSmsConfirmation,
        operatorToken
      }).success
    ).toBe(true);
    expect(
      liveTestSmsSchema.safeParse({
        requestId,
        to: "+15879873814",
        body: "Hello",
        confirmation: "send",
        operatorToken
      }).success
    ).toBe(true);
    expect(
      liveTestSmsSchema.safeParse({
        requestId,
        to: "+15879873814",
        body: "Hello",
        confirmation: liveTestSmsConfirmation,
        operatorToken: "too-short"
      }).success
    ).toBe(false);
  });

  it("requires the configured operator token before looking up or reserving a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendLiveTestSms(sendInput({ operatorToken: "x".repeat(32) }))).resolves.toEqual({
      sent: false,
      blockers: ["LIVE_TEST_SMS_OPERATOR_AUTH_FAILED"]
    });
    await expect(
      sendLiveTestSms(
        sendInput({
          env: { ...liveEnv, LIVE_TEST_SMS_OPERATOR_TOKEN: "short" }
        })
      )
    ).resolves.toEqual({
      sent: false,
      blockers: ["LIVE_TEST_SMS_OPERATOR_TOKEN_INVALID"]
    });

    expect(mocks.messageFindUnique).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks sends when the exact confirmation phrase is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendLiveTestSms(sendInput({ confirmation: "send" }))
    ).resolves.toMatchObject({
      sent: false,
      blockers: expect.arrayContaining(["LIVE_TEST_CONFIRMATION_MISMATCH"])
    });

    expect(mocks.messageFindUnique).toHaveBeenCalledTimes(1);
    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reserves before Twilio and records the normalized accepted outcome", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      statusText: "Created",
      json: async () => ({
        sid: "SM_live_test",
        status: " ACCEPTED "
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendLiveTestSms(sendInput({ to: "1.587.987.3814" }))
    ).resolves.toMatchObject({
      sent: true,
      duplicate: false,
      providerMessageId: "SM_live_test",
      providerStatus: "accepted",
      toLast4: "3814",
      fromLast4: "0199",
      blockers: []
    });

    const reservedMessageId = mocks.messageCreate.mock.calls[0][0].data.id;
    expect(reservedMessageId).toEqual(expect.any(String));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fetchCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(fetchCall[1]).toMatchObject({ signal: expect.any(AbortSignal) });
    expect(timeoutSpy).toHaveBeenCalledWith(5000);
    expect(mocks.messageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: reservedMessageId,
        orgId: "org_1",
        direction: "OUTBOUND",
        body: "Hello from the gated local test path",
        providerStatus: "live_test_reserved",
        idempotencyKey: `live-test-sms:${requestId}`
      }),
      select: { id: true }
    });
    expect(mocks.readinessAuditCreate).toHaveBeenNthCalledWith(1, {
      data: {
        orgId: "org_1",
        actorUserId: "user_1",
        action: "LIVE_TEST_SMS_RESERVED",
        subjectType: "Message",
        subjectId: reservedMessageId,
        metadata: {
          requestFingerprintVersion: "hmac-sha256-v2",
          requestFingerprint: requestFingerprint(),
          toLast4: "3814",
          fromLast4: "0199",
          bodyLength: 36
        }
      }
    });
    const reservationMetadata = mocks.readinessAuditCreate.mock.calls[0][0].data.metadata;
    expect(reservationMetadata.requestFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(reservationMetadata)).not.toContain("+15879873814");
    expect(JSON.stringify(reservationMetadata)).not.toContain("Hello from the gated local test path");
    expect(JSON.stringify(mocks.messageCreate.mock.calls)).not.toContain(operatorToken);
    expect(JSON.stringify(mocks.readinessAuditCreate.mock.calls)).not.toContain(operatorToken);
    expect(mocks.transaction.mock.calls[0][0]).toHaveLength(2);
    expect(mocks.messageCreate.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expect(mocks.transaction.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expect(mocks.messageUpdate).toHaveBeenCalledWith({
      where: { id: reservedMessageId, orgId: "org_1" },
      data: {
        providerMessageId: "SM_live_test",
        providerStatus: "accepted",
        providerErrorCode: null,
        failedAt: null
      }
    });
    expect(mocks.readinessAuditCreate).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        orgId: "org_1",
        actorUserId: "user_1",
        action: "LIVE_TEST_SMS_SENT",
        subjectId: reservedMessageId,
        metadata: expect.objectContaining({
          provider: "twilio",
          providerStatus: "accepted",
          toLast4: "3814",
          fromLast4: "0199"
        })
      })
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    timeoutSpy.mockRestore();
  });

  it("returns a stored successful outcome without a second provider call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.messageFindUnique.mockResolvedValue({
      id: "message_stored",
      providerMessageId: "SM_stored",
      providerStatus: "accepted",
      providerErrorCode: null,
      failedAt: null
    });
    mocks.readinessAuditFindFirst.mockResolvedValue(reservationAudit());

    await expect(
      sendLiveTestSms(
        sendInput({
          env: { LIVE_TEST_SMS_OPERATOR_TOKEN: operatorToken },
          to: "1.587.987.3814",
          body: "  Hello from the gated local test path  "
        })
      )
    ).resolves.toMatchObject({
      sent: true,
      duplicate: true,
      providerMessageId: "SM_stored",
      providerStatus: "accepted",
      toLast4: "3814",
      fromLast4: "0199"
    });

    expect(mocks.messageFindUnique).toHaveBeenCalledWith({
      where: {
        orgId_idempotencyKey: {
          orgId: "org_1",
          idempotencyKey: `live-test-sms:${requestId}`
        }
      }
    });
    expect(mocks.readinessAuditFindFirst).toHaveBeenCalledWith({
      where: {
        orgId: "org_1",
        action: "LIVE_TEST_SMS_RESERVED",
        subjectType: "Message",
        subjectId: "message_stored"
      },
      orderBy: { createdAt: "asc" },
      select: { actorUserId: true, metadata: true }
    });
    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when an existing key has no valid reservation audit", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.messageFindUnique.mockResolvedValue({
      id: "message_without_evidence",
      providerMessageId: "SM_stored",
      providerStatus: "accepted",
      providerErrorCode: null,
      failedAt: null
    });

    await expect(sendLiveTestSms(sendInput())).resolves.toMatchObject({
      sent: false,
      duplicate: true,
      conflict: true
    });

    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["actor", { actorUserId: "user_2" }],
    ["recipient", { to: "+15879873815" }],
    ["body", { body: "A different request body" }]
  ])("rejects reuse of a request ID with a different %s", async (_field, overrides) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.messageFindUnique.mockResolvedValue({
      id: "message_stored",
      providerMessageId: "SM_stored",
      providerStatus: "accepted",
      providerErrorCode: null,
      failedAt: null
    });
    mocks.readinessAuditFindFirst.mockResolvedValue(reservationAudit());

    await expect(sendLiveTestSms(sendInput(overrides))).resolves.toEqual({
      sent: false,
      duplicate: true,
      conflict: true,
      error: "Idempotency key cannot be reused for this live test SMS request.",
      blockers: []
    });

    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns stored failed and pending outcomes without another provider call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.messageFindUnique
      .mockResolvedValueOnce({
        id: "message_failed",
        providerMessageId: null,
        providerStatus: "failed",
        providerErrorCode: "TWILIO_21614",
        failedAt: new Date("2026-07-10T00:00:00.000Z")
      })
      .mockResolvedValueOnce({
        id: "message_pending",
        providerMessageId: null,
        providerStatus: "live_test_reserved",
        providerErrorCode: null,
        failedAt: null
      });
    mocks.readinessAuditFindFirst.mockResolvedValue(reservationAudit());

    await expect(sendLiveTestSms(sendInput())).resolves.toMatchObject({
      sent: false,
      duplicate: true,
      failed: true,
      providerErrorCode: "TWILIO_21614",
      toLast4: "3814",
      fromLast4: "0199"
    });
    await expect(sendLiveTestSms(sendInput())).resolves.toMatchObject({
      sent: false,
      duplicate: true,
      pending: true,
      providerStatus: "live_test_reserved",
      toLast4: "3814",
      fromLast4: "0199"
    });

    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-reads a concurrent reservation race and does not call Twilio", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.messageFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "message_raced",
        providerMessageId: "SM_raced",
        providerStatus: "queued",
        providerErrorCode: null,
        failedAt: null
      });
    mocks.readinessAuditFindFirst.mockResolvedValue(reservationAudit());
    mocks.messageCreate.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));

    await expect(sendLiveTestSms(sendInput())).resolves.toMatchObject({
      sent: true,
      duplicate: true,
      providerMessageId: "SM_raced"
    });

    expect(mocks.messageFindUnique).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["network failure", async () => Promise.reject(new TypeError("socket failed with private detail"))],
    ["timeout", async () => Promise.reject(Object.assign(new Error("timed out with private detail"), { name: "TimeoutError" }))],
    [
      "2xx response without a provider identifier",
      async () => ({
        ok: true,
        status: 201,
        statusText: "Created",
        json: async () => ({ status: "queued", message: "private provider detail" })
      })
    ],
    [
      "5xx provider response",
      async () => ({
        ok: false,
        status: 503,
        statusText: "Unavailable",
        json: async () => ({ code: 20503, message: "private provider detail" })
      })
    ],
    [
      "non-2xx response carrying a provider identifier",
      async () => ({
        ok: false,
        status: 409,
        statusText: "Conflict",
        json: async () => ({ sid: "SM_ambiguous", code: 20409, message: "private provider detail" })
      })
    ],
    [
      "4xx response without a validated Twilio error code",
      async () => ({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ message: "private provider detail" })
      })
    ]
  ])("keeps the durable reservation pending after an ambiguous %s", async (_caseName, fetchImplementation) => {
    const fetchMock = vi.fn(fetchImplementation);
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendLiveTestSms(sendInput());

    expect(result).toEqual({
      sent: false,
      duplicate: false,
      pending: true,
      providerStatus: "live_test_reserved",
      toLast4: "3814",
      fromLast4: "0199",
      blockers: []
    });
    expect(JSON.stringify(result)).not.toContain("private detail");
    expect(mocks.messageUpdate).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("keeps the reservation pending when an accepted provider result cannot be persisted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 201,
        statusText: "Created",
        json: async () => ({ sid: "SM_unpersisted", status: "accepted" })
      }))
    );
    mocks.messageUpdate.mockRejectedValueOnce(new Error("database detail"));

    await expect(sendLiveTestSms(sendInput())).resolves.toEqual({
      sent: false,
      duplicate: false,
      pending: true,
      providerStatus: "live_test_reserved",
      toLast4: "3814",
      fromLast4: "0199",
      blockers: []
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });

  it("persists an immediate terminal provider status as a definitive failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 201,
        statusText: "Created",
        json: async () => ({ sid: "SM_terminal", status: " UNDELIVERED " })
      }))
    );

    await expect(sendLiveTestSms(sendInput())).resolves.toEqual({
      sent: false,
      duplicate: false,
      failed: true,
      providerStatus: "undelivered",
      providerErrorCode: "TWILIO_STATUS_UNDELIVERED",
      error: "Twilio live test SMS failed.",
      toLast4: "3814",
      fromLast4: "0199",
      blockers: []
    });

    const reservedMessageId = mocks.messageCreate.mock.calls[0][0].data.id;
    expect(mocks.messageUpdate).toHaveBeenCalledWith({
      where: { id: reservedMessageId, orgId: "org_1" },
      data: {
        providerMessageId: "SM_terminal",
        providerStatus: "undelivered",
        providerErrorCode: "TWILIO_STATUS_UNDELIVERED",
        failedAt: expect.any(Date)
      }
    });
  });

  it("marks the reservation failed with a secret-safe provider code", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ code: 21614, message: "raw provider detail" })
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendLiveTestSms(sendInput())).resolves.toEqual({
      sent: false,
      duplicate: false,
      failed: true,
      providerStatus: "failed",
      providerErrorCode: "TWILIO_21614",
      error: "Twilio live test SMS failed.",
      toLast4: "3814",
      fromLast4: "0199",
      blockers: []
    });

    const reservedMessageId = mocks.messageCreate.mock.calls[0][0].data.id;
    expect(mocks.messageUpdate).toHaveBeenCalledWith({
      where: { id: reservedMessageId, orgId: "org_1" },
      data: {
        providerStatus: "failed",
        providerErrorCode: "TWILIO_21614",
        failedAt: expect.any(Date)
      }
    });
    expect(JSON.stringify(mocks.messageUpdate.mock.calls)).not.toContain("raw provider detail");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.readinessAuditCreate).toHaveBeenCalledTimes(1);
    expect(mocks.readinessAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "LIVE_TEST_SMS_RESERVED", subjectId: reservedMessageId })
    });
  });
});
