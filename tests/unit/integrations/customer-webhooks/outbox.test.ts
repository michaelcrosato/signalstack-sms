import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { enqueueCustomerWebhookEvent } from "@/lib/integrations/customer-webhooks/outbox";

const NOW = new Date("2026-07-10T12:00:00.000Z");

describe("customer webhook transactional outbox", () => {
  it("locks endpoint topology, rechecks activity, and binds the current signing secret", async () => {
    const subscriptionFindMany = vi.fn()
      .mockResolvedValueOnce([{ endpointId: "endpoint_1" }])
      .mockResolvedValueOnce([
        {
          id: "subscription_1",
          endpointId: "endpoint_1",
          signingSecrets: [{ id: "secret_rotated" }]
        }
      ]);
    const deliveryCreate = vi.fn().mockResolvedValue({});
    const queryRaw = vi.fn()
      .mockResolvedValueOnce([{ now: NOW }])
      .mockResolvedValueOnce([{ id: "endpoint_1" }]);
    const tx = outboxTransaction({ subscriptionFindMany, deliveryCreate, queryRaw });

    const result = await enqueueCustomerWebhookEvent(tx, eventInput());

    expect(result).toMatchObject({ created: true, deliveryCount: 1 });
    expect(subscriptionFindMany).toHaveBeenCalledTimes(2);
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      subscriptionFindMany.mock.invocationCallOrder[1]
    );
    expect(deliveryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        endpointId: "endpoint_1",
        subscriptionId: "subscription_1",
        signingSecretId: "secret_rotated"
      })
    });
  });

  it("does not create a delivery when an endpoint becomes disabled before the locked recheck", async () => {
    const subscriptionFindMany = vi.fn()
      .mockResolvedValueOnce([{ endpointId: "endpoint_1" }])
      .mockResolvedValueOnce([]);
    const deliveryCreate = vi.fn();
    const tx = outboxTransaction({
      subscriptionFindMany,
      deliveryCreate,
      queryRaw: vi.fn().mockResolvedValueOnce([{ now: NOW }]).mockResolvedValueOnce([{ id: "endpoint_1" }])
    });

    const result = await enqueueCustomerWebhookEvent(tx, eventInput());

    expect(result).toMatchObject({ created: true, deliveryCount: 0 });
    expect(deliveryCreate).not.toHaveBeenCalled();
  });
});

function eventInput() {
  return {
    orgId: "org_1",
    deduplicationKey: "message.accepted:message_1",
    type: "message.accepted" as const,
    aggregateType: "message",
    aggregateId: "message_1",
    data: { messageId: "message_1", status: "accepted_dummy" }
  };
}

function outboxTransaction(input: Readonly<{
  subscriptionFindMany: ReturnType<typeof vi.fn>;
  deliveryCreate: ReturnType<typeof vi.fn>;
  queryRaw: ReturnType<typeof vi.fn>;
}>): Prisma.TransactionClient {
  const eventCreate = vi.fn(async ({ data }) => ({ ...data, createdAt: NOW }));
  return {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: input.queryRaw,
    customerWebhookEvent: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: eventCreate
    },
    customerWebhookSubscription: { findMany: input.subscriptionFindMany },
    customerWebhookDelivery: { create: input.deliveryCreate }
  } as unknown as Prisma.TransactionClient;
}
