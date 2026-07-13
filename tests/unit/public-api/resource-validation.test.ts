import { describe, expect, it } from "vitest";
import {
  publicApiResourceIdSchema,
  publicContactCreateSchema,
  publicContactUpdateSchema,
  publicListCreateSchema,
  publicListMembershipCreateSchema,
  publicMessageCreateSchema,
  publicSegmentCreateSchema,
  publicTagCreateSchema,
  publicTemplateUpdateSchema
} from "@/lib/validation/public-api-resources";

describe("public API resource validation", () => {
  it("rejects unknown fields at every write boundary", () => {
    expect(() => publicContactCreateSchema.parse({ phone: "+15555550100", orgId: "foreign" })).toThrow();
    expect(() => publicTagCreateSchema.parse({ name: "VIP", unexpected: true })).toThrow();
    expect(() => publicListCreateSchema.parse({ name: "Prospects", unexpected: true })).toThrow();
  });

  it("bounds relationship and template arrays independently of the JSON byte limit", () => {
    const tooManyNames = Array.from({ length: 101 }, (_, index) => `Label ${index}`);
    expect(() =>
      publicContactCreateSchema.parse({ phone: "+15555550100", tagNames: tooManyNames })
    ).toThrow();
    expect(() =>
      publicTemplateUpdateSchema.parse({ variables: tooManyNames })
    ).toThrow();
  });

  it("rejects empty patches and invalid saved segment ranges", () => {
    expect(() => publicContactUpdateSchema.parse({})).toThrow();
    expect(() => publicTemplateUpdateSchema.parse({})).toThrow();
    expect(() =>
      publicSegmentCreateSchema.parse({
        name: "Impossible",
        definition: { minLeadScore: 90, maxLeadScore: 10 }
      })
    ).toThrow();
  });

  it("rejects non-canonical resource identifiers instead of trimming route evidence", () => {
    expect(() => publicApiResourceIdSchema.parse(" contact_demo ")).toThrow();
    expect(publicApiResourceIdSchema.parse("contact_demo")).toBe("contact_demo");
  });

  it("requires a bounded unique list-membership batch", () => {
    expect(publicListMembershipCreateSchema.parse({ contactIds: ["contact_a", "contact_b"] })).toEqual({
      contactIds: ["contact_a", "contact_b"]
    });
    expect(() =>
      publicListMembershipCreateSchema.parse({ contactIds: ["contact_a", "contact_a"] })
    ).toThrow();
    expect(() => publicListMembershipCreateSchema.parse({ contactIds: [] })).toThrow();
    expect(() =>
      publicListMembershipCreateSchema.parse({
        contactIds: Array.from({ length: 101 }, (_, index) => `contact_${index}`)
      })
    ).toThrow();
    expect(() =>
      publicListMembershipCreateSchema.parse({ contactIds: ["contact_a"], orgId: "foreign" })
    ).toThrow();
  });

  it("accepts at most ten unique HTTPS media URLs for direct messages", () => {
    expect(
      publicMessageCreateSchema.parse({
        contactId: "contact_a",
        body: "Photo",
        mediaUrls: ["https://cdn.example.test/a.jpg"]
      })
    ).toEqual({
      contactId: "contact_a",
      body: "Photo",
      mediaUrls: ["https://cdn.example.test/a.jpg"]
    });
    expect(() =>
      publicMessageCreateSchema.parse({
        contactId: "contact_a",
        body: "Photo",
        mediaUrls: ["https://cdn.example.test/a.jpg", "https://cdn.example.test/a.jpg"]
      })
    ).toThrow("unique");
    expect(() =>
      publicMessageCreateSchema.parse({
        contactId: "contact_a",
        body: "Photo",
        mediaUrls: ["http://cdn.example.test/a.jpg"]
      })
    ).toThrow("HTTPS");
    expect(() =>
      publicMessageCreateSchema.parse({
        contactId: "contact_a",
        body: "Photo",
        mediaUrls: ["not-a-url"]
      })
    ).toThrow();
    expect(() =>
      publicMessageCreateSchema.parse({
        contactId: "contact_a",
        body: "Photo",
        mediaUrls: [`https://cdn.example.test/${"a".repeat(2_100)}`]
      })
    ).toThrow();
  });
});
