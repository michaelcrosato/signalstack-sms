import { describe, expect, it } from "vitest";
import { assertSameOrg, orgWhere } from "@/lib/db/tenant";

describe("tenant helpers", () => {
  it("adds orgId to query filters", () => {
    expect(orgWhere("org_a", { id: "contact_1" })).toEqual({
      id: "contact_1",
      orgId: "org_a"
    });
  });

  it("rejects records from a different org", () => {
    expect(() => assertSameOrg({ orgId: "org_b" }, "org_a")).toThrow(
      "Record does not belong to the current organization."
    );
  });
});

