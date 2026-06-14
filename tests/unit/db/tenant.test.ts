import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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

  it("scopes idempotency uniqueness by tenant for retryable records", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");

    for (const model of ["QueueJob", "Message", "WebhookEvent"]) {
      const modelBlock = schema.match(new RegExp(`model\\s+${model}\\s+\\{([\\s\\S]*?)\\n\\}`, "m"))?.[1];
      expect(modelBlock).toContain("@@unique([orgId, idempotencyKey])");
      expect(modelBlock).not.toMatch(/idempotencyKey\s+String\s+@unique/);
    }
  });
});
