import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { apiRouteRbacApiKeyBoundaries } from "@/lib/auth/api-rbac-matrix";

describe("versioned public API authorization registry", () => {
  it("binds every registered mutation to its exact scope before body parsing", () => {
    const failures: string[] = [];
    for (const entry of apiRouteRbacApiKeyBoundaries) {
      const source = readFileSync(path.resolve(entry.path), "utf8");
      const authorizationIndex = source.indexOf("authorizePublicApiRequest(");
      const firstBodyRead = Math.min(
        ...["readPublicApiJson(", ".json(", ".text(", ".formData(", ".arrayBuffer(", ".blob("].map((needle) => {
          const index = source.indexOf(needle);
          return index === -1 ? Number.POSITIVE_INFINITY : index;
        })
      );
      if (authorizationIndex === -1 || authorizationIndex > firstBodyRead) {
        failures.push(`${entry.method} ${entry.path}: authorization must precede body parsing`);
      }
      for (const scope of entry.requiredScopes) {
        if (!source.includes(`"${scope}"`)) {
          failures.push(`${entry.method} ${entry.path}: missing scope ${scope}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("requires the durable idempotency layer on every public mutation", () => {
    const missing = apiRouteRbacApiKeyBoundaries
      .filter((entry) => {
        const source = readFileSync(path.resolve(entry.path), "utf8");
        return !source.includes("runPublicApiIdempotentMutation(") && !source.includes("executeIdempotentMutation(");
      })
      .map((entry) => `${entry.method} ${entry.path}`);
    expect(missing).toEqual([]);
  });

  it("contains exactly one matrix row for each method and route", () => {
    const identities = apiRouteRbacApiKeyBoundaries.map((entry) => `${entry.method} ${entry.path}`);
    expect(new Set(identities).size).toBe(identities.length);
  });
});
