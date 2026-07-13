import { describe, expect, it } from "vitest";
import {
  conversationAssignSchema,
  conversationNoteCreateSchema,
  conversationReplyCreateSchema,
  conversationResolveSchema,
  inboundMessageSchema
} from "@/lib/validation/inbox";

describe("inbox validation schemas", () => {
  it("accepts demo-safe inbound messages", () => {
    expect(
      inboundMessageSchema.parse({
        phone: "+15555550123",
        body: "HELP",
        providerMessageId: "demo_message_1"
      })
    ).toMatchObject({
      phone: "+15555550123",
      body: "HELP"
    });
  });

  it("allows clearing conversation assignment", () => {
    expect(conversationAssignSchema.parse({ assignedToUserId: null })).toEqual({
      assignedToUserId: null
    });
  });

  it("defaults resolve requests to resolved", () => {
    expect(conversationResolveSchema.parse({})).toEqual({ resolved: true });
  });

  it("rejects empty internal notes", () => {
    expect(() => conversationNoteCreateSchema.parse({ body: "" })).toThrow();
  });

  it("requires a stable UUID for browser replies", () => {
    expect(
      conversationReplyCreateSchema.parse({
        body: "Hello",
        idempotencyKey: "f8fdb7fa-8785-4c54-8bb2-30237d44f6b7"
      })
    ).toEqual({ body: "Hello", idempotencyKey: "f8fdb7fa-8785-4c54-8bb2-30237d44f6b7" });
    expect(() => conversationReplyCreateSchema.parse({ body: "Hello" })).toThrow();
    expect(() =>
      conversationReplyCreateSchema.parse({ body: "Hello", idempotencyKey: "caller-chosen-text" })
    ).toThrow();
  });
});
