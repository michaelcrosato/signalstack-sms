import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthThrottleScope } from "@prisma/client";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { GET as sessionRoute } from "@/app/api/auth/session/route";
import { POST as setupRoute } from "@/app/api/auth/setup/route";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  bootstrapFirstOwner: vi.fn(),
  consumeAuthThrottle: vi.fn(),
  createLocalSession: vi.fn(),
  createAuthThrottleService: vi.fn(),
  createPrismaLocalCredentialService: vi.fn(),
  findFirstMembership: vi.fn(),
  getRuntimeConfig: vi.fn(),
  resolveLocalSession: vi.fn(),
  revokeLocalSession: vi.fn()
}));

vi.mock("@/lib/auth/auth-throttle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/auth-throttle")>();
  return {
    ...actual,
    createAuthThrottleService: mocks.createAuthThrottleService
  };
});

vi.mock("@/lib/auth/local-credential-store", () => ({
  createPrismaLocalCredentialService: mocks.createPrismaLocalCredentialService
}));

vi.mock("@/lib/auth/local-session", () => ({
  createLocalSession: mocks.createLocalSession,
  resolveLocalSession: mocks.resolveLocalSession,
  revokeLocalSession: mocks.revokeLocalSession
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    membership: {
      findFirst: mocks.findFirstMembership
    }
  }
}));

vi.mock("@/lib/env/runtime-config", () => ({
  getRuntimeConfig: mocks.getRuntimeConfig
}));

const bootstrapToken = "bootstrap_token_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const password = "correct horse battery staple";
const oldSessionToken = `ss_session_${"o".repeat(43)}`;
const newSessionToken = `ss_session_${"n".repeat(43)}`;
const throttleSecret = "route-test-throttle-secret-0123456789abcdef";
const originalBootstrapToken = process.env.BOOTSTRAP_TOKEN;
const originalThrottleSecret = process.env.AUTH_THROTTLE_SECRET;

const resolvedSession = Object.freeze({
  sessionId: "database-session-id",
  userId: "user-1",
  email: "owner@example.com",
  displayName: "Owner",
  orgId: "org-1",
  orgSlug: "signalstack",
  orgName: "SignalStack",
  role: "OWNER",
  demoMode: false,
  createdAt: new Date("2030-01-01T00:00:00.000Z"),
  lastSeenAt: new Date("2030-01-01T00:05:00.000Z"),
  idleExpiresAt: new Date("2099-01-01T00:30:00.000Z"),
  absoluteExpiresAt: new Date("2099-01-02T00:00:00.000Z")
});

describe("local authentication API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOOTSTRAP_TOKEN = bootstrapToken;
    process.env.AUTH_THROTTLE_SECRET = throttleSecret;
    mocks.getRuntimeConfig.mockReturnValue(runtimeConfig());
    mocks.createAuthThrottleService.mockReturnValue({ consume: mocks.consumeAuthThrottle });
    mocks.consumeAuthThrottle.mockResolvedValue(allowedThrottleDecision());
    mocks.createPrismaLocalCredentialService.mockResolvedValue({
      authenticate: mocks.authenticate,
      bootstrapFirstOwner: mocks.bootstrapFirstOwner
    });
    mocks.bootstrapFirstOwner.mockResolvedValue({
      created: true,
      user: {
        id: "user-1",
        email: "owner@example.com",
        displayName: "Owner",
        authVersion: 1
      },
      organization: {
        id: "org-1",
        name: "SignalStack",
        slug: "signalstack",
        timezone: "America/Vancouver"
      }
    });
    mocks.authenticate.mockResolvedValue({
      authenticated: true,
      user: {
        id: "user-1",
        email: "owner@example.com",
        displayName: "Owner",
        authVersion: 1
      }
    });
    mocks.findFirstMembership.mockResolvedValue({ orgId: "org-1" });
    mocks.createLocalSession.mockResolvedValue({ token: newSessionToken, session: resolvedSession });
    mocks.resolveLocalSession.mockResolvedValue(resolvedSession);
    mocks.revokeLocalSession.mockResolvedValue(true);
  });

  afterAll(() => {
    if (originalBootstrapToken === undefined) {
      delete process.env.BOOTSTRAP_TOKEN;
    } else {
      process.env.BOOTSTRAP_TOKEN = originalBootstrapToken;
    }
    if (originalThrottleSecret === undefined) {
      delete process.env.AUTH_THROTTLE_SECRET;
    } else {
      process.env.AUTH_THROTTLE_SECRET = originalThrottleSecret;
    }
  });

  it("creates the first owner and a sanitized session with both cookie forms migrated", async () => {
    const response = await setupRoute(
      jsonMutationRequest("/api/auth/setup", {
        bootstrapToken,
        email: "OWNER@Example.com",
        displayName: "Owner",
        password,
        organizationName: "SignalStack",
        organizationSlug: "signalstack",
        timezone: "America/Vancouver"
      })
    );

    expect(response.status).toBe(201);
    expectNoStore(response);
    expect(mocks.createAuthThrottleService).toHaveBeenCalledWith({ secret: throttleSecret });
    expect(mocks.consumeAuthThrottle).toHaveBeenCalledWith({
      scope: AuthThrottleScope.SETUP_NETWORK,
      evidence: "0.0.0.0"
    });
    expect(mocks.consumeAuthThrottle.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createPrismaLocalCredentialService.mock.invocationCallOrder[0]
    );
    expect(mocks.createPrismaLocalCredentialService).toHaveBeenCalledWith({ bootstrapToken });
    expect(mocks.bootstrapFirstOwner).toHaveBeenCalledWith({
      bootstrapToken,
      email: "owner@example.com",
      displayName: "Owner",
      password,
      organizationName: "SignalStack",
      organizationSlug: "signalstack",
      timezone: "America/Vancouver"
    });
    expect(mocks.createLocalSession).toHaveBeenCalledWith(
      { userId: "user-1", orgId: "org-1", expectedAuthVersion: 1 },
      { policy: { idleTtlMs: 1_800_000, absoluteTtlMs: 86_400_000 } }
    );
    expectDualSessionCookies(response, newSessionToken);

    const body = await response.json();
    expect(body).toEqual({ session: publicSessionBody() });
    expect(JSON.stringify(body)).not.toContain(newSessionToken);
    expect(JSON.stringify(body)).not.toContain("database-session-id");
    expect(JSON.stringify(body)).not.toContain(password);
    expect(JSON.stringify(body)).not.toContain(bootstrapToken);
  });

  it("returns the same secret-free setup denial for a wrong token or closed bootstrap", async () => {
    const expected = { error: "Setup is unavailable." };
    for (const code of ["BOOTSTRAP_DENIED", "BOOTSTRAP_CLOSED"]) {
      mocks.bootstrapFirstOwner.mockResolvedValueOnce({ created: false, code });
      const response = await setupRoute(jsonMutationRequest("/api/auth/setup", validSetupBody()));

      expect(response.status).toBe(403);
      expectNoStore(response);
      await expect(response.json()).resolves.toEqual(expected);
    }
  });

  it("rejects malformed setup and login JSON without invoking credential storage", async () => {
    const setupResponse = await setupRoute(malformedMutationRequest("/api/auth/setup"));
    const loginResponse = await loginRoute(malformedMutationRequest("/api/auth/login"));

    expect(setupResponse.status).toBe(400);
    expect(loginResponse.status).toBe(400);
    expectNoStore(setupResponse);
    expectNoStore(loginResponse);
    expect(mocks.createPrismaLocalCredentialService).not.toHaveBeenCalled();
    expect(mocks.consumeAuthThrottle).toHaveBeenCalledTimes(2);
  });

  it("blocks setup and login network buckets before reading request bodies or credentials", async () => {
    const setupRequest = jsonMutationRequest("/api/auth/setup", validSetupBody());
    const setupJson = vi.spyOn(setupRequest, "json");
    mocks.consumeAuthThrottle.mockReset().mockResolvedValueOnce(blockedThrottleDecision(17));

    const setupResponse = await setupRoute(setupRequest);

    await expectRateLimited(setupResponse, 17);
    expect(setupJson).not.toHaveBeenCalled();
    expect(mocks.consumeAuthThrottle).toHaveBeenLastCalledWith({
      scope: AuthThrottleScope.SETUP_NETWORK,
      evidence: "0.0.0.0"
    });
    expect(mocks.createPrismaLocalCredentialService).not.toHaveBeenCalled();

    mocks.consumeAuthThrottle.mockReset().mockResolvedValueOnce(blockedThrottleDecision(23));
    const loginRequest = jsonMutationRequest("/api/auth/login", validLoginBody());
    const loginJson = vi.spyOn(loginRequest, "json");
    const loginResponse = await loginRoute(loginRequest);

    await expectRateLimited(loginResponse, 23);
    expect(loginJson).not.toHaveBeenCalled();
    expect(mocks.consumeAuthThrottle).toHaveBeenLastCalledWith({
      scope: AuthThrottleScope.LOGIN_NETWORK,
      evidence: "0.0.0.0"
    });
    expect(mocks.createPrismaLocalCredentialService).not.toHaveBeenCalled();
  });

  it("blocks a normalized login identity after parsing but before credential lookup", async () => {
    mocks.consumeAuthThrottle
      .mockReset()
      .mockResolvedValueOnce(allowedThrottleDecision())
      .mockResolvedValueOnce(blockedThrottleDecision(31));
    const request = jsonMutationRequest("/api/auth/login", {
      ...validLoginBody(),
      email: "OWNER@Example.com"
    });
    const readBody = vi.spyOn(request, "json");

    const response = await loginRoute(request);

    await expectRateLimited(response, 31);
    expect(readBody).toHaveBeenCalledTimes(1);
    expect(mocks.consumeAuthThrottle.mock.calls).toEqual([
      [{ scope: AuthThrottleScope.LOGIN_NETWORK, evidence: "0.0.0.0" }],
      [{ scope: AuthThrottleScope.LOGIN_EMAIL, evidence: "owner@example.com" }]
    ]);
    expect(mocks.createPrismaLocalCredentialService).not.toHaveBeenCalled();
  });

  it("returns a sanitized 503 when throttle configuration or persistence is unavailable", async () => {
    const rawEvidence = "owner@example.com at 203.0.113.7 with raw throttle secret";
    mocks.consumeAuthThrottle.mockRejectedValueOnce(new Error(rawEvidence));
    const request = jsonMutationRequest("/api/auth/login", validLoginBody());
    const readBody = vi.spyOn(request, "json");

    const response = await loginRoute(request);

    expect(response.status).toBe(503);
    expectNoStore(response);
    expect(readBody).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body).toEqual({ error: "Authentication service unavailable." });
    expect(JSON.stringify(body)).not.toContain(rawEvidence);
    expect(mocks.createPrismaLocalCredentialService).not.toHaveBeenCalled();

    mocks.createAuthThrottleService.mockImplementationOnce(() => {
      throw new Error(`invalid ${throttleSecret}`);
    });
    const misconfigured = await setupRoute(
      jsonMutationRequest("/api/auth/setup", validSetupBody())
    );
    expect(misconfigured.status).toBe(503);
    expectNoStore(misconfigured);
    expect(JSON.stringify(await misconfigured.json())).not.toContain(throttleSecret);
  });

  it("makes setup and login unavailable outside local auth mode", async () => {
    mocks.getRuntimeConfig.mockReturnValue(runtimeConfig({ authMode: "demo" }));

    const setupResponse = await setupRoute(malformedMutationRequest("/api/auth/setup"));
    const loginResponse = await loginRoute(malformedMutationRequest("/api/auth/login"));

    for (const response of [setupResponse, loginResponse]) {
      expect(response.status).toBe(403);
      expectNoStore(response);
      await expect(response.json()).resolves.toEqual({
        error: "Local authentication is unavailable."
      });
    }
    expect(mocks.createPrismaLocalCredentialService).not.toHaveBeenCalled();
    expect(mocks.createAuthThrottleService).not.toHaveBeenCalled();
  });

  it("rejects cross-site setup, login, and logout before any authentication side effect", async () => {
    const requestOptions = {
      host: "app.example.com",
      origin: "https://attacker.example"
    };
    const responses = await Promise.all([
      setupRoute(jsonMutationRequest("/api/auth/setup", validSetupBody(), requestOptions)),
      loginRoute(jsonMutationRequest("/api/auth/login", validLoginBody(), requestOptions)),
      logoutRoute(mutationRequest("/api/auth/logout", requestOptions))
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
      expectNoStore(response);
      await expect(response.json()).resolves.toEqual({ error: "Invalid request origin." });
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(mocks.createPrismaLocalCredentialService).not.toHaveBeenCalled();
    expect(mocks.revokeLocalSession).not.toHaveBeenCalled();
    expect(mocks.createAuthThrottleService).not.toHaveBeenCalled();
  });

  it("uses forwarded origin evidence only when the runtime explicitly trusts its proxy", async () => {
    const headers = {
      host: "internal.service",
      origin: "https://app.example.com",
      "x-forwarded-host": "app.example.com",
      "x-forwarded-proto": "https"
    };
    const rejected = await loginRoute(
      jsonMutationRequest("/api/auth/login", validLoginBody(), headers)
    );
    expect(rejected.status).toBe(403);
    expect(mocks.createPrismaLocalCredentialService).not.toHaveBeenCalled();

    mocks.getRuntimeConfig.mockReturnValue(runtimeConfig({ trustProxy: true }));
    const accepted = await loginRoute(
      jsonMutationRequest("/api/auth/login", validLoginBody(), headers)
    );
    expect(accepted.status).toBe(200);
    expectNoStore(accepted);
    expect(mocks.createPrismaLocalCredentialService).toHaveBeenCalledTimes(1);
  });

  it("ignores spoofable forwarded network evidence unless proxy trust is explicit", async () => {
    const forwardedHeaders = {
      "x-forwarded-for": "203.0.113.7, 10.0.0.2",
      "x-forwarded-host": "localhost",
      "x-forwarded-proto": "http"
    };

    const direct = await loginRoute(
      jsonMutationRequest("/api/auth/login", validLoginBody(), forwardedHeaders)
    );
    expect(direct.status).toBe(200);
    expect(mocks.consumeAuthThrottle.mock.calls[0]?.[0]).toEqual({
      scope: AuthThrottleScope.LOGIN_NETWORK,
      evidence: "0.0.0.0"
    });

    mocks.consumeAuthThrottle.mockClear();
    mocks.getRuntimeConfig.mockReturnValue(runtimeConfig({ trustProxy: true }));
    const proxied = await loginRoute(
      jsonMutationRequest("/api/auth/login", validLoginBody(), forwardedHeaders)
    );
    expect(proxied.status).toBe(200);
    expect(mocks.consumeAuthThrottle.mock.calls[0]?.[0]).toEqual({
      scope: AuthThrottleScope.LOGIN_NETWORK,
      evidence: "203.0.113.7"
    });
  });

  it("authenticates generically, selects the first active membership, and rotates a prior session", async () => {
    const response = await loginRoute(
      jsonMutationRequest(
        "/api/auth/login",
        { email: "OWNER@Example.com", password, redirectTo: "/inbox" },
        { cookie: `signalstack_session=${oldSessionToken}` }
      )
    );

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(mocks.consumeAuthThrottle.mock.calls).toEqual([
      [{ scope: AuthThrottleScope.LOGIN_NETWORK, evidence: "0.0.0.0" }],
      [{ scope: AuthThrottleScope.LOGIN_EMAIL, evidence: "owner@example.com" }]
    ]);
    expect(mocks.consumeAuthThrottle.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.createPrismaLocalCredentialService.mock.invocationCallOrder[0]
    );
    expect(mocks.authenticate).toHaveBeenCalledWith({
      email: "owner@example.com",
      password
    });
    expect(mocks.findFirstMembership).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "ACTIVE" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { orgId: true }
    });
    expect(mocks.revokeLocalSession).toHaveBeenCalledWith(oldSessionToken);
    expect(mocks.createLocalSession).toHaveBeenCalledWith(
      { userId: "user-1", orgId: "org-1", expectedAuthVersion: 1 },
      { policy: { idleTtlMs: 1_800_000, absoluteTtlMs: 86_400_000 } }
    );
    expectDualSessionCookies(response, newSessionToken);
    await expect(response.json()).resolves.toEqual({
      session: publicSessionBody(),
      redirectTo: "/inbox"
    });
  });

  it("uses one login denial for invalid credentials and missing active membership", async () => {
    const expected = { error: "Invalid email or password." };
    mocks.authenticate.mockResolvedValueOnce({
      authenticated: false,
      code: "AUTHENTICATION_DENIED"
    });
    const invalidCredentials = await loginRoute(
      jsonMutationRequest("/api/auth/login", validLoginBody())
    );

    mocks.findFirstMembership.mockResolvedValueOnce(null);
    const missingMembership = await loginRoute(
      jsonMutationRequest("/api/auth/login", validLoginBody())
    );

    for (const response of [invalidCredentials, missingMembership]) {
      expect(response.status).toBe(401);
      expectNoStore(response);
      await expect(response.json()).resolves.toEqual(expected);
    }
    expect(mocks.createLocalSession).not.toHaveBeenCalled();
  });

  it("revokes when present and idempotently clears both cookies on logout", async () => {
    const withSession = await logoutRoute(
      mutationRequest("/api/auth/logout", {
        cookie: `signalstack_session=${oldSessionToken}`
      })
    );
    expect(withSession.status).toBe(204);
    expectNoStore(withSession);
    expect(mocks.revokeLocalSession).toHaveBeenCalledWith(oldSessionToken);
    expectClearedSessionCookies(withSession);

    mocks.revokeLocalSession.mockClear();
    const withoutSession = await logoutRoute(mutationRequest("/api/auth/logout"));
    expect(withoutSession.status).toBe(204);
    expectNoStore(withoutSession);
    expect(mocks.revokeLocalSession).not.toHaveBeenCalled();
    expectClearedSessionCookies(withoutSession);
    expect(mocks.createAuthThrottleService).not.toHaveBeenCalled();
  });

  it("returns only a sanitized resolved principal and clears invalid session evidence", async () => {
    const valid = await sessionRoute(
      sessionRequest({ cookie: `signalstack_session=${oldSessionToken}` })
    );
    expect(valid.status).toBe(200);
    expectNoStore(valid);
    expect(mocks.resolveLocalSession).toHaveBeenCalledWith(oldSessionToken);
    const body = await valid.json();
    expect(body).toEqual({ session: publicSessionBody() });
    expect(JSON.stringify(body)).not.toContain("database-session-id");

    mocks.resolveLocalSession.mockResolvedValueOnce(null);
    const invalid = await sessionRoute(
      sessionRequest({ cookie: `signalstack_session=${oldSessionToken}` })
    );
    expect(invalid.status).toBe(401);
    expectNoStore(invalid);
    await expect(invalid.json()).resolves.toEqual({ error: "Authentication required." });
    expectClearedSessionCookies(invalid);
    expect(mocks.createAuthThrottleService).not.toHaveBeenCalled();
  });

  it("sanitizes storage failures and still clears both cookies when logout cannot revoke", async () => {
    mocks.revokeLocalSession.mockRejectedValueOnce(
      new Error("database passwordHash and raw token must not escape")
    );
    const response = await logoutRoute(
      mutationRequest("/api/auth/logout", {
        cookie: `signalstack_session=${oldSessionToken}`
      })
    );

    expect(response.status).toBe(503);
    expectNoStore(response);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication service unavailable."
    });
    expectClearedSessionCookies(response);
  });
});

function runtimeConfig(
  overrides: Readonly<{
    authMode?: "demo" | "local" | "oidc";
    environment?: "local" | "production";
    trustProxy?: boolean;
  }> = {}
) {
  return {
    runtime: { environment: overrides.environment ?? "local" },
    web: { trustProxy: overrides.trustProxy ?? false },
    auth: {
      mode: overrides.authMode ?? "local",
      sessionIdleMinutes: 30,
      sessionAbsoluteHours: 24
    }
  };
}

function validSetupBody() {
  return {
    bootstrapToken,
    email: "owner@example.com",
    displayName: "Owner",
    password,
    organizationName: "SignalStack",
    organizationSlug: "signalstack",
    timezone: "America/Vancouver"
  };
}

function validLoginBody() {
  return {
    email: "owner@example.com",
    password,
    redirectTo: "/dashboard"
  };
}

function jsonMutationRequest(
  path: string,
  body: unknown,
  headers: Readonly<Record<string, string>> = {}
) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host: "localhost",
      origin: "http://localhost",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

function malformedMutationRequest(path: string) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host: "localhost",
      origin: "http://localhost"
    },
    body: "{"
  });
}

function mutationRequest(
  path: string,
  headers: Readonly<Record<string, string>> = {}
) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      host: "localhost",
      origin: "http://localhost",
      ...headers
    }
  });
}

function sessionRequest(headers: Readonly<Record<string, string>> = {}) {
  return new Request("http://localhost/api/auth/session", {
    headers: { host: "localhost", ...headers }
  });
}

function publicSessionBody() {
  return {
    user: {
      id: "user-1",
      email: "owner@example.com",
      displayName: "Owner"
    },
    organization: {
      id: "org-1",
      slug: "signalstack",
      name: "SignalStack",
      demoMode: false
    },
    membership: { role: "OWNER" },
    createdAt: "2030-01-01T00:00:00.000Z",
    lastSeenAt: "2030-01-01T00:05:00.000Z",
    idleExpiresAt: "2099-01-01T00:30:00.000Z",
    absoluteExpiresAt: "2099-01-02T00:00:00.000Z"
  };
}

function allowedThrottleDecision() {
  return {
    allowed: true,
    limit: 5,
    remaining: 4,
    resetAt: new Date("2030-01-01T00:15:00.000Z"),
    retryAfterSeconds: 0
  };
}

function blockedThrottleDecision(retryAfterSeconds: number) {
  return {
    allowed: false,
    limit: 5,
    remaining: 0,
    resetAt: new Date("2030-01-01T00:15:00.000Z"),
    retryAfterSeconds
  };
}

async function expectRateLimited(response: Response, retryAfterSeconds: number) {
  expect(response.status).toBe(429);
  expectNoStore(response);
  expect(response.headers.get("retry-after")).toBe(retryAfterSeconds.toString());
  await expect(response.json()).resolves.toEqual({
    error: "Too many authentication attempts."
  });
}

function expectNoStore(response: Response) {
  expect(response.headers.get("cache-control")).toContain("no-store");
}

function expectDualSessionCookies(response: Response, token: string) {
  const header = response.headers.get("set-cookie") ?? "";
  expect(header).toContain("__Host-signalstack_session=");
  expect(header).toContain("__Host-signalstack_session=; Path=/; Expires=Thu, 01 Jan 1970");
  expect(header).toContain(`signalstack_session=${token}`);
}

function expectClearedSessionCookies(response: Response) {
  const header = response.headers.get("set-cookie") ?? "";
  expect(header).toContain("signalstack_session=; Path=/; Expires=Thu, 01 Jan 1970");
  expect(header).toContain("__Host-signalstack_session=; Path=/; Expires=Thu, 01 Jan 1970");
}
