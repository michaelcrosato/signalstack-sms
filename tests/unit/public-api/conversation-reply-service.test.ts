import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitDummyPublicConversationReply } from "@/lib/public-api/conversations";

const mocks = vi.hoisted(() => ({
  submitDummyPublicMessage: vi.fn()
}));

vi.mock("@/lib/public-api/dummy-messages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-api/dummy-messages")>()),
  submitDummyPublicMessage: mocks.submitDummyPublicMessage
}));

describe("public conversation dummy replies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates lifecycle fanout to the centralized dummy transition without duplicating it", async () => {
    const tx = {
      conversation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "conversation_demo",
          contactId: "contact_demo"
        })
      }
    };
    const message = {
      id: "message_demo",
      conversationId: "conversation_demo",
      contactId: "contact_demo",
      body: "Hello",
      mode: "dummy"
    };
    mocks.submitDummyPublicMessage.mockResolvedValue({ ok: true, message });

    const result = await submitDummyPublicConversationReply(tx as never, {
      orgId: "org_demo",
      conversationId: "conversation_demo",
      body: "Hello"
    });

    expect(result).toEqual({ ok: true, message });
    expect(mocks.submitDummyPublicMessage).toHaveBeenCalledWith(tx, {
      orgId: "org_demo",
      contactId: "contact_demo",
      conversationId: "conversation_demo",
      body: "Hello"
    });
  });

  it("returns a tenant-safe operation denial without invoking the dummy transition", async () => {
    const tx = {
      conversation: {
        findFirst: vi.fn().mockResolvedValue({ id: "conversation_demo", contactId: null })
      }
    };

    const result = await submitDummyPublicConversationReply(tx as never, {
      orgId: "org_demo",
      conversationId: "conversation_demo",
      body: "Hello"
    });

    expect(result).toEqual({ ok: false, kind: "operation_not_allowed" });
    expect(mocks.submitDummyPublicMessage).not.toHaveBeenCalled();
  });
});
