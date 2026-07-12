import { AuthThrottleScope, MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as issueRoute } from "@/app/api/auth/password-resets/route";
import { POST as completeRoute } from "@/app/api/auth/password-resets/complete/route";
import { PasswordResetServiceError } from "@/lib/auth/password-reset-service";

const mocks = vi.hoisted(() => ({
  authenticateApiRequest: vi.fn(),
  clearLocalSessionCookie: vi.fn(),
  completePasswordReset: vi.fn(),
  consume: vi.fn(),
  createAuthThrottleService: vi.fn(),
  getRuntimeConfig: vi.fn(),
  requestHasTrustedOrigin: vi.fn()
}));

vi.mock("@/lib/auth/api-authentication", () => ({
  authenticateApiRequest: mocks.authenticateApiRequest
}));
vi.mock("@/lib/auth/auth-throttle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/auth-throttle")>();
  return { ...actual, createAuthThrottleService: mocks.createAuthThrottleService };
});
vi.mock("@/lib/auth/password-reset-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/password-reset-service")>();
  return { ...actual, completePasswordReset: mocks.completePasswordReset };
});
vi.mock("@/lib/auth/request-origin", () => ({
  requestHasTrustedOrigin: mocks.requestHasTrustedOrigin
}));
vi.mock("@/lib/auth/session-cookie", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session-cookie")>();
  return {
    ...actual,
    clearLocalSessionCookie: (...args: Parameters<typeof actual.clearLocalSessionCookie>) => {
      mocks.clearLocalSessionCookie(...args);
      return actual.clearLocalSessionCookie(...args);
    }
  };
});
vi.mock("@/lib/env/runtime-config", () => ({ getRuntimeConfig: mocks.getRuntimeConfig }));

const token = `ss_reset_${"r".repeat(43)}`;
const password = "replacement standalone password";
const currentOrg = Object.freeze({
  orgId: "org-current",
  orgSlug: "current",
  orgName: "Current",
  userId: "admin-user",
  email: "admin@example.test",
  role: MembershipRole.ADMIN,
  demoMode: false
});

describe("password reset API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateApiRequest.mockResolvedValue({ ok: true, currentOrg });
    mocks.getRuntimeConfig.mockReturnValue(runtimeConfig());
    mocks.requestHasTrustedOrigin.mockReturnValue(true);
    mocks.createAuthThrottleService.mockReturnValue({ consume: mocks.consume });
    mocks.consume.mockResolvedValue({
      allowed: true,
      limit: 30,
      remaining: 29,
      retryAfterSeconds: 0,
      windowStartedAt: new Date("2030-01-01T00:00:00.000Z"),
      blockedUntil: null
    });
    mocks.completePasswordReset.mockResolvedValue({
      completed: true,
      completedAt: new Date("2030-01-01T00:00:00.000Z")
    });
  });

  it("keeps organization roles outside the user-global reset authority", async () => {
    const request = mutationRequest("/api/auth/password-resets", { email: "target@example.test" });
    const bodyReader = vi.spyOn(request, "json");
    const response = await issueRoute(request);

    expect(mocks.authenticateApiRequest).toHaveBeenCalledWith(request);
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Password reset links require a platform operator.",
      code: "PASSWORD_RESET_OPERATOR_REQUIRED"
    });
    expect(bodyReader).not.toHaveBeenCalled();
  });

  it("preserves authentication failures on the disabled organization endpoint", async () => {
    const denial = NextResponse.json({ error: "Authentication required.", code: "AUTH_REQUIRED" }, { status: 401 });
    mocks.authenticateApiRequest.mockResolvedValueOnce({ ok: false, response: denial });
    const response = await issueRoute(mutationRequest("/api/auth/password-resets", {}));
    expect(response).toBe(denial);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("throttles by trusted network before parsing and completes an operator reset", async () => {
    const request = mutationRequest("/api/auth/password-resets/complete", { token, password });
    const bodyReader = vi.spyOn(request, "json");
    const response = await completeRoute(request);

    expect(mocks.consume).toHaveBeenCalledWith({
      scope: AuthThrottleScope.LOGIN_NETWORK,
      evidence: "0.0.0.0"
    });
    expect(mocks.consume.mock.invocationCallOrder[0]).toBeLessThan(
      bodyReader.mock.invocationCallOrder[0]
    );
    expect(mocks.completePasswordReset).toHaveBeenCalledWith({ token, password });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.clearLocalSessionCookie).toHaveBeenCalledWith(
      response,
      { secure: false }
    );
    await expect(response.json()).resolves.toEqual({ completed: true });
  });

  it("rejects mode, origin, throttle, malformed body, and invalid bearer without leaking evidence", async () => {
    mocks.getRuntimeConfig.mockReturnValueOnce(runtimeConfig("demo"));
    expect((await completeRoute(mutationRequest("/api/auth/password-resets/complete", { token, password }))).status).toBe(403);

    mocks.requestHasTrustedOrigin.mockReturnValueOnce(false);
    expect((await completeRoute(mutationRequest("/api/auth/password-resets/complete", { token, password }))).status).toBe(403);

    mocks.consume.mockResolvedValueOnce({
      allowed: false,
      limit: 30,
      remaining: 0,
      retryAfterSeconds: 75,
      windowStartedAt: new Date(),
      blockedUntil: new Date(Date.now() + 75_000)
    });
    const limited = await completeRoute(mutationRequest("/api/auth/password-resets/complete", { token, password }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("75");

    expect((await completeRoute(mutationRequest("/api/auth/password-resets/complete", { token: "bad", password }))).status).toBe(400);

    mocks.completePasswordReset.mockRejectedValueOnce(
      new PasswordResetServiceError("PASSWORD_RESET_UNAVAILABLE")
    );
    const denied = await completeRoute(mutationRequest("/api/auth/password-resets/complete", { token, password }));
    expect(denied.status).toBe(400);
    expect(JSON.stringify(await denied.json())).not.toContain(token);
    expect(mocks.clearLocalSessionCookie).not.toHaveBeenCalled();
  });

  it("sanitizes throttle, storage, and unexpected reset failures", async () => {
    mocks.consume.mockRejectedValueOnce(new Error("private throttle detail"));
    const throttleFailure = await completeRoute(mutationRequest("/api/auth/password-resets/complete", { token, password }));
    expect(throttleFailure.status).toBe(503);
    expect(JSON.stringify(await throttleFailure.json())).not.toContain("private throttle detail");

    for (const error of [
      new PasswordResetServiceError("PASSWORD_RESET_OPERATION_FAILED"),
      new Error("database password detail")
    ]) {
      mocks.completePasswordReset.mockRejectedValueOnce(error);
      const response = await completeRoute(mutationRequest("/api/auth/password-resets/complete", { token, password }));
      expect(response.status).toBe(503);
      expect(JSON.stringify(await response.json())).not.toContain(error.message);
    }
  });
});

function mutationRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost",
      Host: "localhost"
    },
    body: JSON.stringify(body)
  });
}

function runtimeConfig(authMode: "local" | "demo" = "local") {
  return {
    auth: { mode: authMode },
    runtime: { environment: "local" },
    web: { trustProxy: false }
  };
}
