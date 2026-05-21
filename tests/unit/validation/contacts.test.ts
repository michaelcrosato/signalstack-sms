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
});
