import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as inboundWebhookRoute } from "@/app/api/webhooks/twilio/inbound/route";
import { POST as statusWebhookRoute } from "@/app/api/webhooks/twilio/status/route";

const originalTwilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

const mocks = vi.hoisted(() => ({
  createDemoInboundMessage: vi.fn(),
  getOrCreateCurrentOrg: vi.fn(),
  messageUpdateMany: vi.fn(),
  recordWebhookEvent: vi.fn()
}));

vi.mock("@/lib/auth/current-org", () => ({
  getOrCreateCurrentOrg: mocks.getOrCreateCurrentOrg
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    message: {
      updateMany: mocks.messageUpdateMany
    }
  }
}));

vi.mock("@/lib/db/repositories/inbox", () => ({
  createDemoInboundMessage: mocks.createDemoInboundMessage
}));

vi.mock("@/lib/db/repositories/webhooks", () => ({
  recordWebhookEvent: mocks.recordWebhookEvent
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
    mocks.getOrCreateCurrentOrg.mockResolvedValue({ orgId: "org_demo", userId: "user_demo", role: "OWNER" });
    mocks.recordWebhookEvent.mockResolvedValue({ duplicate: false });
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
  });

  it("rejects invalid inbound signatures before tenant lookup or local mutations", async () => {
    const response = await inboundWebhookRoute(
      twilioFormRequest(
        "/api/webhooks/twilio/inbound",
        { From: "+15555550100", Body: "STOP", MessageSid: "SM123" },
        "invalid-signature"
      )
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Invalid Twilio signature." });
    expect(mocks.getOrCreateCurrentOrg).not.toHaveBeenCalled();
    expect(mocks.recordWebhookEvent).not.toHaveBeenCalled();
    expect(mocks.createDemoInboundMessage).not.toHaveBeenCalled();
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
    expect(mocks.createDemoInboundMessage).toHaveBeenCalledWith("org_demo", {
      phone: "+15555550100",
      body: "STOP",
      providerMessageId: "SM123",
      idempotencyKey: "twilio:inbound:SM123"
    });
  });

  it("does not create inbound messages for duplicate webhook events", async () => {
    mocks.recordWebhookEvent.mockResolvedValue({ duplicate: true });

    const response = await inboundWebhookRoute(
      twilioFormRequest("/api/webhooks/twilio/inbound", {
        From: "+15555550100",
        Body: "HELP",
        MessageSid: "SM123"
      })
    );

    expect(response.status).toBe(204);
    expect(mocks.recordWebhookEvent).toHaveBeenCalled();
    expect(mocks.createDemoInboundMessage).not.toHaveBeenCalled();
  });

  it("rejects malformed status form bodies before tenant lookup or delivery updates", async () => {
    const response = await statusWebhookRoute(malformedFormRequest("/api/webhooks/twilio/status"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid Twilio form payload." });
    expect(mocks.getOrCreateCurrentOrg).not.toHaveBeenCalled();
    expect(mocks.recordWebhookEvent).not.toHaveBeenCalled();
    expect(mocks.messageUpdateMany).not.toHaveBeenCalled();
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
    expect(mocks.messageUpdateMany).toHaveBeenCalledWith({
      where: {
        orgId: "org_demo",
        providerMessageId: "SM123"
      },
      data: {
        providerStatus: "undelivered",
        providerErrorCode: "30007",
        deliveredAt: null,
        failedAt: expect.any(Date)
      }
    });
  });

  it("does not update delivery state for duplicate status webhook events", async () => {
    mocks.recordWebhookEvent.mockResolvedValue({ duplicate: true });

    const response = await statusWebhookRoute(
      twilioFormRequest("/api/webhooks/twilio/status", {
        MessageSid: "SM123",
        MessageStatus: "delivered"
      })
    );

    expect(response.status).toBe(204);
    expect(mocks.recordWebhookEvent).toHaveBeenCalled();
    expect(mocks.messageUpdateMany).not.toHaveBeenCalled();
  });
});
