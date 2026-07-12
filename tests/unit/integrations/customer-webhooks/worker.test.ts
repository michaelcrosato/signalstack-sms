import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerWebhookDeliveryClaim } from "@/lib/db/customer-webhook-dispatch";
import { classifyCustomerWebhookAttempt } from "@/lib/integrations/customer-webhooks/delivery-policy";
import { createCustomerWebhookSigningSecret } from "@/lib/integrations/customer-webhooks/signing-secrets";
import { verifyCustomerWebhookSignature } from "@/lib/integrations/customer-webhooks/signatures";
import { CustomerWebhookTransportError } from "@/lib/integrations/customer-webhooks/transport";
import {
  finalizeClaimedCustomerWebhookDelivery,
  prepareClaimedCustomerWebhookDelivery,
  processClaimedCustomerWebhookDelivery,
  processDueCustomerWebhookDeliveries,
  runContinuousCustomerWebhookWorker,
  type CustomerWebhookFinalizationEvidence,
  type CustomerWebhookTenantTransactionRunner,
  type PreparedCustomerWebhookDelivery
} from "@/lib/integrations/customer-webhooks/worker";

const loggerMocks = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: loggerMocks.error }
}));

const MASTER_KEY = Buffer.alloc(32, 0x37);
const PROCESSING_TOKEN = "123e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-10T12:34:56.789Z");
const REQUEST_TIMESTAMP = new Date("2026-07-10T12:34:55.000Z");
const STARTED_AT = new Date("2026-07-10T12:34:55.000Z");
const FINISHED_AT = new Date("2026-07-10T12:34:57.000Z");
const claim: CustomerWebhookDeliveryClaim = Object.freeze({
  deliveryId: "delivery_1",
  expectedOrgId: "org_1",
  processingToken: PROCESSING_TOKEN
});

describe("customer webhook worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signs and posts the exact immutable body with only the contracted identity headers", async () => {
    const prepared = preparedDelivery();
    const post = vi.fn().mockResolvedValue({ statusCode: 204, retryAfter: null, body: Buffer.from("ignored") });
    const finalize = vi.fn().mockResolvedValue(true);

    await expect(processClaimedCustomerWebhookDelivery(claim, {
      prepare: vi.fn().mockResolvedValue(prepared),
      post,
      finalize,
      now: () => NOW,
      environment: { SECRETS_MASTER_KEY: MASTER_KEY.toString("base64") }
    })).resolves.toBe("delivered");

    const request = post.mock.calls[0]![0];
    expect(request.endpointUrl).toBe("https://hooks.example.com/events");
    expect(request.rawBody).toEqual(Buffer.from(prepared.payloadText, "utf8"));
    expect(Object.keys(request.headers).sort()).toEqual([
      "User-Agent",
      "X-SignalStack-Delivery-Id",
      "X-SignalStack-Event-Id",
      "X-SignalStack-Event-Type",
      "X-SignalStack-Secret-Version",
      "X-SignalStack-Signature",
      "X-SignalStack-Timestamp"
    ]);
    expect(request.headers).toMatchObject({
      "User-Agent": "SignalStack-Customer-Webhooks/1",
      "X-SignalStack-Delivery-Id": claim.deliveryId,
      "X-SignalStack-Event-Id": prepared.eventId,
      "X-SignalStack-Event-Type": prepared.eventType,
      "X-SignalStack-Secret-Version": prepared.secretVersion.toString(),
      "X-SignalStack-Timestamp": "1783686895"
    });
    expect(verifyCustomerWebhookSignature({
      secret: preparedReceiverSecret(),
      timestampHeader: request.headers["X-SignalStack-Timestamp"],
      signatureHeader: request.headers["X-SignalStack-Signature"],
      rawBody: request.rawBody,
      nowSeconds: 1_783_686_895
    })).toBe(true);

    const [finalizedClaim, finalizedPrepared, decision, evidence] = finalize.mock.calls[0]!;
    expect(finalizedClaim).toBe(claim);
    expect(finalizedPrepared).toBe(prepared);
    expect(decision).toMatchObject({ outcome: "delivered", reason: "acknowledged" });
    expect(evidence).toEqual({
      requestTimestamp: REQUEST_TIMESTAMP,
      statusCode: 204,
      errorCode: undefined
    });
    expect(evidence).not.toHaveProperty("body");
  });

  it("honors retry classification without persisting a receiver response body", async () => {
    const prepared = preparedDelivery();
    const finalize = vi.fn().mockResolvedValue(true);
    const post = vi.fn().mockResolvedValue({
      statusCode: 429,
      retryAfter: "120",
      body: Buffer.from("private receiver diagnostics")
    });

    await expect(processClaimedCustomerWebhookDelivery(claim, {
      prepare: vi.fn().mockResolvedValue(prepared),
      post,
      finalize,
      now: () => NOW,
      environment: { SECRETS_MASTER_KEY: MASTER_KEY.toString("hex") }
    })).resolves.toBe("retry");

    expect(finalize.mock.calls[0]![2]).toMatchObject({
      outcome: "retry",
      reason: "retryable-status",
      retryDelaySeconds: 120,
      retryAfterAccepted: true
    });
    expect(finalize.mock.calls[0]![3]).toEqual({
      requestTimestamp: REQUEST_TIMESTAMP,
      statusCode: 429,
      errorCode: undefined
    });
  });

  it.each([
    {
      name: "410 receiver acknowledgement",
      postResult: { statusCode: 410, retryAfter: null, body: Buffer.alloc(0) },
      expectedReason: "receiver-gone",
      expectedError: undefined
    },
    {
      name: "newly unsafe destination",
      postError: new CustomerWebhookTransportError("UNSAFE_ENDPOINT", "unsafe"),
      expectedReason: "unsafe-endpoint",
      expectedError: "UNSAFE_ENDPOINT"
    }
  ])("turns $name into immediate endpoint disablement", async ({ postResult, postError, expectedReason, expectedError }) => {
    const finalize = vi.fn().mockResolvedValue(true);
    const post = postError ? vi.fn().mockRejectedValue(postError) : vi.fn().mockResolvedValue(postResult);

    await expect(processClaimedCustomerWebhookDelivery(claim, {
      prepare: vi.fn().mockResolvedValue(preparedDelivery()),
      post,
      finalize,
      now: () => NOW,
      environment: { SECRETS_MASTER_KEY: MASTER_KEY.toString("base64") }
    })).resolves.toBe("failed");

    expect(finalize.mock.calls[0]![2]).toMatchObject({ outcome: "disable", reason: expectedReason });
    expect(finalize.mock.calls[0]![3].errorCode).toBe(expectedError);
  });

  it.each(["INVALID_REQUEST", "RESPONSE_TOO_LARGE"] as const)(
    "treats transport %s as permanent rather than wasting retries",
    async (code) => {
      const finalize = vi.fn().mockResolvedValue(true);

      await expect(processClaimedCustomerWebhookDelivery(claim, {
        prepare: vi.fn().mockResolvedValue(preparedDelivery()),
        post: vi.fn().mockRejectedValue(new CustomerWebhookTransportError(code, "permanent")),
        finalize,
        now: () => NOW,
        environment: { SECRETS_MASTER_KEY: MASTER_KEY.toString("base64") }
      })).resolves.toBe("failed");

      expect(finalize.mock.calls[0]![2]).toMatchObject({ outcome: "failed", reason: "permanent-status" });
      expect(finalize.mock.calls[0]![3].errorCode).toBe(code);
    }
  );

  it("fails closed before transport when the persisted secret binding or envelope version is wrong", async () => {
    for (const prepared of [
      { ...preparedDelivery(), secretId: "different_secret" },
      {
        ...preparedDelivery(),
        envelope: { ...preparedDelivery().envelope, envelopeVersion: 2 }
      }
    ]) {
      const post = vi.fn();
      const finalize = vi.fn().mockResolvedValue(true);

      await expect(processClaimedCustomerWebhookDelivery(claim, {
        prepare: vi.fn().mockResolvedValue(prepared),
        post,
        finalize,
        now: () => NOW,
        environment: { SECRETS_MASTER_KEY: MASTER_KEY.toString("base64") }
      })).resolves.toBe("failed");

      expect(post).not.toHaveBeenCalled();
      expect(finalize.mock.calls[0]![2]).toMatchObject({ outcome: "failed" });
      expect(finalize.mock.calls[0]![3].errorCode).toMatch(
        /SIGNING_SECRET_DECRYPTION_FAILED|UNSUPPORTED_SIGNING_ENVELOPE/
      );
    }
  });

  it("fails closed before transport if the immutable payload no longer matches its stored hash", async () => {
    const post = vi.fn();
    const finalize = vi.fn().mockResolvedValue(true);

    await expect(processClaimedCustomerWebhookDelivery(claim, {
      prepare: vi.fn().mockResolvedValue({ ...preparedDelivery(), payloadText: "{\"tampered\":true}" }),
      post,
      finalize,
      now: () => NOW,
      environment: { SECRETS_MASTER_KEY: MASTER_KEY.toString("base64") }
    })).resolves.toBe("failed");

    expect(post).not.toHaveBeenCalled();
    expect(finalize.mock.calls[0]![3].errorCode).toBe("EVENT_PAYLOAD_INTEGRITY_FAILED");
  });

  it("makes an ambiguous receiver acknowledgement safely retryable with stable delivery and event identities", async () => {
    const prepared = preparedDelivery();
    const post = vi.fn().mockResolvedValue({ statusCode: 200, retryAfter: null, body: Buffer.alloc(0) });
    const finalize = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const dependencies = {
      prepare: vi.fn().mockResolvedValue(prepared),
      post,
      finalize,
      now: () => NOW,
      environment: { SECRETS_MASTER_KEY: MASTER_KEY.toString("base64") }
    };

    await expect(processClaimedCustomerWebhookDelivery(claim, dependencies)).resolves.toBe("skipped");
    await expect(processClaimedCustomerWebhookDelivery(claim, dependencies)).resolves.toBe("delivered");

    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0]![0].rawBody).toEqual(post.mock.calls[1]![0].rawBody);
    expect(post.mock.calls[0]![0].headers).toEqual(post.mock.calls[1]![0].headers);
    expect(post.mock.calls[0]![0].headers).toMatchObject({
      "X-SignalStack-Delivery-Id": claim.deliveryId,
      "X-SignalStack-Event-Id": prepared.eventId
    });
  });

  it("fully closes the preparation transaction before network I/O and finalizes afterward", async () => {
    const phases: string[] = [];
    let transactionActive = false;
    const prepare = vi.fn().mockImplementation(async () => {
      transactionActive = true;
      phases.push("prepare-transaction");
      transactionActive = false;
      return preparedDelivery();
    });
    const post = vi.fn().mockImplementation(async () => {
      expect(transactionActive).toBe(false);
      phases.push("network");
      return { statusCode: 204, retryAfter: null, body: Buffer.alloc(0) };
    });
    const finalize = vi.fn().mockImplementation(async () => {
      expect(transactionActive).toBe(false);
      phases.push("finalize-transaction");
      return true;
    });

    await processClaimedCustomerWebhookDelivery(claim, {
      prepare,
      post,
      finalize,
      now: () => NOW,
      environment: { SECRETS_MASTER_KEY: MASTER_KEY.toString("base64") }
    });

    expect(phases).toEqual(["prepare-transaction", "network", "finalize-transaction"]);
  });

  it("prepares only a live token lease, renews its network budget, and does not burn an attempt", async () => {
    const deliveryUpdate = vi.fn();
    const findFirst = vi.fn().mockResolvedValue(databaseDelivery());
    const attemptCreate = vi.fn().mockResolvedValue({ id: "attempt_1" });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ now: STARTED_AT }]),
      customerWebhookDelivery: { findFirst, update: deliveryUpdate },
      customerWebhookDeliveryAttempt: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: attemptCreate,
        updateMany: vi.fn()
      }
    } as unknown as Prisma.TransactionClient;

    const prepared = await prepareClaimedCustomerWebhookDelivery(claim, { transaction: transactionFor(tx) });

    expect(prepared).toMatchObject({
      orgId: claim.expectedOrgId,
      deliveryId: claim.deliveryId,
      attemptNumber: 1,
      maxAttempts: 8,
      generation: 1,
      attemptId: "attempt_1",
      requestTimestamp: new Date("2026-07-10T12:34:55.000Z"),
      payloadHash: preparedDelivery().payloadHash
    });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        orgId: claim.expectedOrgId,
        id: claim.deliveryId,
        status: "PROCESSING",
        processingToken: claim.processingToken
      })
    }));
    expect(deliveryUpdate).toHaveBeenCalledWith({
      where: { id: claim.deliveryId },
      data: { processingExpiresAt: new Date("2026-07-10T12:35:25.000Z") }
    });
    expect(deliveryUpdate.mock.calls[0]![0].data).not.toHaveProperty("attemptCount");
    expect(attemptCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attemptNumber: 1,
        requestTimestamp: new Date("2026-07-10T12:34:55.000Z"),
        outcome: null,
        finishedAt: null
      }),
      select: { id: true }
    });

    const expiredTx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ now: STARTED_AT }]),
      customerWebhookDelivery: {
        findFirst: vi.fn().mockResolvedValue({
          ...databaseDelivery(),
          processingExpiresAt: new Date(STARTED_AT.getTime())
        }),
        update: vi.fn()
      }
    } as unknown as Prisma.TransactionClient;
    await expect(
      prepareClaimedCustomerWebhookDelivery(claim, { transaction: transactionFor(expiredTx) })
    ).resolves.toBeNull();
  });

  it("does not start network work after the endpoint was disabled", async () => {
    const deliveryUpdate = vi.fn();
    const disabled = databaseDelivery("DISABLED");
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([]),
      customerWebhookDelivery: {
        findFirst: vi.fn().mockResolvedValue(disabled),
        update: deliveryUpdate
      }
    } as unknown as Prisma.TransactionClient;

    await expect(
      prepareClaimedCustomerWebhookDelivery(claim, { transaction: transactionFor(tx) })
    ).resolves.toBeNull();
    expect(deliveryUpdate).not.toHaveBeenCalled();
  });

  it("closes an abandoned reservation as ambiguous before allocating the next attempt", async () => {
    const deliveryUpdate = vi.fn().mockResolvedValue({});
    const attemptUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const attemptCreate = vi.fn().mockResolvedValue({ id: "attempt_2" });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ now: STARTED_AT }]),
      customerWebhookDelivery: {
        findFirst: vi.fn().mockResolvedValue(databaseDelivery()),
        update: deliveryUpdate
      },
      customerWebhookDeliveryAttempt: {
        findFirst: vi.fn().mockResolvedValue({
          id: "attempt_1",
          attemptNumber: 1,
          outcome: null,
          finishedAt: null
        }),
        updateMany: attemptUpdate,
        create: attemptCreate
      }
    } as unknown as Prisma.TransactionClient;

    const prepared = await prepareClaimedCustomerWebhookDelivery(claim, {
      transaction: transactionFor(tx)
    });

    expect(attemptUpdate).toHaveBeenCalledWith({
      where: { id: "attempt_1", outcome: null, finishedAt: null },
      data: {
        outcome: "ambiguous",
        errorCode: "WORKER_LEASE_EXPIRED",
        finishedAt: STARTED_AT
      }
    });
    expect(attemptCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ attemptNumber: 2, outcome: null, finishedAt: null }),
      select: { id: true }
    });
    expect(prepared).toMatchObject({ attemptId: "attempt_2", attemptNumber: 2 });
    expect(deliveryUpdate).toHaveBeenCalledWith({
      where: { id: claim.deliveryId },
      data: { attemptCount: 1, lastErrorCode: "WORKER_LEASE_EXPIRED" }
    });
  });

  it("records an abandoned final attempt as ambiguous and exhausts without another post", async () => {
    const delivery = { ...databaseDelivery(), maxAttempts: 1 };
    const deliveryUpdate = vi.fn().mockResolvedValue({});
    const attemptCreate = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ now: STARTED_AT }]),
      customerWebhookDelivery: {
        findFirst: vi.fn().mockResolvedValue(delivery),
        update: deliveryUpdate
      },
      customerWebhookDeliveryAttempt: {
        findFirst: vi.fn().mockResolvedValue({ id: "attempt_1", attemptNumber: 1 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: attemptCreate
      }
    } as unknown as Prisma.TransactionClient;

    await expect(
      prepareClaimedCustomerWebhookDelivery(claim, { transaction: transactionFor(tx) })
    ).resolves.toBeNull();
    expect(attemptCreate).not.toHaveBeenCalled();
    expect(deliveryUpdate).toHaveBeenCalledWith({
      where: { id: claim.deliveryId },
      data: expect.objectContaining({
        status: "FAILED",
        attemptCount: 1,
        processingToken: null,
        processingExpiresAt: null,
        failedAt: STARTED_AT,
        lastErrorCode: "AMBIGUOUS_ATTEMPT_EXHAUSTED"
      })
    });
  });

  it("finalizes a retry atomically with one append-only attempt and the incremented attempt count", async () => {
    const fixtures = finalizationTransaction({ consecutiveFailures: 3 });
    const decision = classifyCustomerWebhookAttempt({
      attemptNumber: 1,
      maxAttempts: 8,
      statusCode: 500,
      nowMilliseconds: NOW.getTime()
    });
    const evidence: CustomerWebhookFinalizationEvidence = {
      requestTimestamp: REQUEST_TIMESTAMP,
      statusCode: 500
    };

    await expect(finalizeClaimedCustomerWebhookDelivery(
      claim,
      preparedDelivery(),
      decision,
      evidence,
      { transaction: fixtures.transaction }
    )).resolves.toBe(true);

    expect(fixtures.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        processingToken: claim.processingToken,
        generation: 1,
        attemptCount: 0
      })
    }));
    expect(fixtures.attemptComplete).toHaveBeenCalledWith({
      where: { id: "attempt_1", outcome: null, finishedAt: null },
      data: expect.objectContaining({
        statusCode: 500,
        outcome: "retry",
        finishedAt: FINISHED_AT
      })
    });
    expect(fixtures.deliveryUpdate).toHaveBeenCalledWith({
      where: { id: claim.deliveryId },
      data: expect.objectContaining({
        status: "PENDING",
        attemptCount: 1,
        processingToken: null,
        processingExpiresAt: null,
        nextAttemptAt: new Date("2026-07-10T12:35:27.000Z")
      })
    });
    expect(fixtures.endpointUpdate).not.toHaveBeenCalled();
  });

  it("rejects stale-token finalization without writing attempt history or delivery state", async () => {
    const fixtures = finalizationTransaction({ delivery: null });

    await expect(finalizeClaimedCustomerWebhookDelivery(
      claim,
      preparedDelivery(),
      classifyCustomerWebhookAttempt({ attemptNumber: 1, maxAttempts: 8, statusCode: 200 }),
      { requestTimestamp: REQUEST_TIMESTAMP, statusCode: 200 },
      { transaction: fixtures.transaction }
    )).resolves.toBe(false);

    expect(fixtures.attemptComplete).not.toHaveBeenCalled();
    expect(fixtures.deliveryUpdate).not.toHaveBeenCalled();
    expect(fixtures.endpointUpdate).not.toHaveBeenCalled();
  });

  it("retains an in-flight attempt and cancels its retry after concurrent disablement", async () => {
    const fixtures = finalizationTransaction({ endpointStatus: "DISABLED" });
    const decision = classifyCustomerWebhookAttempt({
      attemptNumber: 1,
      maxAttempts: 8,
      statusCode: 500,
      nowMilliseconds: NOW.getTime()
    });

    await expect(
      finalizeClaimedCustomerWebhookDelivery(
        claim,
        preparedDelivery(),
        decision,
        { requestTimestamp: REQUEST_TIMESTAMP, statusCode: 500 },
        { transaction: fixtures.transaction }
      )
    ).resolves.toBe(true);

    expect(fixtures.attemptComplete).toHaveBeenCalledWith({
      where: { id: "attempt_1", outcome: null, finishedAt: null },
      data: expect.objectContaining({ outcome: "retry", statusCode: 500 })
    });
    expect(fixtures.deliveryUpdate).toHaveBeenCalledWith({
      where: { id: claim.deliveryId },
      data: expect.objectContaining({
        status: "CANCELED",
        attemptCount: 1,
        processingToken: null,
        processingExpiresAt: null,
        lastStatusCode: 500,
        lastErrorCode: "ENDPOINT_DISABLED"
      })
    });
    expect(fixtures.endpointUpdate).not.toHaveBeenCalled();
  });

  it("resets terminal failure state after successful delivery", async () => {
    const fixtures = finalizationTransaction({ consecutiveFailures: 7 });

    await finalizeClaimedCustomerWebhookDelivery(
      claim,
      preparedDelivery(),
      classifyCustomerWebhookAttempt({ attemptNumber: 1, maxAttempts: 8, statusCode: 204 }),
      { requestTimestamp: REQUEST_TIMESTAMP, statusCode: 204 },
      { transaction: fixtures.transaction }
    );

    expect(fixtures.deliveryUpdate).toHaveBeenCalledWith({
      where: { id: claim.deliveryId },
      data: expect.objectContaining({
        status: "DELIVERED",
        attemptCount: 1,
        processingToken: null,
        processingExpiresAt: null,
        deliveredAt: FINISHED_AT,
        failedAt: null
      })
    });
    expect(fixtures.endpointUpdate).toHaveBeenCalledWith({
      where: { id: "endpoint_1" },
      data: { consecutiveFailures: 0, lastSuccessAt: FINISHED_AT }
    });
  });

  it.each([
    { name: "410", consecutiveFailures: 0, statusCode: 410 },
    { name: "tenth terminal failure", consecutiveFailures: 9, statusCode: 400 }
  ])("disables and cancels remaining work after $name", async ({ consecutiveFailures, statusCode }) => {
    const fixtures = finalizationTransaction({ consecutiveFailures });
    const enqueueEvent = vi.fn().mockResolvedValue({});
    const decision = classifyCustomerWebhookAttempt({ attemptNumber: 1, maxAttempts: 8, statusCode });

    await expect(finalizeClaimedCustomerWebhookDelivery(
      claim,
      preparedDelivery(),
      decision,
      { requestTimestamp: REQUEST_TIMESTAMP, statusCode },
      { transaction: fixtures.transaction, enqueueEvent }
    )).resolves.toBe(true);

    expect(fixtures.deliveryUpdate).toHaveBeenCalledWith({
      where: { id: claim.deliveryId },
      data: expect.objectContaining({
        status: "FAILED",
        attemptCount: 1,
        processingToken: null,
        processingExpiresAt: null,
        failedAt: FINISHED_AT
      })
    });
    expect(fixtures.endpointUpdate).toHaveBeenCalledWith({
      where: { id: "endpoint_1" },
      data: expect.objectContaining({
        consecutiveFailures: consecutiveFailures + 1,
        status: "DISABLED",
        disabledAt: FINISHED_AT
      })
    });
    expect(fixtures.deliveryUpdateMany).toHaveBeenCalledWith({
      where: {
        orgId: claim.expectedOrgId,
        endpointId: "endpoint_1",
        id: { not: claim.deliveryId },
        status: "PENDING"
      },
      data: { status: "CANCELED", processingToken: null, processingExpiresAt: null }
    });
    expect(fixtures.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: claim.expectedOrgId,
        subjectId: "endpoint_1",
        metadata: expect.objectContaining({ consecutiveFailures: consecutiveFailures + 1 })
      })
    });
    expect(enqueueEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      orgId: claim.expectedOrgId,
      type: "webhook.endpoint.disabled",
      aggregateId: "endpoint_1"
    }));
    expect(fixtures.executeRawUnsafe.mock.calls).toEqual([
      ["SAVEPOINT signalstack_customer_webhook_disable_event"],
      ["RELEASE SAVEPOINT signalstack_customer_webhook_disable_event"]
    ]);
  });

  it("keeps safety disablement committable when secondary disabled-event fanout fails", async () => {
    const fixtures = finalizationTransaction();
    const enqueueEvent = vi.fn().mockRejectedValue(new Error("another subscription lacks a secret"));

    await expect(finalizeClaimedCustomerWebhookDelivery(
      claim,
      preparedDelivery(),
      classifyCustomerWebhookAttempt({ attemptNumber: 1, maxAttempts: 8, statusCode: 410 }),
      { requestTimestamp: REQUEST_TIMESTAMP, statusCode: 410 },
      { transaction: fixtures.transaction, enqueueEvent }
    )).resolves.toBe(true);

    expect(fixtures.endpointUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "DISABLED" })
    }));
    expect(fixtures.deliveryUpdateMany).toHaveBeenCalledTimes(1);
    expect(fixtures.executeRawUnsafe.mock.calls).toEqual([
      ["SAVEPOINT signalstack_customer_webhook_disable_event"],
      ["ROLLBACK TO SAVEPOINT signalstack_customer_webhook_disable_event"],
      ["RELEASE SAVEPOINT signalstack_customer_webhook_disable_event"]
    ]);
    expect(loggerMocks.error).toHaveBeenCalledWith(
      "customer_webhook_endpoint_disabled_event_enqueue_failed",
      { errorType: "Error" }
    );
  });

  it("isolates one claimed delivery failure and continues the rest of the batch", async () => {
    const claims = [
      claim,
      { ...claim, deliveryId: "delivery_2" },
      { ...claim, deliveryId: "delivery_3" },
      { ...claim, deliveryId: "delivery_4" }
    ];
    const processClaim = vi.fn()
      .mockResolvedValueOnce("delivered")
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce("retry")
      .mockResolvedValueOnce("failed");

    await expect(processDueCustomerWebhookDeliveries(4, {
      claim: vi.fn().mockResolvedValue(claims),
      processClaim
    })).resolves.toEqual({ claimed: 4, delivered: 1, retried: 1, failed: 1, skipped: 1 });
    expect(processClaim).toHaveBeenCalledTimes(4);
    expect(loggerMocks.error).toHaveBeenCalledWith("customer_webhook_delivery_processing_failed", {
      errorType: "Error"
    });
  });

  it("honors a bounded maxIterations independently of campaign worker gates", async () => {
    const result = { claimed: 0, delivered: 0, retried: 0, failed: 0, skipped: 0 };
    const processDue = vi.fn().mockResolvedValue(result);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const onResult = vi.fn();

    await runContinuousCustomerWebhookWorker(
      { pollIntervalMs: 1, maxDeliveriesPerPoll: 5, maxIterations: 2, onResult },
      { processDue, sleep }
    );

    expect(processDue).toHaveBeenCalledTimes(2);
    expect(processDue).toHaveBeenNthCalledWith(1, 5);
    expect(processDue).toHaveBeenNthCalledWith(2, 5);
    expect(onResult).toHaveBeenNthCalledWith(1, result, 1);
    expect(onResult).toHaveBeenNthCalledWith(2, result, 2);
    expect(sleep).toHaveBeenCalledTimes(1);
    await expect(runContinuousCustomerWebhookWorker(
      { pollIntervalMs: 1, maxDeliveriesPerPoll: 5, maxIterations: 0 },
      { processDue, sleep }
    )).rejects.toThrow("maximum iterations");
  });
});

function preparedReceiverSecret(): string {
  return createSecret().secret;
}

function preparedDelivery(): PreparedCustomerWebhookDelivery {
  const payloadText = '{"apiVersion":"2026-07-10","data":{"contactId":"contact_1"},"id":"event_1","occurredAt":"2026-07-10T12:00:00.000Z","type":"contact.created"}';
  const created = createSecret();
  return Object.freeze({
    orgId: claim.expectedOrgId,
    deliveryId: claim.deliveryId,
    endpointId: "endpoint_1",
    endpointUrl: "https://hooks.example.com/events",
    subscriptionId: "subscription_1",
    eventId: "event_1",
    eventType: "contact.created",
    payloadText,
    payloadHash: createHash("sha256").update(payloadText, "utf8").digest("base64url"),
    secretId: "secret_1",
    secretVersion: 1,
    attemptId: "attempt_1",
    requestTimestamp: REQUEST_TIMESTAMP,
    envelope: created.envelope,
    attemptNumber: 1,
    maxAttempts: 8,
    generation: 1,
    startedAt: STARTED_AT
  });
}

function createSecret() {
  return createCustomerWebhookSigningSecret({
    masterKey: MASTER_KEY,
    keyVersion: 1,
    binding: {
      orgId: claim.expectedOrgId,
      endpointId: "endpoint_1",
      subscriptionId: "subscription_1",
      secretId: "secret_1",
      secretVersion: 1
    },
    dependencies: {
      randomBytes: (size) => Buffer.alloc(size, size === 32 ? 0x11 : 0x22)
    }
  });
}

function databaseDelivery(status: "ACTIVE" | "DISABLED" = "ACTIVE") {
  const prepared = preparedDelivery();
  return {
    id: claim.deliveryId,
    orgId: claim.expectedOrgId,
    endpointId: prepared.endpointId,
    subscriptionId: prepared.subscriptionId,
    eventId: prepared.eventId,
    status: "PROCESSING",
    processingToken: claim.processingToken,
    processingExpiresAt: new Date(STARTED_AT.getTime() + 30_000),
    attemptCount: 0,
    maxAttempts: 8,
    generation: 1,
    event: {
      type: prepared.eventType,
      payloadText: prepared.payloadText,
      payloadHash: prepared.payloadHash
    },
    signingSecret: {
      id: prepared.secretId,
      version: prepared.secretVersion,
      ...prepared.envelope
    },
    subscription: {
      endpoint: {
        status,
        canonicalUrl: prepared.endpointUrl
      }
    }
  };
}

function transactionFor(tx: Prisma.TransactionClient): CustomerWebhookTenantTransactionRunner {
  return (async <T>(_context: Readonly<{ orgId: string }>, operation: (client: Prisma.TransactionClient) => Promise<T>) =>
    operation(tx)) as CustomerWebhookTenantTransactionRunner;
}

function finalizationTransaction(input: Readonly<{
  consecutiveFailures?: number;
  endpointStatus?: "ACTIVE" | "DISABLED";
  delivery?: ReturnType<typeof finalizationDelivery> | null;
}> = {}) {
  const findFirst = vi.fn().mockResolvedValue(
    input.delivery === undefined
      ? finalizationDelivery(input.consecutiveFailures ?? 0, input.endpointStatus ?? "ACTIVE")
      : input.delivery
  );
  const attemptComplete = vi.fn().mockResolvedValue({ count: 1 });
  const deliveryUpdate = vi.fn().mockResolvedValue({});
  const deliveryUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
  const endpointUpdate = vi.fn().mockResolvedValue({});
  const auditCreate = vi.fn().mockResolvedValue({});
  const executeRawUnsafe = vi.fn().mockResolvedValue(0);
  const tx = {
    $queryRaw: vi.fn()
      .mockResolvedValueOnce([{ id: "endpoint_1" }])
      .mockResolvedValueOnce([{ id: claim.deliveryId }])
      .mockResolvedValueOnce([{ now: FINISHED_AT }]),
    $executeRawUnsafe: executeRawUnsafe,
    customerWebhookDelivery: { findFirst, update: deliveryUpdate, updateMany: deliveryUpdateMany },
    customerWebhookDeliveryAttempt: {
      findFirst: vi.fn().mockResolvedValue({ id: "attempt_1" }),
      updateMany: attemptComplete
    },
    customerWebhookEndpoint: { update: endpointUpdate },
    integrationAuditEvent: { create: auditCreate }
  } as unknown as Prisma.TransactionClient;
  return {
    transaction: transactionFor(tx),
    findFirst,
    attemptComplete,
    deliveryUpdate,
    deliveryUpdateMany,
    endpointUpdate,
    auditCreate,
    executeRawUnsafe
  };
}

function finalizationDelivery(
  consecutiveFailures: number,
  status: "ACTIVE" | "DISABLED" = "ACTIVE"
) {
  return {
    id: claim.deliveryId,
    endpointId: "endpoint_1",
    generation: 1,
    subscription: {
      endpoint: { status, consecutiveFailures }
    }
  };
}
