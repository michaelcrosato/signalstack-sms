import { describe, expect, it } from "vitest";
import {
  conversationAssignSchema,
  conversationNoteCreateSchema,
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
});
