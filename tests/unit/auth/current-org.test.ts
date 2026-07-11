import { MembershipRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  CurrentOrgAuthError,
  currentOrgAuthContextFromRuntime,
  resolveCurrentOrg,
  type CurrentOrg,
  type CurrentOrgResolverDependencies
} from "@/lib/auth/current-org";
import type { ResolvedLocalSession } from "@/lib/auth/local-session";
import { readLocalSessionToken } from "@/lib/auth/session-cookie";

const TOKEN = `ss_session_${"a".repeat(43)}`;

const demoOrg: CurrentOrg = Object.freeze({
  orgId: "org_demo",
  orgSlug: "demo-org",
  orgName: "Demo Org",
  userId: "user_demo",
  email: "owner@demo.example",
  role: MembershipRole.OWNER,
  demoMode: true
});

const localSession: ResolvedLocalSession = Object.freeze({
  sessionId: "session_private",
  userId: "user_local",
  email: "owner@local.example",
  displayName: "Local Owner",
  orgId: "org_local",
  orgSlug: "local-org",
  orgName: "Local Org",
  role: MembershipRole.ADMIN,
  demoMode: false,
  createdAt: new Date("2026-07-10T00:00:00.000Z"),
  lastSeenAt: new Date("2026-07-10T00:05:00.000Z"),
  idleExpiresAt: new Date("2026-07-10T00:35:00.000Z"),
  absoluteExpiresAt: new Date("2026-07-11T00:00:00.000Z")
});

describe("current organization request resolver", () => {
  it("uses deterministic provisioning only when demo mode is explicit", async () => {
    const resolveDemoCurrentOrg = vi.fn(async () => demoOrg);
    const readRequestHeaders = vi.fn(async () => {
      throw new Error("demo mode must not read request authentication evidence");
    });
    const resolveSession = vi.fn(async () => localSession);

    const result = await resolveCurrentOrg(
      dependencies({
        getAuthContext: () => ({ mode: "demo", secureCookie: false }),
        readRequestHeaders,
        resolveSession,
        resolveDemoCurrentOrg
      })
    );

    expect(result).toBe(demoOrg);
    expect(resolveDemoCurrentOrg).toHaveBeenCalledOnce();
    expect(readRequestHeaders).not.toHaveBeenCalled();
    expect(resolveSession).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["malformed", "signalstack_session=not-an-opaque-session"]
  ])("denies %s local Cookie evidence without entering the demo path", async (_label, cookie) => {
    const resolveDemoCurrentOrg = vi.fn(async () => demoOrg);
    const resolveSession = vi.fn(async () => localSession);
    const requestHeaders = new Headers(cookie ? { cookie } : undefined);

    await expect(
      resolveCurrentOrg(
        dependencies({
          readRequestHeaders: async () => requestHeaders,
          resolveSession,
          resolveDemoCurrentOrg
        })
      )
    ).rejects.toMatchObject({
      name: "CurrentOrgAuthError",
      code: "AUTH_REQUIRED",
      statusCode: 401,
      message: "Authentication required."
    });

    expect(resolveSession).not.toHaveBeenCalled();
    expect(resolveDemoCurrentOrg).not.toHaveBeenCalled();
  });

  it("denies a revoked or otherwise invalid DB-backed local session without demo fallback", async () => {
    const resolveSession = vi.fn(async () => null);
    const resolveDemoCurrentOrg = vi.fn(async () => demoOrg);

    await expect(
      resolveCurrentOrg(
        dependencies({
          readRequestHeaders: async () =>
            new Headers({ cookie: `signalstack_session=${TOKEN}` }),
          resolveSession,
          resolveDemoCurrentOrg
        })
      )
    ).rejects.toBeInstanceOf(CurrentOrgAuthError);

    expect(resolveSession).toHaveBeenCalledExactlyOnceWith(TOKEN);
    expect(resolveDemoCurrentOrg).not.toHaveBeenCalled();
  });

  it("passes the raw Cookie header and production cookie selection to the boundary parser", async () => {
    const cookie = `theme=dark; __Host-signalstack_session=${TOKEN}`;
    const requestHeaders = new Headers({ cookie });
    const readSessionToken = vi.fn(readLocalSessionToken);

    const result = await resolveCurrentOrg(
      dependencies({
        getAuthContext: () => ({ mode: "local", secureCookie: true }),
        readRequestHeaders: async () => requestHeaders,
        readSessionToken,
        resolveSession: async () => localSession
      })
    );

    expect(result.orgId).toBe("org_local");
    expect(readSessionToken).toHaveBeenCalledOnce();
    const [request, options] = readSessionToken.mock.calls[0]!;
    expect(request.headers.get("cookie")).toBe(cookie);
    expect(options).toEqual({ secure: true });
  });

  it("derives secure cookie selection only from the production runtime", () => {
    expect(
      currentOrgAuthContextFromRuntime({
        auth: { mode: "local" },
        runtime: { environment: "production" }
      })
    ).toEqual({ mode: "local", secureCookie: true });
    expect(
      currentOrgAuthContextFromRuntime({
        auth: { mode: "local" },
        runtime: { environment: "local" }
      })
    ).toEqual({ mode: "local", secureCookie: false });
  });

  it("projects only sanitized identity and organization fields from a valid session", async () => {
    const resolvedWithPrivateEvidence = {
      ...localSession,
      tokenHash: "must-not-escape",
      revokedAt: null
    } as ResolvedLocalSession;

    const result = await resolveCurrentOrg(
      dependencies({
        readRequestHeaders: async () =>
          new Headers({ cookie: `signalstack_session=${TOKEN}` }),
        resolveSession: async () => resolvedWithPrivateEvidence
      })
    );

    expect(result).toEqual({
      orgId: "org_local",
      orgSlug: "local-org",
      orgName: "Local Org",
      userId: "user_local",
      email: "owner@local.example",
      role: MembershipRole.ADMIN,
      demoMode: false
    });
    expect(Object.keys(result).sort()).toEqual(
      ["demoMode", "email", "orgId", "orgName", "orgSlug", "role", "userId"].sort()
    );
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("fails closed when the reserved OIDC provider is selected", async () => {
    const readRequestHeaders = vi.fn(async () => new Headers());
    const resolveDemoCurrentOrg = vi.fn(async () => demoOrg);

    await expect(
      resolveCurrentOrg(
        dependencies({
          getAuthContext: () => ({ mode: "oidc", secureCookie: true }),
          readRequestHeaders,
          resolveDemoCurrentOrg
        })
      )
    ).rejects.toMatchObject({
      name: "CurrentOrgAuthError",
      code: "AUTH_PROVIDER_UNAVAILABLE",
      statusCode: 503,
      message: "Authentication provider unavailable."
    });

    expect(readRequestHeaders).not.toHaveBeenCalled();
    expect(resolveDemoCurrentOrg).not.toHaveBeenCalled();
  });
});

function dependencies(
  overrides: Partial<CurrentOrgResolverDependencies> = {}
): CurrentOrgResolverDependencies {
  return {
    getAuthContext: () => ({ mode: "local", secureCookie: false }),
    readRequestHeaders: async () => new Headers(),
    readSessionToken: readLocalSessionToken,
    resolveSession: async () => null,
    resolveDemoCurrentOrg: async () => demoOrg,
    ...overrides
  };
}
