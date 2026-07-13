import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listWebhookDeliveries } from "@/app/api/v1/webhook-endpoints/[endpointId]/deliveries/route";

const mocks = vi.hoisted(() => ({
  authorizePublicApiRequest: vi.fn(),
  listCustomerWebhookDeliveries: vi.fn()
}));

vi.mock("@/lib/public-api/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-api/request")>()),
  authorizePublicApiRequest: mocks.authorizePublicApiRequest
}));

vi.mock("@/lib/integrations/customer-webhooks/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/customer-webhooks/service")>()),
  listCustomerWebhookDeliveries: mocks.listCustomerWebhookDeliveries
}));

const originalPepper = process.env.API_KEY_PEPPER;

describe("public webhook delivery route", () => {
  beforeAll(() => {
    process.env.API_KEY_PEPPER = "webhook-delivery-route-pepper-that-is-long-enough";
  });

  afterAll(() => {
    if (originalPepper === undefined) delete process.env.API_KEY_PEPPER;
    else process.env.API_KEY_PEPPER = originalPepper;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePublicApiRequest.mockResolvedValue({
      ok: true,
      requestId: "req_webhook_deliveries",
      principal: {
        orgId: "org_demo",
        credentialId: "credential_demo",
        prefix: "ss_api_demo",
        scopes: ["deliveries:read"]
      },
      responseHeaders: {}
    });
    mocks.listCustomerWebhookDeliveries.mockResolvedValue([
      delivery("delivery_b", "2026-07-10T02:00:00.000Z"),
      delivery("delivery_a", "2026-07-10T01:00:00.000Z")
    ]);
  });

  it("issues a bounded endpoint-specific cursor and rejects it for another endpoint", async () => {
    const first = await listWebhookDeliveries(
      new Request("http://localhost/api/v1/webhook-endpoints/endpoint_a/deliveries?limit=1"),
      { params: Promise.resolve({ endpointId: "endpoint_a" }) }
    );
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body).toMatchObject({
      data: { deliveries: [{ id: "delivery_b", attempts: expect.any(Array) }] },
      meta: { hasMore: true, nextCursor: expect.any(String) }
    });

    mocks.listCustomerWebhookDeliveries.mockClear();
    const foreign = await listWebhookDeliveries(
      new Request(
        `http://localhost/api/v1/webhook-endpoints/endpoint_b/deliveries?limit=1&cursor=${body.meta.nextCursor}`
      ),
      { params: Promise.resolve({ endpointId: "endpoint_b" }) }
    );
    expect(foreign.status).toBe(400);
    await expect(foreign.json()).resolves.toMatchObject({ error: { code: "INVALID_CURSOR" } });
    expect(mocks.listCustomerWebhookDeliveries).not.toHaveBeenCalled();
  });
});

function delivery(id: string, createdAt: string) {
  return {
    id,
    endpointId: "endpoint_a",
    eventId: `event_${id}`,
    eventType: "message.accepted",
    status: "DELIVERED",
    generation: 1,
    replayOfDeliveryId: null,
    attemptCount: 1,
    maxAttempts: 8,
    nextAttemptAt: createdAt,
    deliveredAt: createdAt,
    failedAt: null,
    lastStatusCode: 204,
    lastErrorCode: null,
    attempts: [
      {
        id: `attempt_${id}`,
        generation: 1,
        attemptNumber: 1,
        requestTimestamp: createdAt,
        statusCode: 204,
        outcome: "delivered",
        errorCode: null,
        startedAt: createdAt,
        finishedAt: createdAt,
        createdAt
      }
    ],
    createdAt,
    updatedAt: createdAt
  };
}
