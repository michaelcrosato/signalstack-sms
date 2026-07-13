import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { replayCustomerWebhookDelivery } from "@/lib/integrations/customer-webhooks/service";

const NOW = new Date("2026-07-10T12:00:00.000Z");

describe("customer webhook service topology serialization", () => {
  it("locks the endpoint and replay generation before re-reading the active secret", async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce({ endpointId: "endpoint_1", eventId: "event_1" })
      .mockResolvedValueOnce(originalDelivery("ACTIVE", "secret_2", 2))
      .mockResolvedValueOnce({ generation: 1 });
    const create = vi.fn().mockResolvedValue(replayDelivery("secret_2"));
    const queryRaw = vi.fn().mockResolvedValue([{ id: "endpoint_1" }]);
    const executeRaw = vi.fn().mockResolvedValue(0);
    const tx = replayTransaction({ findFirst, create, queryRaw, executeRaw });

    const replay = await replayCustomerWebhookDelivery(
      { orgId: "org_1", deliveryId: "delivery_1", actor: { kind: "system" } },
      tx
    );

    expect(replay).toMatchObject({ id: "delivery_2", generation: 2, attempts: [] });
    expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(executeRaw.mock.invocationCallOrder[0]);
    expect(executeRaw.mock.invocationCallOrder[0]).toBeLessThan(findFirst.mock.invocationCallOrder[1]);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        endpointId: "endpoint_1",
        eventId: "event_1",
        signingSecretId: "secret_2",
        generation: 2
      })
    }));
  });

  it("rechecks disabled topology under the lock and refuses to enqueue a replay", async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce({ endpointId: "endpoint_1", eventId: "event_1" })
      .mockResolvedValueOnce(originalDelivery("DISABLED", "secret_2", 2));
    const create = vi.fn();
    const tx = replayTransaction({
      findFirst,
      create,
      queryRaw: vi.fn().mockResolvedValue([{ id: "endpoint_1" }]),
      executeRaw: vi.fn().mockResolvedValue(0)
    });

    await expect(
      replayCustomerWebhookDelivery(
        { orgId: "org_1", deliveryId: "delivery_1", actor: { kind: "system" } },
        tx
      )
    ).rejects.toMatchObject({ code: "WEBHOOK_REPLAY_NOT_ALLOWED" });
    expect(create).not.toHaveBeenCalled();
  });
});

function originalDelivery(status: "ACTIVE" | "DISABLED", secretId: string, version: number) {
  return {
    id: "delivery_1",
    orgId: "org_1",
    endpointId: "endpoint_1",
    subscriptionId: "subscription_1",
    eventId: "event_1",
    generation: 1,
    status: "FAILED",
    subscription: {
      endpoint: { status },
      signingSecrets: [{ id: secretId, version }]
    },
    event: { id: "event_1" }
  };
}

function replayDelivery(signingSecretId: string) {
  return {
    id: "delivery_2",
    orgId: "org_1",
    endpointId: "endpoint_1",
    subscriptionId: "subscription_1",
    eventId: "event_1",
    signingSecretId,
    status: "PENDING",
    attemptCount: 0,
    maxAttempts: 8,
    nextAttemptAt: NOW,
    processingToken: null,
    processingExpiresAt: null,
    generation: 2,
    replayOfDeliveryId: "delivery_1",
    deliveredAt: null,
    failedAt: null,
    lastStatusCode: null,
    lastErrorCode: null,
    createdAt: NOW,
    updatedAt: NOW,
    event: { type: "contact.created" },
    attempts: []
  };
}

function replayTransaction(input: Readonly<{
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  queryRaw: ReturnType<typeof vi.fn>;
  executeRaw: ReturnType<typeof vi.fn>;
}>): Prisma.TransactionClient {
  return {
    $queryRaw: input.queryRaw,
    $executeRaw: input.executeRaw,
    customerWebhookDelivery: { findFirst: input.findFirst, create: input.create },
    integrationAuditEvent: { create: vi.fn().mockResolvedValue({}) }
  } as unknown as Prisma.TransactionClient;
}
