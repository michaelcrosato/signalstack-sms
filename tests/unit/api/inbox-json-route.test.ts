import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postDemoInbound } from "@/app/api/demo/inbound/route";
import { POST as postConversation } from "@/app/api/inbox/conversations/route";
import { POST as assignConversationRoute } from "@/app/api/inbox/conversations/[conversationId]/assign/route";
import { POST as postConversationMessage } from "@/app/api/inbox/conversations/[conversationId]/messages/route";
import { POST as replyConversationRoute } from "@/app/api/inbox/conversations/[conversationId]/reply/route";
import { POST as postConversationNote } from "@/app/api/inbox/conversations/[conversationId]/notes/route";
import { POST as resolveConversationRoute } from "@/app/api/inbox/conversations/[conversationId]/resolve/route";

const mocks = vi.hoisted(() => ({
  addConversationNote: vi.fn(),
  assignConversation: vi.fn(),
  createConversationInboundMessage: vi.fn(),
  createConversationOutboundReply: vi.fn(),
  createDemoInboundMessage: vi.fn(),
  getOrCreateCurrentOrg: vi.fn(),
  listConversationMessages: vi.fn(),
  listConversationNotes: vi.fn(),
  listConversations: vi.fn(),
  requireApiRole: vi.fn(),
  setConversationResolved: vi.fn()
}));

vi.mock("@/lib/auth/api-authorization", () => ({
  requireApiRole: mocks.requireApiRole
}));

vi.mock("@/lib/auth/current-org", () => ({
  getOrCreateCurrentOrg: mocks.getOrCreateCurrentOrg
}));

vi.mock("@/lib/db/repositories/inbox", () => ({
  addConversationNote: mocks.addConversationNote,
  assignConversation: mocks.assignConversation,
  createConversationInboundMessage: mocks.createConversationInboundMessage,
  createConversationOutboundReply: mocks.createConversationOutboundReply,
  createDemoInboundMessage: mocks.createDemoInboundMessage,
  listConversationMessages: mocks.listConversationMessages,
  listConversationNotes: mocks.listConversationNotes,
  listConversations: mocks.listConversations,
  setConversationResolved: mocks.setConversationResolved
}));

const conversationParams = { params: Promise.resolve({ conversationId: "conversation_demo" }) };

function malformedJsonRequest(path: string) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{"
  });
}

describe("inbox JSON mutation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateCurrentOrg.mockResolvedValue({ orgId: "org_demo", userId: "user_demo", role: "OWNER" });
    mocks.requireApiRole.mockReturnValue(null);
  });

  it("rejects malformed conversation-create JSON without creating a local inbound message", async () => {
    const response = await postConversation(malformedJsonRequest("/api/inbox/conversations"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid inbound message payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.createDemoInboundMessage).not.toHaveBeenCalled();
  });

  it("rejects malformed demo-inbound JSON without creating a local inbound message", async () => {
    const response = await postDemoInbound(malformedJsonRequest("/api/demo/inbound"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid demo inbound payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.createDemoInboundMessage).not.toHaveBeenCalled();
  });

  it("rejects malformed conversation-message JSON without creating a tenant message", async () => {
    const response = await postConversationMessage(
      malformedJsonRequest("/api/inbox/conversations/conversation_demo/messages"),
      conversationParams
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid message payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.createConversationInboundMessage).not.toHaveBeenCalled();
  });

  it("rejects malformed assignment JSON without assigning a tenant conversation", async () => {
    const response = await assignConversationRoute(
      malformedJsonRequest("/api/inbox/conversations/conversation_demo/assign"),
      conversationParams
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid assignment payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.assignConversation).not.toHaveBeenCalled();
  });

  it("rejects malformed note JSON without creating a tenant note", async () => {
    const response = await postConversationNote(
      malformedJsonRequest("/api/inbox/conversations/conversation_demo/notes"),
      conversationParams
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid note payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.addConversationNote).not.toHaveBeenCalled();
  });

  it("rejects malformed resolve JSON without changing tenant conversation state", async () => {
    const response = await resolveConversationRoute(
      malformedJsonRequest("/api/inbox/conversations/conversation_demo/resolve"),
      conversationParams
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid resolve payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.setConversationResolved).not.toHaveBeenCalled();
  });

  it("rejects malformed reply JSON without sending an outbound reply", async () => {
    const response = await replyConversationRoute(
      malformedJsonRequest("/api/inbox/conversations/conversation_demo/reply"),
      conversationParams
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid reply payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.createConversationOutboundReply).not.toHaveBeenCalled();
  });

  it("blocks an outbound reply to an opted-out contact with a reason and no message", async () => {
    mocks.createConversationOutboundReply.mockResolvedValue({ blocked: true, reasons: ["CONTACT_OPTED_OUT"] });

    const response = await replyConversationRoute(
      new Request("http://localhost/api/inbox/conversations/conversation_demo/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Thanks for reaching out!" })
      }),
      conversationParams
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: "Reply blocked by consent rules.",
      reasons: ["CONTACT_OPTED_OUT"]
    });
  });

  it("records a single outbound reply on the happy path", async () => {
    mocks.createConversationOutboundReply.mockResolvedValue({
      blocked: false,
      deduped: false,
      message: { id: "message_reply", direction: "OUTBOUND", providerStatus: "queued" }
    });

    const response = await replyConversationRoute(
      new Request("http://localhost/api/inbox/conversations/conversation_demo/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Thanks for reaching out!" })
      }),
      conversationParams
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      message: { id: "message_reply", direction: "OUTBOUND" },
      deduped: false
    });
    expect(mocks.createConversationOutboundReply).toHaveBeenCalledWith("org_demo", "conversation_demo", {
      body: "Thanks for reaching out!"
    });
  });

  it("does not double-insert on a duplicate idempotent reply submit", async () => {
    mocks.createConversationOutboundReply.mockResolvedValue({
      blocked: false,
      deduped: true,
      message: { id: "message_reply", direction: "OUTBOUND", providerStatus: "queued" }
    });

    const response = await replyConversationRoute(
      new Request("http://localhost/api/inbox/conversations/conversation_demo/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Thanks again!", idempotencyKey: "reply-1" })
      }),
      conversationParams
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ deduped: true });
  });
});
