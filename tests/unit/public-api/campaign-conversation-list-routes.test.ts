import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listCampaignsRoute } from "@/app/api/v1/campaigns/route";
import { GET as listConversationsRoute } from "@/app/api/v1/conversations/route";
import { GET as listConversationMessagesRoute } from "@/app/api/v1/conversations/[conversationId]/messages/route";

const mocks = vi.hoisted(() => ({
  authorizePublicApiRequest: vi.fn(),
  withTenantTransaction: vi.fn()
}));

vi.mock("@/lib/public-api/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-api/request")>()),
  authorizePublicApiRequest: mocks.authorizePublicApiRequest
}));

vi.mock("@/lib/db/tenant-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/tenant-context")>()),
  withTenantTransaction: mocks.withTenantTransaction
}));

const authorization = {
  ok: true,
  requestId: "req_authorized",
  principal: {
    orgId: "org_demo",
    credentialId: "credential_demo",
    prefix: "ss_api_demo",
    scopes: []
  },
  responseHeaders: { "RateLimit-Remaining": "9" }
};

describe("public campaign and conversation collection routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePublicApiRequest.mockResolvedValue(authorization);
  });

  it("lists campaigns in a bounded deterministic page with a named wrapper", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    mocks.withTenantTransaction.mockImplementation(async (_context, operation) =>
      operation({ campaign: { findMany } })
    );

    const response = await listCampaignsRoute(
      new Request("http://localhost/api/v1/campaigns")
    );

    expect(mocks.authorizePublicApiRequest).toHaveBeenCalledWith(expect.any(Request), [
      "campaigns:read"
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org_demo" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 51
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { campaigns: [] },
      meta: { limit: 50, hasMore: false, nextCursor: null }
    });
  });

  it("lists conversations in the same bounded createdAt/id order", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    mocks.withTenantTransaction.mockImplementation(async (_context, operation) =>
      operation({ conversation: { findMany } })
    );

    const response = await listConversationsRoute(
      new Request("http://localhost/api/v1/conversations?limit=100")
    );

    expect(mocks.authorizePublicApiRequest).toHaveBeenCalledWith(expect.any(Request), [
      "conversations:read"
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org_demo" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 101
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { conversations: [] },
      meta: { limit: 100 }
    });
  });

  it("checks tenant conversation existence and both read scopes before listing its thread", async () => {
    const findConversation = vi.fn().mockResolvedValue({ id: "conversation_demo" });
    const findMessages = vi.fn().mockResolvedValue([]);
    mocks.withTenantTransaction.mockImplementation(async (_context, operation) =>
      operation({
        conversation: { findFirst: findConversation },
        message: { findMany: findMessages }
      })
    );

    const response = await listConversationMessagesRoute(
      new Request("http://localhost/api/v1/conversations/conversation_demo/messages"),
      { params: Promise.resolve({ conversationId: "conversation_demo" }) }
    );

    expect(mocks.authorizePublicApiRequest).toHaveBeenCalledWith(expect.any(Request), [
      "conversations:read",
      "messages:read"
    ]);
    expect(findConversation).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "org_demo", id: "conversation_demo" } })
    );
    expect(findMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org_demo", conversationId: "conversation_demo" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 51
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { messages: [] },
      meta: { limit: 50 }
    });
  });
});
