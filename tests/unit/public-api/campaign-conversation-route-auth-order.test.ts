import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createCampaignRoute } from "@/app/api/v1/campaigns/route";
import { POST as scheduleCampaignRoute } from "@/app/api/v1/campaigns/[campaignId]/schedule/route";
import { POST as replyRoute } from "@/app/api/v1/conversations/[conversationId]/messages/route";

const mocks = vi.hoisted(() => ({
  authorizePublicApiRequest: vi.fn(),
  readPublicApiJson: vi.fn(),
  runPublicApiIdempotentMutation: vi.fn(),
  createPublicCampaign: vi.fn(),
  schedulePublicCampaign: vi.fn(),
  reserveDirectMessage: vi.fn(),
  resolveDirectMessageTransport: vi.fn(() => "DUMMY"),
  serializePublicMessage: vi.fn((message) => message)
}));

vi.mock("@/lib/public-api/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-api/request")>()),
  authorizePublicApiRequest: mocks.authorizePublicApiRequest,
  readPublicApiJson: mocks.readPublicApiJson
}));

vi.mock("@/lib/public-api/resource-mutations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-api/resource-mutations")>()),
  runPublicApiIdempotentMutation: mocks.runPublicApiIdempotentMutation
}));

vi.mock("@/lib/public-api/campaigns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-api/campaigns")>()),
  createPublicCampaign: mocks.createPublicCampaign,
  schedulePublicCampaign: mocks.schedulePublicCampaign
}));

vi.mock("@/lib/messaging/direct-message-reservation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/messaging/direct-message-reservation")>()),
  reserveDirectMessage: mocks.reserveDirectMessage,
  resolveDirectMessageTransport: mocks.resolveDirectMessageTransport
}));

vi.mock("@/lib/public-api/dummy-messages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-api/dummy-messages")>()),
  serializePublicMessage: mocks.serializePublicMessage
}));

const denied = {
  ok: false,
  requestId: "req_denied",
  response: new Response(JSON.stringify({ denied: true }), { status: 401 })
};

const authorized = {
  ok: true,
  requestId: "req_authorized",
  principal: {
    orgId: "org_demo",
    credentialId: "credential_demo",
    prefix: "ss_api_demo",
    scopes: []
  },
  responseHeaders: {}
};

describe("public campaign and conversation route authorization order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePublicApiRequest.mockResolvedValue(denied);
  });

  it("authorizes the campaign write scope before reading an untrusted draft body", async () => {
    const response = await createCampaignRoute(
      new Request("http://localhost/api/v1/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{malformed"
      })
    );

    expect(response.status).toBe(401);
    expect(mocks.authorizePublicApiRequest).toHaveBeenCalledWith(expect.any(Request), [
      "campaigns:write"
    ]);
    expect(mocks.readPublicApiJson).not.toHaveBeenCalled();
    expect(mocks.runPublicApiIdempotentMutation).not.toHaveBeenCalled();
  });

  it("authorizes the distinct campaign send scope before reading schedule input", async () => {
    const response = await scheduleCampaignRoute(
      new Request("http://localhost/api/v1/campaigns/campaign_demo/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{malformed"
      }),
      { params: Promise.resolve({ campaignId: "campaign_demo" }) }
    );

    expect(response.status).toBe(401);
    expect(mocks.authorizePublicApiRequest).toHaveBeenCalledWith(expect.any(Request), [
      "campaigns:send"
    ]);
    expect(mocks.readPublicApiJson).not.toHaveBeenCalled();
  });

  it("requires both conversation-write and message-send before reading a reply", async () => {
    const response = await replyRoute(
      new Request("http://localhost/api/v1/conversations/conversation_demo/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{malformed"
      }),
      { params: Promise.resolve({ conversationId: "conversation_demo" }) }
    );

    expect(response.status).toBe(401);
    expect(mocks.authorizePublicApiRequest).toHaveBeenCalledWith(expect.any(Request), [
      "conversations:write",
      "messages:send"
    ]);
    expect(mocks.readPublicApiJson).not.toHaveBeenCalled();
  });

  it("passes the same idempotency transaction to the durable reply reservation", async () => {
    const requestBody = { body: "Hello" };
    const tx = {
      marker: "same-transaction",
      message: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "message_demo" }) }
    };
    mocks.authorizePublicApiRequest.mockResolvedValue(authorized);
    mocks.readPublicApiJson.mockResolvedValue(requestBody);
    mocks.runPublicApiIdempotentMutation.mockResolvedValue(new Response("{}", { status: 202 }));
    mocks.reserveDirectMessage.mockResolvedValue({
      ok: true,
      deduped: false,
      message: { id: "message_demo" }
    });

    await replyRoute(
      new Request("http://localhost/api/v1/conversations/conversation_demo/messages", {
        method: "POST",
        headers: { "Idempotency-Key": "reply-once" }
      }),
      { params: Promise.resolve({ conversationId: "conversation_demo" }) }
    );

    expect(mocks.runPublicApiIdempotentMutation).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ requestId: "req_authorized" }),
      "/api/v1/conversations/:conversationId/messages",
      { conversationId: "conversation_demo", body: requestBody },
      expect.any(Function)
    );
    const mutation = mocks.runPublicApiIdempotentMutation.mock.calls[0]?.[4];
    const snapshot = await mutation(tx);
    expect(mocks.reserveDirectMessage).toHaveBeenCalledWith(tx, {
      orgId: "org_demo",
      route: "public_conversation_reply",
      identity: {
        kind: "public_api",
        credentialId: "credential_demo",
        idempotencyKey: "reply-once"
      },
      transport: "DUMMY",
      conversationId: "conversation_demo",
      body: "Hello",
      mediaUrls: []
    });
    expect(snapshot).toMatchObject({ status: 202, body: { ok: true } });
  });
});
