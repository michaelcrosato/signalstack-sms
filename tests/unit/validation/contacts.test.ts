import { ConsentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { contactCreateSchema, contactUpdateSchema } from "@/lib/validation/contacts";

describe("contact validation", () => {
  it("defaults consent to unknown and label arrays to empty", () => {
    expect(contactCreateSchema.parse({ phone: "+15555550100" })).toMatchObject({
      phone: "+15555550100",
      consentStatus: ConsentStatus.UNKNOWN,
      tagNames: [],
      listNames: []
    });
  });

  it("supports soft archive updates", () => {
    expect(contactUpdateSchema.parse({ archived: true })).toEqual({ archived: true });
    expect(contactUpdateSchema.parse({ archived: false })).toEqual({ archived: false });
  });

  it("supports parsing consent evidence fields", () => {
    const parsed = contactCreateSchema.parse({
      phone: "+15555550100",
      consentCapturedAt: "2026-05-29T10:00:00.000Z",
      consentMethod: "web_form",
      consentDisclosure: "I agree to terms"
    });
    expect(parsed.consentCapturedAt).toBeInstanceOf(Date);
    expect(parsed.consentCapturedAt?.toISOString()).toBe("2026-05-29T10:00:00.000Z");
    expect(parsed.consentMethod).toBe("web_form");
    expect(parsed.consentDisclosure).toBe("I agree to terms");
  });
});
