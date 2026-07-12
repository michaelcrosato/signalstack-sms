import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  apiRbacMutatingMethods,
  apiRouteRbacApiKeyBoundaries,
  apiRouteRbacMatrix,
  apiRouteRbacOperatorBoundaryExceptions,
  apiRouteRbacPublicAuthExceptions,
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
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
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
    const actualMutatingRouteMethods = routeFiles(path.join(repoRoot, "app", "api"))
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
      const fullPath = path.join(repoRoot, entry.path);
      expect(existsSync(fullPath)).toBe(true);
      const source = readFileSync(fullPath, "utf8");
      expect(source).toContain(`requireApiRole(currentOrg, MembershipRole.${entry.requiredRole})`);
    }
  });

  it("keeps signed webhook exceptions backed by account routing and locked generation validation", () => {
    for (const entry of apiRouteRbacSignedWebhookExceptions) {
      const fullPath = path.join(repoRoot, entry.path);
      expect(existsSync(fullPath)).toBe(true);
      const source = readFileSync(fullPath, "utf8");
      expect(entry.provider).toBe("twilio");
      expect(source).toContain("readTwilioFormPayload");
      expect(source).toContain("authenticateTwilioProviderCallback");
      expect(source).toContain("assertProviderCallbackBindingActive");
      expect(source).not.toContain("process.env.TWILIO_AUTH_TOKEN");
      expect(source).not.toContain("requireApiRole");
    }
  });

  it("keeps API-key boundaries backed by pre-body scope authorization and durable idempotency", () => {
    for (const entry of apiRouteRbacApiKeyBoundaries) {
      const fullPath = path.join(repoRoot, entry.path);
      expect(existsSync(fullPath)).toBe(true);
      const source = readFileSync(fullPath, "utf8");
      expect(source).toContain("authorizePublicApiRequest(request");
      for (const scope of entry.requiredScopes) {
        expect(source).toContain(`"${scope}"`);
      }
      expect(
        source.includes("runPublicApiIdempotentMutation(") || source.includes("executeIdempotentMutation(")
      ).toBe(true);
    }
  });

  it("limits public authentication mutations to the intended local auth flows", () => {
    expect(
      apiRouteRbacPublicAuthExceptions.map(({ flow, method, path }) => ({ flow, method, path }))
    ).toEqual([
      {
        flow: "login",
        method: "POST",
        path: "app/api/auth/login/route.ts"
      },
      {
        flow: "logout",
        method: "POST",
        path: "app/api/auth/logout/route.ts"
      },
      {
        flow: "reset-complete",
        method: "POST",
        path: "app/api/auth/password-resets/complete/route.ts"
      },
      {
        flow: "setup",
        method: "POST",
        path: "app/api/auth/setup/route.ts"
      },
      {
        flow: "invite-accept",
        method: "POST",
        path: "app/api/auth/team/invites/accept/route.ts"
      }
    ]);

    for (const entry of apiRouteRbacPublicAuthExceptions) {
      const source = readFileSync(path.join(repoRoot, entry.path), "utf8");
      if (entry.flow === "invite-accept") {
        expect(source).toContain("acceptTeamInvite");
        expect(source).toContain("createAuthThrottleService");
        expect(source).toContain("requestHasTrustedOrigin");
      } else if (entry.flow === "reset-complete") {
        expect(source).toContain("completePasswordReset");
        expect(source).toContain("createAuthThrottleService");
        expect(source).toContain("requestHasTrustedOrigin");
        expect(source).toContain("clearLocalSessionCookie");
      } else {
        expect(source).toContain(`handleLocalAuth${capitalize(entry.flow)}`);
      }
      expect(source).not.toContain("requireApiRole");
    }
  });

  it("keeps user-global reset issuance outside tenant role authority", () => {
    expect(apiRouteRbacOperatorBoundaryExceptions).toEqual([
      expect.objectContaining({
        auth: "operator-boundary",
        method: "POST",
        operatorCommand: "admin:reset-link",
        path: "app/api/auth/password-resets/route.ts"
      })
    ]);
    const source = readFileSync(
      path.join(repoRoot, apiRouteRbacOperatorBoundaryExceptions[0]!.path),
      "utf8"
    );
    expect(source).toContain("authenticateApiRequest(request)");
    expect(source).toContain("PASSWORD_RESET_OPERATOR_REQUIRED");
    expect(source).not.toContain("requireApiRole");
    expect(source).not.toContain("issueOperatorPasswordReset");
  });

  it("freezes matrix metadata before validation uses it", () => {
    expect(Object.isFrozen(apiRouteRbacMatrix)).toBe(true);
    expect(apiRouteRbacMatrix.every((entry) => Object.isFrozen(entry))).toBe(true);
    expect(Object.isFrozen(apiRouteRbacRoleMatrix)).toBe(true);
    expect(Object.isFrozen(apiRouteRbacSignedWebhookExceptions)).toBe(true);
    expect(Object.isFrozen(apiRouteRbacPublicAuthExceptions)).toBe(true);
    expect(Object.isFrozen(apiRouteRbacOperatorBoundaryExceptions)).toBe(true);
    expect(Object.isFrozen(apiRouteRbacApiKeyBoundaries)).toBe(true);
  });
});

function capitalize(value: string) {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}
