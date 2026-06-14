import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  apiRbacMutatingMethods,
  apiRouteRbacMatrix,
  apiRouteRbacRoleMatrix,
  apiRouteRbacSignedWebhookExceptions,
  type ApiRbacMutatingMethod
} from "@/lib/auth/api-rbac-matrix";

const repoRoot = process.cwd();
const mutatingMethodSet = new Set<string>(apiRbacMutatingMethods);

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return routeFiles(entryPath);
    }

    return entry.isFile() && entry.name === "route.ts" ? [entryPath] : [];
  });
}

function toRepoPath(filePath: string) {
  let relativePath = path.relative(repoRoot, filePath).split(path.sep).join("/");
  if (relativePath.startsWith("src/")) {
    relativePath = relativePath.slice(4);
  }
  return relativePath;
}

function resolvePath(entryPath: string) {
  const primaryPath = path.join(repoRoot, entryPath);
  if (existsSync(primaryPath)) {
    return primaryPath;
  }
  const srcPath = path.join(repoRoot, "src", entryPath);
  if (existsSync(srcPath)) {
    return srcPath;
  }
  return primaryPath;
}

function exportedMutatingMethods(source: string): ApiRbacMutatingMethod[] {
  const methods = new Set<ApiRbacMutatingMethod>();
  const exportPattern =
    /export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)\b|export\s+const\s+(GET|POST|PATCH|PUT|DELETE)\b/g;

  for (const match of source.matchAll(exportPattern)) {
    const method = match[1] || match[2];
    if (mutatingMethodSet.has(method)) {
      methods.add(method as ApiRbacMutatingMethod);
    }
  }

  return [...methods].sort();
}

function routeMethodKey(entry: { method: string; path: string }) {
  return `${entry.method} ${entry.path}`;
}

describe("API RBAC matrix", () => {
  it("declares every mutating API route method exactly once", () => {
    const actualMutatingRouteMethods = routeFiles(path.join(repoRoot, "src", "app", "api"))
      .flatMap((filePath) => {
        const repoPath = toRepoPath(filePath);
        const source = readFileSync(filePath, "utf8");
        return exportedMutatingMethods(source).map((method) => routeMethodKey({ method, path: repoPath }));
      })
      .sort();
    const matrixRouteMethods = apiRouteRbacMatrix.map(routeMethodKey).sort();

    expect(matrixRouteMethods).toEqual([...new Set(matrixRouteMethods)]);
    expect(matrixRouteMethods).toEqual(actualMutatingRouteMethods);
  });

  it("keeps role-gated matrix entries backed by current route code", () => {
    for (const entry of apiRouteRbacRoleMatrix) {
      const fullPath = resolvePath(entry.path);
      expect(existsSync(fullPath)).toBe(true);
      const source = readFileSync(fullPath, "utf8");
      expect(source).toContain(`requireApiRole(currentOrg, MembershipRole.${entry.requiredRole})`);
    }
  });

  it("keeps signed webhook exceptions backed by Twilio signature validation", () => {
    for (const entry of apiRouteRbacSignedWebhookExceptions) {
      const fullPath = resolvePath(entry.path);
      expect(existsSync(fullPath)).toBe(true);
      const source = readFileSync(fullPath, "utf8");
      expect(entry.provider).toBe("twilio");
      expect(source).toContain("readTwilioFormPayload");
      expect(source).toContain("validateTwilioSignature");
      expect(source).not.toContain("requireApiRole");
    }
  });

  it("freezes matrix metadata before validation uses it", () => {
    expect(Object.isFrozen(apiRouteRbacMatrix)).toBe(true);
    expect(apiRouteRbacMatrix.every((entry) => Object.isFrozen(entry))).toBe(true);
    expect(Object.isFrozen(apiRouteRbacRoleMatrix)).toBe(true);
    expect(Object.isFrozen(apiRouteRbacSignedWebhookExceptions)).toBe(true);
  });
});
