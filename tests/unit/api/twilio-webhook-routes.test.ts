import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as inboundWebhookRoute } from "@/app/api/webhooks/twilio/inbound/route";
import { POST as statusWebhookRoute } from "@/app/api/webhooks/twilio/status/route";

const originalTwilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

const mocks = vi.hoisted(() => ({
  assertProviderCallbackBindingActive: vi.fn(),
  authenticateTwilioProviderCallback: vi.fn(),
  createDemoInboundMessage: vi.fn(),
  getOrCreateCurrentOrg: vi.fn(),
  markWebhookEventProcessed: vi.fn(),
  recordMetric: vi.fn(),
  recordWebhookEvent: vi.fn(),
  releaseWebhookEventClaim: vi.fn(),
  updateMessageFromTwilioStatus: vi.fn()
}));

vi.mock("@/lib/integrations/provider-accounts/webhook-routing", () => ({
  assertProviderCallbackBindingActive: mocks.assertProviderCallbackBindingActive,
  authenticateTwilioProviderCallback: mocks.authenticateTwilioProviderCallback,
  createProviderCallbackFailureResponse: (error: { code?: string }) =>
    Response.json(
      error?.code === "WEBHOOK_ROUTING_UNAVAILABLE"
        ? { error: "Provider callback routing is unavailable.", code: "WEBHOOK_ROUTING_UNAVAILABLE" }
        : { error: "Provider callback rejected.", code: "INVALID_PROVIDER_CALLBACK" },
      { status: error?.code === "WEBHOOK_ROUTING_UNAVAILABLE" ? 503 : 403 }
    )
}));

vi.mock("@/lib/db/tenant-context", () => ({
  withTenantTransaction: (_context: unknown, fn: (tx: object) => unknown) => fn({})
}));

vi.mock("@/lib/auth/current-org", () => ({
  getOrCreateCurrentOrg: mocks.getOrCreateCurrentOrg
}));

vi.mock("@/lib/observability/metrics", () => ({
  recordMetric: mocks.recordMetric,
  smsPipelineMetrics: {
    deliveryRate: "sms.delivery.rate",
    sendToDeliveredLatencyMs: "sms.delivery.latency_ms",
    queueDepth: "queue.depth",
    queueThroughput: "queue.throughput",
    failureByErrorCode: "sms.failure.by_error_code",
    webhookVerificationFailureRate: "webhook.verification.failure_rate"
  }
}));

vi.mock("@/lib/db/repositories/inbox", () => ({
  createDemoInboundMessage: mocks.createDemoInboundMessage
}));

vi.mock("@/lib/db/repositories/webhooks", () => ({
  markWebhookEventProcessed: mocks.markWebhookEventProcessed,
  recordWebhookEvent: mocks.recordWebhookEvent,
  releaseWebhookEventClaim: mocks.releaseWebhookEventClaim,
  updateMessageFromTwilioStatus: mocks.updateMessageFromTwilioStatus
}));

function sign(url: string, params: Record<string, string>) {
  const base = Object.keys(params)
    .sort()
    .reduce((value, key) => `${value}${key}${params[key]}`, url);
  return createHmac("sha1", "test_token").update(base).digest("base64");
}

function twilioFormRequest(path: string, params: Record<string, string>, signature = sign(`http://localhost${path}`, params)) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": signature
    },
    body: new URLSearchParams(params)
  });
}

function malformedFormRequest(path: string) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ MessageSid: "SM123" })
  });
}

describe("Twilio webhook routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TWILIO_AUTH_TOKEN = "test_token";
    mocks.authenticateTwilioProviderCallback.mockResolvedValue({
      orgId: "org_demo",
      provider: "twilio",
      providerAccountId: "provider_account_demo",
      providerPhoneNumberId: "provider_number_demo",
      providerCredentialSecretId: "provider_secret_demo",
      credentialVersion: 1,
      credentialFingerprint: "pvfp_demo",
      externalAccountId: "AC00000000000000000000000000000000",
      phoneNumber: "+15555550199"
    });
    mocks.assertProviderCallbackBindingActive.mockResolvedValue(undefined);
    mocks.getOrCreateCurrentOrg.mockResolvedValue({ orgId: "org_demo", userId: "user_demo", role: "OWNER" });
    mocks.createDemoInboundMessage.mockResolvedValue({ message: { id: "message_demo" } });
    mocks.recordWebhookEvent.mockResolvedValue({
      event: { id: "event_demo", processedAt: null },
      outcome: "claimed",
      duplicate: false,
      claimed: true,
      claimToken: "claim_owner",
      retryAfterSeconds: null
    });
    mocks.markWebhookEventProcessed.mockResolvedValue({ count: 1 });
    mocks.releaseWebhookEventClaim.mockResolvedValue({ count: 1 });
    mocks.updateMessageFromTwilioStatus.mockResolvedValue({
      matched: true,
      updated: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z")
    });
  });

  afterEach(() => {
    if (originalTwilioAuthToken === undefined) {
      delete process.env.TWILIO_AUTH_TOKEN;
    } else {
      process.env.TWILIO_AUTH_TOKEN = originalTwilioAuthToken;
    }
  });

  it("rejects malformed inbound form bodies before tenant lookup or local mutations", async () => {
    const response = await inboundWebhookRoute(malformedFormRequest("/api/webhooks/twilio/inbound"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid Twilio form payload." });
    expect(mocks.getOrCreateCurrentOrg).not.toHaveBeenCalled();
    expect(mocks.recordWebhookEvent).not.toHaveBeenCalled();
    expect(mocks.createDemoInboundMessage).not.toHaveBeenCalled();
    expect(mocks.markWebhookEventProcessed).not.toHaveBeenCalled();
    expect(mocks.releaseWebhookEventClaim).not.toHaveBeenCalled();
  });

  it("rejects invalid inbound signatures before tenant lookup or local mutations", async () => {
    mocks.authenticateTwilioProviderCallback.mockRejectedValueOnce({
      code: "INVALID_PROVIDER_CALLBACK"
    });
    const response = await inboundWebhookRoute(
      twilioFormRequest(
        "/api/webhooks/twilio/inbound",
        { From: "+15555550100", Body: "STOP", MessageSid: "SM123" },
        "invalid-signature"
      )
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Provider callback rejected.",
      code: "INVALID_PROVIDER_CALLBACK"
    });
    expect(mocks.getOrCreateCurrentOrg).not.toHaveBeenCalled();
    expect(mocks.recordWebhookEvent).not.toHaveBeenCalled();
    expect(mocks.createDemoInboundMessage).not.toHaveBeenCalled();
    expect(mocks.markWebhookEventProcessed).not.toHaveBeenCalled();
    expect(mocks.releaseWebhookEventClaim).not.toHaveBeenCalled();
  });

  it("records valid inbound events and creates local inbox messages only once", async () => {
    const params = {
      From: " +15555550100 ",
      To: "+15555550199",
      Body: "STOP",
      MessageSid: " SM123 ",
      FutureField: "preserved"
    };

    const response = await inboundWebhookRoute(twilioFormRequest("/api/webhooks/twilio/inbound", params));

    expect(response.status).toBe(204);
    expect(mocks.recordWebhookEvent).toHaveBeenCalledWith({
      orgId: "org_demo",
      provider: "twilio",
      eventType: "inbound",
      idempotencyKey: "twilio:inbound:SM123",
      rawPayload: params
    });
    expect(mocks.createDemoInboundMessage).toHaveBeenCalledWith(
      "org_demo",
      {
        phone: "+15555550100",
        body: "STOP",
        providerMessageId: "SM123",
        idempotencyKey: "twilio:inbound:SM123"
      },
      { analyzeSentiment: false, sendKeywordAutoReply: false }
    );
    expect(mocks.markWebhookEventProcessed).toHaveBeenCalledWith(
      "org_demo",
      "event_demo",
      "claim_owner"
    );
    expect(mocks.createDemoInboundMessage.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.markWebhookEventProcessed.mock.invocationCallOrder[0]
    );
    expect(mocks.releaseWebhookEventClaim).not.toHaveBeenCalled();
  });

  it("leaves inbound events unprocessed when local message creation fails", async () => {
    mocks.createDemoInboundMessage.mockRejectedValue(new Error("local persistence failed"));

    await expect(
      inboundWebhookRoute(
        twilioFormRequest("/api/webhooks/twilio/inbound", {
          From: "+15555550100",
          Body: "HELP",
          MessageSid: "SM123"
        })
      )
    ).rejects.toThrow("local persistence failed");

    expect(mocks.recordWebhookEvent).toHaveBeenCalled();
    expect(mocks.markWebhookEventProcessed).not.toHaveBeenCalled();
    expect(mocks.releaseWebhookEventClaim).toHaveBeenCalledWith(
      "org_demo",
      "event_demo",
      "claim_owner"
    );
  });

  it("does not create inbound messages when another request owns the event claim", async () => {
    mocks.recordWebhookEvent.mockResolvedValue({
      outcome: "in_progress",
      duplicate: true,
      claimed: false,
      retryAfterSeconds: 17
    });

    const response = await inboundWebhookRoute(
      twilioFormRequest("/api/webhooks/twilio/inbound", {
        From: "+15555550100",
        Body: "HELP",
        MessageSid: "SM123"
      })
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(mocks.recordWebhookEvent).toHaveBeenCalled();
    expect(mocks.createDemoInboundMessage).not.toHaveBeenCalled();
    expect(mocks.markWebhookEventProcessed).not.toHaveBeenCalled();
    expect(mocks.releaseWebhookEventClaim).not.toHaveBeenCalled();
  });

  it("returns 204 without inbound mutations for an already processed event", async () => {
    mocks.recordWebhookEvent.mockResolvedValue({
      outcome: "processed",
      duplicate: true,
      claimed: false,
      retryAfterSeconds: null
    });

    const response = await inboundWebhookRoute(
      twilioFormRequest("/api/webhooks/twilio/inbound", {
        From: "+15555550100",
        Body: "HELP",
        MessageSid: "SM123"
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("retry-after")).toBeNull();
    expect(mocks.createDemoInboundMessage).not.toHaveBeenCalled();
  });

  it("rejects malformed status form bodies before tenant lookup or delivery updates", async () => {
    const response = await statusWebhookRoute(malformedFormRequest("/api/webhooks/twilio/status"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid Twilio form payload." });
    expect(mocks.getOrCreateCurrentOrg).not.toHaveBeenCalled();
    expect(mocks.recordWebhookEvent).not.toHaveBeenCalled();
    expect(mocks.updateMessageFromTwilioStatus).not.toHaveBeenCalled();
    expect(mocks.markWebhookEventProcessed).not.toHaveBeenCalled();
    expect(mocks.releaseWebhookEventClaim).not.toHaveBeenCalled();
  });

  it("updates only current-tenant messages for non-duplicate status events", async () => {
    const params = {
      MessageSid: " SM123 ",
      MessageStatus: " Undelivered ",
      ErrorCode: " 30007 "
    };

    const response = await statusWebhookRoute(twilioFormRequest("/api/webhooks/twilio/status", params));

    expect(response.status).toBe(204);
    expect(mocks.recordWebhookEvent).toHaveBeenCalledWith({
      orgId: "org_demo",
      provider: "twilio",
      eventType: "status",
      idempotencyKey: "twilio:status:SM123:undelivered:30007",
      rawPayload: params
    });
    expect(mocks.updateMessageFromTwilioStatus).toHaveBeenCalledWith({
      orgId: "org_demo",
      providerMessageId: "SM123",
      status: "undelivered",
      errorCode: "30007"
    });
    expect(mocks.markWebhookEventProcessed).toHaveBeenCalledWith(
      "org_demo",
      "event_demo",
      "claim_owner"
    );
    expect(mocks.updateMessageFromTwilioStatus.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.markWebhookEventProcessed.mock.invocationCallOrder[0]
    );
  });

  it("records canceled as a terminal delivery failure using the shared status vocabulary", async () => {
    const response = await statusWebhookRoute(
      twilioFormRequest("/api/webhooks/twilio/status", {
        MessageSid: "SM123",
        MessageStatus: "Canceled",
        ErrorCode: "30008"
      })
    );

    expect(response.status).toBe(204);
    expect(mocks.recordMetric).toHaveBeenCalledWith("sms.delivery.rate", { status: "failure" });
    expect(mocks.recordMetric).toHaveBeenCalledWith("sms.failure.by_error_code", { errorCode: "30008" });
  });

  it("leaves status events unprocessed when the delivery mutation fails", async () => {
    mocks.updateMessageFromTwilioStatus.mockRejectedValue(new Error("delivery persistence failed"));

    await expect(
      statusWebhookRoute(
        twilioFormRequest("/api/webhooks/twilio/status", {
          MessageSid: "SM123",
          MessageStatus: "sent"
        })
      )
    ).rejects.toThrow("delivery persistence failed");

    expect(mocks.recordWebhookEvent).toHaveBeenCalled();
    expect(mocks.markWebhookEventProcessed).not.toHaveBeenCalled();
    expect(mocks.releaseWebhookEventClaim).toHaveBeenCalledWith(
      "org_demo",
      "event_demo",
      "claim_owner"
    );
  });

  it("releases an unmatched early status callback for a later retry", async () => {
    mocks.updateMessageFromTwilioStatus.mockResolvedValue({
      matched: false,
      updated: false,
      createdAt: null
    });

    const response = await statusWebhookRoute(
      twilioFormRequest("/api/webhooks/twilio/status", {
        MessageSid: "SM123",
        MessageStatus: "sent"
      })
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(mocks.releaseWebhookEventClaim).toHaveBeenCalledWith(
      "org_demo",
      "event_demo",
      "claim_owner"
    );
    expect(mocks.markWebhookEventProcessed).not.toHaveBeenCalled();
  });

  it("records unknown early provider statuses and then marks the event processed", async () => {
    const response = await statusWebhookRoute(
      twilioFormRequest("/api/webhooks/twilio/status", {
        MessageSid: "SM123",
        MessageStatus: "Provider-Accepted-V2"
      })
    );

    expect(response.status).toBe(204);
    expect(mocks.updateMessageFromTwilioStatus).toHaveBeenCalledWith({
      orgId: "org_demo",
      providerMessageId: "SM123",
      status: "provider-accepted-v2",
      errorCode: undefined
    });
    expect(mocks.markWebhookEventProcessed).toHaveBeenCalledWith(
      "org_demo",
      "event_demo",
      "claim_owner"
    );
  });

  it("does not update delivery state when another request owns the event claim", async () => {
    mocks.recordWebhookEvent.mockResolvedValue({
      outcome: "in_progress",
      duplicate: true,
      claimed: false,
      retryAfterSeconds: 23
    });

    const response = await statusWebhookRoute(
      twilioFormRequest("/api/webhooks/twilio/status", {
        MessageSid: "SM123",
        MessageStatus: "delivered"
      })
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("retry-after")).toBe("23");
    expect(mocks.recordWebhookEvent).toHaveBeenCalled();
    expect(mocks.updateMessageFromTwilioStatus).not.toHaveBeenCalled();
    expect(mocks.markWebhookEventProcessed).not.toHaveBeenCalled();
    expect(mocks.releaseWebhookEventClaim).not.toHaveBeenCalled();
  });

  it("fails closed and releases its token when completion ownership is lost", async () => {
    mocks.markWebhookEventProcessed.mockResolvedValue({ count: 0 });

    await expect(
      statusWebhookRoute(
        twilioFormRequest("/api/webhooks/twilio/status", {
          MessageSid: "SM123",
          MessageStatus: "sent"
        })
      )
    ).rejects.toThrow("Webhook event claim was lost before status processing completed.");

    expect(mocks.updateMessageFromTwilioStatus).toHaveBeenCalledTimes(1);
    expect(mocks.releaseWebhookEventClaim).toHaveBeenCalledWith(
      "org_demo",
      "event_demo",
      "claim_owner"
    );
  });
});
