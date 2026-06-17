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

  it("supports clearing firstName, lastName, displayName, and notes to null", () => {
    const parsed = contactUpdateSchema.parse({
      firstName: null,
      lastName: null,
      displayName: null,
      notes: null
    });
    expect(parsed).toEqual({
      firstName: null,
      lastName: null,
      displayName: null,
      notes: null
    });
  });

  it("coerces empty string to null for optional text fields", () => {
    const parsed = contactUpdateSchema.parse({
      firstName: "",
      lastName: "",
      displayName: "",
      notes: ""
    });
    expect(parsed).toEqual({
      firstName: null,
      lastName: null,
      displayName: null,
      notes: null
    });
  });

  it("validates and preprocesses email field correctly", () => {
    // Valid email
    expect(contactCreateSchema.parse({ phone: "+15555550100", email: "test@example.com" })).toMatchObject({
      email: "test@example.com"
    });

    // Null email
    expect(contactCreateSchema.parse({ phone: "+15555550100", email: null })).toMatchObject({
      email: null
    });

    // Undefined/omitted email
    const parsedOmitted = contactCreateSchema.parse({ phone: "+15555550100" });
    expect(parsedOmitted.email).toBeUndefined();

    // Empty string coerced to null
    expect(contactCreateSchema.parse({ phone: "+15555550100", email: "" })).toMatchObject({
      email: null
    });

    // Whitespace string coerced to null
    expect(contactCreateSchema.parse({ phone: "+15555550100", email: "   " })).toMatchObject({
      email: null
    });

    // Invalid email should throw
    expect(() => contactCreateSchema.parse({ phone: "+15555550100", email: "invalid-email" })).toThrow();
  });
});

