import { describe, expect, it } from "vitest";
import { campaignCreateSchema, templateCreateSchema } from "@/lib/validation/campaigns";

describe("campaign validation", () => {
  it("defaults campaign recipients to an empty draft set", () => {
    expect(campaignCreateSchema.parse({ name: "May promo", body: "Hello" })).toMatchObject({
      name: "May promo",
      body: "Hello",
      contactIds: []
    });
  });

  it("accepts template variables", () => {
    expect(templateCreateSchema.parse({ name: "Intro", body: "Hi {{firstName}}", variables: ["firstName"] }))
      .toMatchObject({ variables: ["firstName"] });
  });
});
