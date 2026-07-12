import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { PUBLIC_API_ROUTE_METHODS } from "@/lib/public-api/method-not-allowed";
import { PUBLIC_API_OPERATIONS } from "@/lib/public-api/openapi-registry";

const ROUTE_ROOT = resolve("app/api/v1");

describe("public API explicit Route Handler method coverage", () => {
  it("exports every Next.js verb as a supported operation or canonical 405", () => {
    const failures: string[] = [];

    for (const routeFile of collectRouteFiles(ROUTE_ROOT)) {
      const source = readFileSync(routeFile, "utf8");
      const routePath = routeFileToOpenApiPath(routeFile);
      const supported = PUBLIC_API_OPERATIONS
        .filter((operation) => operation.path === routePath)
        .map((operation) => operation.method.toUpperCase())
        .sort();
      const functions = [
        ...source.matchAll(
          /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g
        )
      ]
        .map((match) => match[1]!)
        .sort();
      const rejected = [
        ...source.matchAll(
          /\bmethodNotAllowed\s+as\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g
        )
      ]
        .map((match) => match[1]!)
        .sort();
      const fallbacks = [
        ...source.matchAll(/\bnotFound\s+as\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)
      ]
        .map((match) => match[1]!)
        .sort();
      const allExports = [...functions, ...rejected, ...fallbacks].sort();
      const expectedMethods = [...PUBLIC_API_ROUTE_METHODS].sort();
      const allowedMethods = parseAllowedMethods(source);

      if (fallbacks.length > 0) {
        if (functions.length > 0 || rejected.length > 0) {
          failures.push(`${routePath}: a fallback route must export only canonical 404 handlers`);
        }
        if (JSON.stringify(fallbacks) !== JSON.stringify(expectedMethods)) {
          failures.push(`${routePath}: fallback exports ${fallbacks.join(",")} != ${expectedMethods.join(",")}`);
        }
        if (!source.includes("createPublicApiNotFoundHandler()")) {
          failures.push(`${routePath}: missing deliberate authenticated 404 binding`);
        }
        continue;
      }

      if (JSON.stringify(functions) !== JSON.stringify(supported)) {
        failures.push(`${routePath}: supported handlers ${functions.join(",")} != registry ${supported.join(",")}`);
      }
      if (JSON.stringify(allowedMethods) !== JSON.stringify(supported)) {
        failures.push(`${routePath}: Allow list ${allowedMethods.join(",")} != registry ${supported.join(",")}`);
      }
      if (JSON.stringify(allExports) !== JSON.stringify(expectedMethods)) {
        failures.push(`${routePath}: explicit exports ${allExports.join(",")} != ${expectedMethods.join(",")}`);
      }
      const expectedFactory =
        routePath === "/api/v1/openapi.json"
          ? "createPublicMetadataMethodNotAllowedHandler"
          : "createPublicApiMethodNotAllowedHandler";
      if (!source.includes(`${expectedFactory}([`)) {
        failures.push(`${routePath}: missing deliberate ${expectedFactory} binding`);
      }
    }

    expect(failures).toEqual([]);
  });
});

function parseAllowedMethods(source: string): string[] {
  const match = /const\s+methodNotAllowed\s*=\s*createPublic(?:Api|Metadata)MethodNotAllowedHandler\(\[([^\]]+)]\);/.exec(
    source
  );
  if (!match?.[1]) return [];
  return [...match[1].matchAll(/"(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)"/g)]
    .map((method) => method[1]!)
    .sort();
}

function collectRouteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectRouteFiles(path);
    return entry.isFile() && entry.name === "route.ts" ? [path] : [];
  });
}

function routeFileToOpenApiPath(routeFile: string): `/api/v1/${string}` {
  const relativeDirectory = relative(ROUTE_ROOT, dirname(routeFile));
  const segments = relativeDirectory === "" ? [] : relativeDirectory.split(sep);
  const normalized = segments.map((segment) => {
    const dynamic = /^\[([^\]]+)]$/.exec(segment);
    return dynamic?.[1] ? `{${dynamic[1]}}` : segment;
  });
  return `/api/v1/${normalized.join("/")}` as `/api/v1/${string}`;
}
