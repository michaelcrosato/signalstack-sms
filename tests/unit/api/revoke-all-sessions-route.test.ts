import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as revokeAllSessionsRoute } from "@/app/api/auth/sessions/revoke-all/route";

const mocks = vi.hoisted(() => ({
  authenticateApiRequest: vi.fn(),
  getRuntimeConfig: vi.fn(),
  requireApiRole: vi.fn(),
  revokeAllLocalSessionsForOrganization: vi.fn()
}));

vi.mock("@/lib/auth/api-authentication", () => ({
  authenticateApiRequest: mocks.authenticateApiRequest
}));

vi.mock("@/lib/auth/api-authorization", () => ({
  requireApiRole: mocks.requireApiRole
}));

vi.mock("@/lib/auth/local-session", () => ({
  revokeAllLocalSessionsForOrganization: mocks.revokeAllLocalSessionsForOrganization
}));

vi.mock("@/lib/env/runtime-config", () => ({
  getRuntimeConfig: mocks.getRuntimeConfig
}));

const currentOrg = Object.freeze({
  orgId: "org-1",
  orgSlug: "example",
  orgName: "Example",
  userId: "user-1",
  email: "owner@example.test",
  role: MembershipRole.OWNER,
  demoMode: false
});

describe("revoke all local sessions route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateApiRequest.mockResolvedValue({ ok: true, currentOrg });
    mocks.requireApiRole.mockReturnValue(null);
    mocks.getRuntimeConfig.mockReturnValue(runtimeConfig());
    mocks.revokeAllLocalSessionsForOrganization.mockResolvedValue(3);
  });

  it("revokes only the authenticated user's sessions and clears both cookie forms", async () => {
    const response = await revokeAllSessionsRoute(sameOriginRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.requireApiRole).toHaveBeenCalledWith(currentOrg, MembershipRole.MEMBER);
    expect(mocks.revokeAllLocalSessionsForOrganization).toHaveBeenCalledWith(
      "user-1",
      "org-1"
    );
    await expect(response.json()).resolves.toEqual({ revokedSessions: 3 });
    const cookies = setCookieValues(response);
    expect(cookies.some((cookie) => cookie.startsWith("signalstack_session="))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith("__Host-signalstack_session="))).toBe(true);
    expect(cookies.every((cookie) => cookie.includes("Max-Age=0"))).toBe(true);
  });

  it("returns authentication and role failures before runtime or session mutation", async () => {
    const authenticationResponse = NextResponse.json(
      { error: "Authentication required.", code: "AUTH_REQUIRED" },
      { status: 401 }
    );
    mocks.authenticateApiRequest.mockResolvedValueOnce({ ok: false, response: authenticationResponse });
    await expect(revokeAllSessionsRoute(sameOriginRequest())).resolves.toBe(authenticationResponse);

    mocks.requireApiRole.mockReturnValueOnce(
      NextResponse.json({ error: "Requires MEMBER role or higher." }, { status: 403 })
    );
    const roleResponse = await revokeAllSessionsRoute(sameOriginRequest());
    expect(roleResponse.status).toBe(403);
    expect(mocks.getRuntimeConfig).not.toHaveBeenCalled();
    expect(mocks.revokeAllLocalSessionsForOrganization).not.toHaveBeenCalled();
  });

  it("rejects cross-origin and non-local mutations without revocation", async () => {
    const crossOrigin = await revokeAllSessionsRoute(
      sameOriginRequest({ origin: "https://attacker.example" })
    );
    expect(crossOrigin.status).toBe(403);
    await expect(crossOrigin.json()).resolves.toMatchObject({ code: "INVALID_REQUEST_ORIGIN" });

    mocks.getRuntimeConfig.mockReturnValueOnce(runtimeConfig({ authMode: "demo" }));
    const demo = await revokeAllSessionsRoute(sameOriginRequest());
    expect(demo.status).toBe(403);
    await expect(demo.json()).resolves.toMatchObject({ code: "SESSION_MANAGEMENT_UNAVAILABLE" });
    expect(mocks.revokeAllLocalSessionsForOrganization).not.toHaveBeenCalled();
  });

  it("sanitizes persistence failures and still removes browser cookie evidence", async () => {
    mocks.revokeAllLocalSessionsForOrganization.mockRejectedValueOnce(
      new Error("database detail raw-session-token")
    );

    const response = await revokeAllSessionsRoute(sameOriginRequest());
    expect(response.status).toBe(503);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toContain("AUTH_SERVICE_UNAVAILABLE");
    expect(serialized).not.toContain("database detail");
    expect(serialized).not.toContain("raw-session-token");
    expect(setCookieValues(response)).toHaveLength(2);
  });

  it("does not report success when the authenticated subject was not revoked", async () => {
    mocks.revokeAllLocalSessionsForOrganization.mockResolvedValueOnce(null);

    const response = await revokeAllSessionsRoute(sameOriginRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication service unavailable.",
      code: "AUTH_SERVICE_UNAVAILABLE"
    });
    expect(setCookieValues(response)).toHaveLength(2);
  });
});

function sameOriginRequest(overrides: { origin?: string } = {}) {
  return new Request("http://app.example.test/api/auth/sessions/revoke-all", {
    method: "POST",
    headers: {
      host: "app.example.test",
      origin: overrides.origin ?? "http://app.example.test"
    }
  });
}

function runtimeConfig(input: { authMode?: "local" | "demo" } = {}) {
  return {
    auth: { mode: input.authMode ?? "local" },
    runtime: { environment: "local" },
    web: { trustProxy: false }
  };
}

function setCookieValues(response: NextResponse) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""].filter(Boolean);
}
