import { describe, expect, it } from "vitest";
import { usageEventCreateSchema } from "@/lib/validation/billing";
import { UsageEventType } from "@prisma/client";

describe("billing validation", () => {
  describe("usageEventCreateSchema", () => {
    it("accepts valid input with just type and applies default quantity", () => {
      const input = { type: UsageEventType.MESSAGE_INBOUND };
      const parsed = usageEventCreateSchema.parse(input);

      expect(parsed).toMatchObject({
        type: UsageEventType.MESSAGE_INBOUND,
        quantity: 1,
      });
    });

    it("accepts valid input with type, quantity, and metadata", () => {
      const input = {
        type: UsageEventType.AI_REQUEST,
        quantity: 50,
        metadata: { model: "gpt-4" }
      };
      const parsed = usageEventCreateSchema.parse(input);

      expect(parsed).toMatchObject({
        type: UsageEventType.AI_REQUEST,
        quantity: 50,
        metadata: { model: "gpt-4" }
      });
    });

    it("rejects invalid event type", () => {
      const input = { type: "INVALID_TYPE" };
      const result = usageEventCreateSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("rejects negative quantity", () => {
      const input = {
        type: UsageEventType.CONTACT_IMPORTED,
        quantity: -1
      };
      const result = usageEventCreateSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("rejects zero quantity", () => {
      const input = {
        type: UsageEventType.CONTACT_IMPORTED,
        quantity: 0
      };
      const result = usageEventCreateSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("rejects fractional quantity", () => {
      const input = {
        type: UsageEventType.CONTACT_IMPORTED,
        quantity: 1.5
      };
      const result = usageEventCreateSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("rejects quantity over 100,000", () => {
      const input = {
        type: UsageEventType.CONTACT_IMPORTED,
        quantity: 100_001
      };
      const result = usageEventCreateSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });
});
