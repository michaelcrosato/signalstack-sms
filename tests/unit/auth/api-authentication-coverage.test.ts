import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return routeFiles(entryPath);
    }
    return entry.isFile() && entry.name === "route.ts" ? [entryPath] : [];
  });
}

function repoPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

describe("API authentication boundary coverage", () => {
  const apiRoot = path.join(process.cwd(), "app", "api");

  it("keeps throwing current-organization resolvers out of non-auth and non-health routes", () => {
    const directResolverCalls = routeFiles(apiRoot).flatMap((filePath) => {
      const relativePath = repoPath(path.relative(process.cwd(), filePath));
      if (relativePath.startsWith("app/api/auth/") || relativePath === "app/api/health/route.ts") {
        return [];
      }

      const source = readFileSync(filePath, "utf8");
      return /\b(?:getOrCreateCurrentOrg|resolveCurrentOrg)\s*\(/.test(source)
        ? [relativePath]
        : [];
    });

    expect(directResolverCalls).toEqual([]);
  });

  it("requires the stable helper on every internal product route", () => {
    const missingAuthenticationHelper = routeFiles(apiRoot).flatMap((filePath) => {
      const relativePath = repoPath(path.relative(process.cwd(), filePath));
      if (
        relativePath.startsWith("app/api/auth/") ||
        relativePath.startsWith("app/api/v1/") ||
        relativePath === "app/api/health/route.ts" ||
        relativePath.startsWith("app/api/webhooks/")
      ) {
        return [];
      }

      const source = readFileSync(filePath, "utf8");
      return /\bauthenticateApiRequest\s*\(/.test(source)
        ? []
        : [relativePath];
    });

    expect(missingAuthenticationHelper).toEqual([]);
  });

  it("passes the concrete Request through every internal product mutation boundary", () => {
    const missingOriginBoundary = routeFiles(apiRoot).flatMap((filePath) => {
      const relativePath = repoPath(path.relative(process.cwd(), filePath));
      if (
        relativePath.startsWith("app/api/auth/") ||
        relativePath.startsWith("app/api/v1/") ||
        relativePath === "app/api/health/route.ts" ||
        relativePath.startsWith("app/api/webhooks/")
      ) {
        return [];
      }

      const source = readFileSync(filePath, "utf8");
      const mutationCount = [
        ...source.matchAll(/export async function (?:POST|PUT|PATCH|DELETE)\s*\(\s*request\b/g)
      ].length;
      const mutationExports = [
        ...source.matchAll(/export async function (?:POST|PUT|PATCH|DELETE)\s*\(/g)
      ].length;
      const guardedMutationCount = [
        ...source.matchAll(/authenticateApiRequest\s*\(\s*request\s*\)/g)
      ].length;

      return mutationExports === mutationCount && guardedMutationCount === mutationExports
        ? []
        : [relativePath];
    });

    expect(missingOriginBoundary).toEqual([]);
  });

  it("keeps Twilio callbacks on exact provider-account routing and generation recheck", () => {
    const webhookRoutes = [
      "app/api/webhooks/twilio/inbound/route.ts",
      "app/api/webhooks/twilio/status/route.ts"
    ];

    const incorrectlyClassified = webhookRoutes.filter((relativePath) => {
      const source = readFileSync(path.join(process.cwd(), relativePath), "utf8");
      return !source.includes("authenticateTwilioProviderCallback") ||
        !source.includes("assertProviderCallbackBindingActive") ||
        source.includes('boundary: "signed-webhook"');
    });

    expect(incorrectlyClassified).toEqual([]);
  });
});
