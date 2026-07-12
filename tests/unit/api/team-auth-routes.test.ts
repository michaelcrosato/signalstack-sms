import { AuthThrottleScope, MembershipRole, MembershipStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listTeamRoute } from "@/app/api/auth/team/route";
import { POST as createInviteRoute } from "@/app/api/auth/team/invites/route";
import { DELETE as revokeInviteRoute } from "@/app/api/auth/team/invites/[inviteId]/route";
import { POST as acceptInviteRoute } from "@/app/api/auth/team/invites/accept/route";
import {
  DELETE as revokeMemberRoute,
  PATCH as updateMemberRoute
} from "@/app/api/auth/team/members/[userId]/route";
import { TeamServiceError } from "@/lib/auth/team-service";

const mocks = vi.hoisted(() => ({
  acceptTeamInvite: vi.fn(),
  authenticateApiRequest: vi.fn(),
  consumeAuthThrottle: vi.fn(),
  createAuthThrottleService: vi.fn(),
  createLocalSession: vi.fn(),
  createTeamInvite: vi.fn(),
  getRuntimeConfig: vi.fn(),
  listTeam: vi.fn(),
  reactivateTeamMember: vi.fn(),
  requireApiRole: vi.fn(),
  resolveLocalSession: vi.fn(),
  revokeTeamInvite: vi.fn(),
  revokeTeamMember: vi.fn(),
  suspendTeamMember: vi.fn(),
  switchLocalSessionOrganization: vi.fn(),
  updateTeamMemberRole: vi.fn()
}));

vi.mock("@/lib/auth/api-authentication", () => ({
  authenticateApiRequest: mocks.authenticateApiRequest
}));

vi.mock("@/lib/auth/api-authorization", () => ({
  requireApiRole: mocks.requireApiRole
}));

vi.mock("@/lib/auth/auth-throttle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/auth-throttle")>();
  return { ...actual, createAuthThrottleService: mocks.createAuthThrottleService };
});

vi.mock("@/lib/auth/local-session", () => ({
  createLocalSession: mocks.createLocalSession,
  resolveLocalSession: mocks.resolveLocalSession,
  switchLocalSessionOrganization: mocks.switchLocalSessionOrganization
}));

vi.mock("@/lib/auth/team-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/team-service")>();
  return {
    ...actual,
    acceptTeamInvite: mocks.acceptTeamInvite,
    createTeamInvite: mocks.createTeamInvite,
    listTeam: mocks.listTeam,
    reactivateTeamMember: mocks.reactivateTeamMember,
    revokeTeamInvite: mocks.revokeTeamInvite,
    revokeTeamMember: mocks.revokeTeamMember,
    suspendTeamMember: mocks.suspendTeamMember,
    updateTeamMemberRole: mocks.updateTeamMemberRole
  };
});

vi.mock("@/lib/env/runtime-config", () => ({
  getRuntimeConfig: mocks.getRuntimeConfig
}));

const throttleSecret = "team-route-throttle-secret-0123456789abcdef";
const originalThrottleSecret = process.env.AUTH_THROTTLE_SECRET;
const rawInviteToken = `ss_invite_${"i".repeat(43)}`;
const localSessionToken = `ss_session_${"l".repeat(43)}`;
const productionSessionToken = `ss_session_${"p".repeat(43)}`;
const newSessionToken = `ss_session_${"n".repeat(43)}`;
const absoluteExpiry = new Date("2099-07-11T00:00:00.000Z");

const currentOrg = Object.freeze({
  orgId: "org-current",
  orgSlug: "current",
  orgName: "Current Organization",
  userId: "user-owner",
  email: "owner@example.test",
  role: MembershipRole.OWNER,
  demoMode: false
});

const teamMember = Object.freeze({
  membershipId: "membership-member",
  orgId: currentOrg.orgId,
  userId: "user-member",
  email: "member@example.test",
  displayName: "Member",
  role: MembershipRole.MEMBER,
  status: MembershipStatus.ACTIVE,
  userDisabled: false,
  createdAt: new Date("2026-07-10T00:00:00.000Z"),
  updatedAt: new Date("2026-07-10T00:00:00.000Z")
});

const pendingInvite = Object.freeze({
  inviteId: "invite-one",
  orgId: currentOrg.orgId,
  email: "invitee@example.test",
  role: MembershipRole.MEMBER,
  issuedByUserId: currentOrg.userId,
  expiresAt: new Date("2026-07-14T00:00:00.000Z"),
  createdAt: new Date("2026-07-11T00:00:00.000Z")
});

const resolvedSession = Object.freeze({
  sessionId: "session-one",
  userId: teamMember.userId,
  email: teamMember.email,
  displayName: teamMember.displayName,
  orgId: "org-before-acceptance",
  orgSlug: "before",
  orgName: "Before",
  role: MembershipRole.MEMBER,
  demoMode: false,
  createdAt: new Date("2026-07-11T00:00:00.000Z"),
  lastSeenAt: new Date("2026-07-11T00:00:00.000Z"),
  idleExpiresAt: new Date("2099-07-10T00:30:00.000Z"),
  absoluteExpiresAt: absoluteExpiry
});

const switchedSession = Object.freeze({
  ...resolvedSession,
  orgId: currentOrg.orgId,
  orgSlug: currentOrg.orgSlug,
  orgName: currentOrg.orgName
});

describe("team authentication API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_THROTTLE_SECRET = throttleSecret;
    mocks.authenticateApiRequest.mockResolvedValue({ ok: true, currentOrg });
    mocks.requireApiRole.mockReturnValue(null);
    mocks.getRuntimeConfig.mockReturnValue(runtimeConfig());
    mocks.createAuthThrottleService.mockReturnValue({ consume: mocks.consumeAuthThrottle });
    mocks.consumeAuthThrottle.mockResolvedValue(allowedThrottleDecision());
    mocks.listTeam.mockResolvedValue({ members: [teamMember], pendingInvites: [pendingInvite] });
    mocks.createTeamInvite.mockResolvedValue({ invite: pendingInvite, token: rawInviteToken });
    mocks.revokeTeamInvite.mockResolvedValue({
      inviteId: pendingInvite.inviteId,
      revokedAt: new Date("2026-07-11T00:05:00.000Z")
    });
    mocks.updateTeamMemberRole.mockResolvedValue({
      ...teamMember,
      role: MembershipRole.ADMIN
    });
    mocks.suspendTeamMember.mockResolvedValue({
      ...teamMember,
      status: MembershipStatus.SUSPENDED
    });
    mocks.reactivateTeamMember.mockResolvedValue(teamMember);
    mocks.revokeTeamMember.mockResolvedValue({
      userId: teamMember.userId,
      revokedAt: new Date("2026-07-11T00:05:00.000Z")
    });
    mocks.acceptTeamInvite.mockResolvedValue({
      member: teamMember,
      accountCreated: true,
      sessionAuthVersion: 1
    });
    mocks.resolveLocalSession.mockResolvedValue(null);
    mocks.createLocalSession.mockResolvedValue({
      token: newSessionToken,
      session: { ...switchedSession, absoluteExpiresAt: absoluteExpiry }
    });
    mocks.switchLocalSessionOrganization.mockResolvedValue(switchedSession);
  });

  afterAll(() => {
    if (originalThrottleSecret === undefined) {
      delete process.env.AUTH_THROTTLE_SECRET;
    } else {
      process.env.AUTH_THROTTLE_SECRET = originalThrottleSecret;
    }
  });

  it("lists the same-tenant roster after authentication, ADMIN authorization, and local-mode checks", async () => {
    const response = await listTeamRoute();

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(mocks.authenticateApiRequest).toHaveBeenCalledWith();
    expect(mocks.requireApiRole).toHaveBeenCalledWith(currentOrg, MembershipRole.ADMIN);
    expect(mocks.listTeam).toHaveBeenCalledWith({
      userId: currentOrg.userId,
      orgId: currentOrg.orgId
    });
    expect(mocks.authenticateApiRequest.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.requireApiRole.mock.invocationCallOrder[0]
    );
    expect(mocks.requireApiRole.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getRuntimeConfig.mock.invocationCallOrder[0]
    );
    await expect(response.json()).resolves.toEqual({
      members: [jsonMember(teamMember)],
      pendingInvites: [jsonInvite(pendingInvite)]
    });
  });

  it("returns authentication failures before role, mode, params, body, or team services", async () => {
    const authenticationResponse = NextResponse.json(
      { error: "Authentication required.", code: "AUTH_REQUIRED" },
      { status: 401 }
    );
    mocks.authenticateApiRequest.mockResolvedValue({ ok: false, response: authenticationResponse });
    const requests = adminMutationCases();

    for (const entry of requests) {
      const readBody = vi.spyOn(entry.request, "json");
      const response = await entry.invoke();
      expect(response).toBe(authenticationResponse);
      expectNoStore(response);
      expect(readBody).not.toHaveBeenCalled();
    }
    expect(mocks.requireApiRole).not.toHaveBeenCalled();
    expect(mocks.getRuntimeConfig).not.toHaveBeenCalled();
    expectNoAdminMutationServiceCalls();
  });

  it("enforces ADMIN authorization before local mode, origin, params, body, or team services", async () => {
    mocks.requireApiRole.mockReturnValue(
      NextResponse.json({ error: "Requires ADMIN role or higher." }, { status: 403 })
    );
    const requests = adminMutationCases({ origin: "https://attacker.example" });

    for (const entry of requests) {
      const readBody = vi.spyOn(entry.request, "json");
      const response = await entry.invoke();
      expect(response.status).toBe(403);
      expectNoStore(response);
      expect(readBody).not.toHaveBeenCalled();
    }
    expect(mocks.getRuntimeConfig).not.toHaveBeenCalled();
    expectNoAdminMutationServiceCalls();
  });

  it("rejects non-local and cross-origin admin mutations before parsing or service calls", async () => {
    mocks.getRuntimeConfig.mockReturnValue(runtimeConfig({ authMode: "demo" }));
    for (const entry of adminMutationCases()) {
      const reader = vi.spyOn(entry.request, "json");
      const response = await entry.invoke();
      expect(response.status).toBe(403);
      expectNoStore(response);
      expect(reader).not.toHaveBeenCalled();
    }
    expectNoAdminMutationServiceCalls();

    mocks.getRuntimeConfig.mockReturnValue(runtimeConfig());
    for (const entry of adminMutationCases({ origin: "https://attacker.example" })) {
      const reader = vi.spyOn(entry.request, "json");
      const response = await entry.invoke();
      expect(response.status).toBe(403);
      expectNoStore(response);
      expect(reader).not.toHaveBeenCalled();
    }
    expectNoAdminMutationServiceCalls();
  });

  it("returns the invite bearer only once inside the fragment acceptPath", async () => {
    const payload = {
      email: "INVITEE@example.test",
      role: MembershipRole.MEMBER,
      expiresInHours: 72
    };
    const request = jsonRequest("/api/auth/team/invites", "POST", payload);
    const response = await createInviteRoute(request);

    expect(response.status).toBe(201);
    expectNoStore(response);
    expect(mocks.createTeamInvite).toHaveBeenCalledWith(
      { userId: currentOrg.userId, orgId: currentOrg.orgId },
      payload
    );
    const body = await response.json();
    expect(body).toEqual({
      invite: jsonInvite(pendingInvite),
      acceptPath: `/invite#token=${rawInviteToken}`
    });
    expect(Object.keys(body)).toEqual(["invite", "acceptPath"]);
    expect(body).not.toHaveProperty("token");
    expect(JSON.stringify(body)).not.toMatch(/tokenHash|passwordHash/);
  });

  it("revokes only the dynamic same-tenant invite selected by the authenticated actor", async () => {
    const request = emptyRequest(
      `/api/auth/team/invites/${pendingInvite.inviteId}`,
      "DELETE"
    );
    const response = await revokeInviteRoute(
      request,
      inviteContext(pendingInvite.inviteId)
    );

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(mocks.revokeTeamInvite).toHaveBeenCalledWith(
      { userId: currentOrg.userId, orgId: currentOrg.orgId },
      pendingInvite.inviteId
    );
    expect(JSON.stringify(await response.json())).not.toMatch(/token|hash|password/i);
  });

  it("accepts exactly one member PATCH variant and rejects mixed or extended bodies", async () => {
    const roleResponse = await updateMemberRoute(
      jsonRequest(`/api/auth/team/members/${teamMember.userId}`, "PATCH", {
        role: MembershipRole.ADMIN
      }),
      memberContext(teamMember.userId)
    );
    expect(roleResponse.status).toBe(200);
    expect(mocks.updateTeamMemberRole).toHaveBeenCalledWith(
      { userId: currentOrg.userId, orgId: currentOrg.orgId },
      teamMember.userId,
      { role: MembershipRole.ADMIN }
    );

    await updateMemberRoute(
      jsonRequest(`/api/auth/team/members/${teamMember.userId}`, "PATCH", {
        suspended: true
      }),
      memberContext(teamMember.userId)
    );
    expect(mocks.suspendTeamMember).toHaveBeenCalledWith(
      { userId: currentOrg.userId, orgId: currentOrg.orgId },
      teamMember.userId
    );

    await updateMemberRoute(
      jsonRequest(`/api/auth/team/members/${teamMember.userId}`, "PATCH", {
        suspended: false
      }),
      memberContext(teamMember.userId)
    );
    expect(mocks.reactivateTeamMember).toHaveBeenCalledWith(
      { userId: currentOrg.userId, orgId: currentOrg.orgId },
      teamMember.userId
    );

    for (const body of [
      {},
      { role: MembershipRole.ADMIN, suspended: true },
      { role: MembershipRole.ADMIN, userId: "foreign-user" },
      { suspended: false, orgId: "foreign-org" }
    ]) {
      const response = await updateMemberRoute(
        jsonRequest(`/api/auth/team/members/${teamMember.userId}`, "PATCH", body),
        memberContext(teamMember.userId)
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Team operation input is invalid.",
        code: "INVALID_INPUT"
      });
    }
    expect(mocks.updateTeamMemberRole).toHaveBeenCalledTimes(1);
    expect(mocks.suspendTeamMember).toHaveBeenCalledTimes(1);
    expect(mocks.reactivateTeamMember).toHaveBeenCalledTimes(1);
  });

  it("revokes a member with server-derived actor and dynamic target only", async () => {
    const request = emptyRequest(
      `/api/auth/team/members/${teamMember.userId}`,
      "DELETE"
    );
    const response = await revokeMemberRoute(request, memberContext(teamMember.userId));

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(mocks.revokeTeamMember).toHaveBeenCalledWith(
      { userId: currentOrg.userId, orgId: currentOrg.orgId },
      teamMember.userId
    );
  });

  it("maps typed and unexpected admin service failures to no-store secret-free responses", async () => {
    mocks.revokeTeamInvite.mockRejectedValueOnce(
      new TeamServiceError("TEAM_RESOURCE_UNAVAILABLE")
    );
    const unavailable = await revokeInviteRoute(
      emptyRequest(`/api/auth/team/invites/foreign-invite`, "DELETE"),
      inviteContext("foreign-invite")
    );
    expect(unavailable.status).toBe(404);
    expectNoStore(unavailable);
    await expect(unavailable.json()).resolves.toEqual({
      error: "The team resource is unavailable.",
      code: "TEAM_RESOURCE_UNAVAILABLE"
    });

    const secret = "postgres://admin:secret@internal/team";
    mocks.listTeam.mockRejectedValueOnce(new Error(secret));
    const failed = await listTeamRoute();
    expect(failed.status).toBe(500);
    expectNoStore(failed);
    const body = await failed.json();
    expect(body).toEqual({
      error: "Team operation failed.",
      code: "TEAM_OPERATION_FAILED"
    });
    expect(JSON.stringify(body)).not.toContain(secret);
  });

  it("runs local-mode, same-origin, and DB network throttle gates before invite body parsing", async () => {
    mocks.getRuntimeConfig.mockReturnValue(runtimeConfig({ authMode: "demo" }));
    const modeRequest = jsonRequest("/api/auth/team/invites/accept", "POST", {
      token: rawInviteToken
    });
    const modeReader = vi.spyOn(modeRequest, "json");
    expect((await acceptInviteRoute(modeRequest)).status).toBe(403);
    expect(modeReader).not.toHaveBeenCalled();
    expect(mocks.createAuthThrottleService).not.toHaveBeenCalled();

    mocks.getRuntimeConfig.mockReturnValue(runtimeConfig());
    const originRequest = jsonRequest(
      "/api/auth/team/invites/accept",
      "POST",
      { token: rawInviteToken },
      { origin: "https://attacker.example" }
    );
    const originReader = vi.spyOn(originRequest, "json");
    expect((await acceptInviteRoute(originRequest)).status).toBe(403);
    expect(originReader).not.toHaveBeenCalled();
    expect(mocks.createAuthThrottleService).not.toHaveBeenCalled();

    mocks.consumeAuthThrottle.mockResolvedValueOnce(blockedThrottleDecision());
    const throttledRequest = jsonRequest("/api/auth/team/invites/accept", "POST", {
      token: rawInviteToken
    });
    const throttledReader = vi.spyOn(throttledRequest, "json");
    const throttled = await acceptInviteRoute(throttledRequest);
    expect(throttled.status).toBe(429);
    expectNoStore(throttled);
    expect(throttled.headers.get("retry-after")).toBe("60");
    expect(throttledReader).not.toHaveBeenCalled();
    expect(mocks.resolveLocalSession).not.toHaveBeenCalled();
    expect(mocks.acceptTeamInvite).not.toHaveBeenCalled();
    expect(mocks.createAuthThrottleService).toHaveBeenCalledWith({ secret: throttleSecret });
    expect(mocks.consumeAuthThrottle).toHaveBeenCalledWith({
      scope: AuthThrottleScope.LOGIN_NETWORK,
      evidence: "0.0.0.0"
    });
  });

  it("throttles before parsing and honors forwarded network evidence only behind a trusted proxy", async () => {
    mocks.getRuntimeConfig.mockReturnValue(runtimeConfig({ trustProxy: true }));
    const request = jsonRequest(
      "/api/auth/team/invites/accept",
      "POST",
      {
        token: rawInviteToken,
        displayName: "New Member",
        password: "correct horse battery staple"
      },
      {
        headers: {
          "x-forwarded-for": "203.0.113.8",
          "x-forwarded-host": "localhost:3000",
          "x-forwarded-proto": "http"
        }
      }
    );
    const reader = vi.spyOn(request, "json");

    await acceptInviteRoute(request);

    expect(mocks.consumeAuthThrottle).toHaveBeenCalledWith({
      scope: AuthThrottleScope.LOGIN_NETWORK,
      evidence: "203.0.113.8"
    });
    expect(mocks.consumeAuthThrottle.mock.invocationCallOrder[0]).toBeLessThan(
      reader.mock.invocationCallOrder[0]
    );
  });

  it("creates a configured local session and secure-mode cookie for a new invitee", async () => {
    const password = "correct horse battery staple";
    const payload = {
      token: rawInviteToken,
      displayName: "New Member",
      password
    };
    const request = jsonRequest("/api/auth/team/invites/accept", "POST", payload);
    const response = await acceptInviteRoute(request);

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(mocks.acceptTeamInvite).toHaveBeenCalledWith(null, payload);
    expect(mocks.createLocalSession).toHaveBeenCalledWith(
      {
        userId: teamMember.userId,
        orgId: teamMember.orgId,
        expectedAuthVersion: 1
      },
      { policy: { idleTtlMs: 1_800_000, absoluteTtlMs: 86_400_000 } }
    );
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`signalstack_session=${newSessionToken}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).not.toMatch(/signalstack_session=[^;,]+;[^,]*Secure/i);
    const body = await response.json();
    expect(body).toEqual({
      member: jsonMember(teamMember),
      accountCreated: true,
      redirectTo: "/team"
    });
    const responseJson = JSON.stringify(body);
    expect(responseJson).not.toContain(rawInviteToken);
    expect(responseJson).not.toContain(password);
    expect(responseJson).not.toContain(newSessionToken);
    expect(responseJson).not.toMatch(/tokenHash|passwordHash/);
  });

  it("uses the production __Host cookie with Secure for a new invitee", async () => {
    mocks.getRuntimeConfig.mockReturnValue(runtimeConfig({ production: true }));
    const response = await acceptInviteRoute(
      jsonRequest(
        "/api/auth/team/invites/accept",
        "POST",
        {
          token: rawInviteToken,
          displayName: "New Member",
          password: "correct horse battery staple"
        },
        { urlOrigin: "https://app.example.test", host: "app.example.test" }
      )
    );

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`__Host-signalstack_session=${newSessionToken}`);
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Domain=");
  });

  it("email-throttles an existing-account proof and creates a generation-bound session", async () => {
    mocks.acceptTeamInvite.mockResolvedValue({
      member: teamMember,
      accountCreated: false,
      sessionAuthVersion: 7
    });
    const payload = {
      token: rawInviteToken,
      email: " MEMBER@EXAMPLE.TEST ",
      password: "correct horse battery staple"
    };
    const response = await acceptInviteRoute(
      jsonRequest("/api/auth/team/invites/accept", "POST", payload)
    );

    expect(response.status).toBe(200);
    expect(mocks.consumeAuthThrottle).toHaveBeenNthCalledWith(1, {
      scope: AuthThrottleScope.LOGIN_NETWORK,
      evidence: "0.0.0.0"
    });
    expect(mocks.consumeAuthThrottle).toHaveBeenNthCalledWith(2, {
      scope: AuthThrottleScope.LOGIN_EMAIL,
      evidence: teamMember.email
    });
    expect(mocks.acceptTeamInvite).toHaveBeenCalledWith(null, {
      token: rawInviteToken,
      email: teamMember.email,
      password: payload.password
    });
    expect(mocks.createLocalSession).toHaveBeenCalledWith(
      {
        userId: teamMember.userId,
        orgId: teamMember.orgId,
        expectedAuthVersion: 7
      },
      { policy: { idleTtlMs: 1_800_000, absoluteTtlMs: 86_400_000 } }
    );
    expect(response.headers.get("set-cookie")).toContain(
      `signalstack_session=${newSessionToken}`
    );
    await expect(response.json()).resolves.toMatchObject({
      accountCreated: false,
      redirectTo: "/team"
    });
  });

  it("blocks an existing-account proof at the targeted email throttle", async () => {
    mocks.consumeAuthThrottle
      .mockResolvedValueOnce(allowedThrottleDecision())
      .mockResolvedValueOnce(blockedThrottleDecision());
    const response = await acceptInviteRoute(
      jsonRequest("/api/auth/team/invites/accept", "POST", {
        token: rawInviteToken,
        email: teamMember.email,
        password: "correct horse battery staple"
      })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(mocks.consumeAuthThrottle).toHaveBeenNthCalledWith(2, {
      scope: AuthThrottleScope.LOGIN_EMAIL,
      evidence: teamMember.email
    });
    expect(mocks.acceptTeamInvite).not.toHaveBeenCalled();
    expect(mocks.createLocalSession).not.toHaveBeenCalled();
  });

  it("accepts for a matching authenticated user and switches the same session without returning or rotating it", async () => {
    mocks.resolveLocalSession.mockResolvedValue(resolvedSession);
    mocks.acceptTeamInvite.mockResolvedValue({
      member: teamMember,
      accountCreated: false,
      sessionAuthVersion: null
    });
    const payload = { token: rawInviteToken };
    const request = jsonRequest(
      "/api/auth/team/invites/accept",
      "POST",
      payload,
      { cookie: `signalstack_session=${localSessionToken}` }
    );
    const response = await acceptInviteRoute(request);

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(mocks.resolveLocalSession).toHaveBeenCalledWith(localSessionToken);
    expect(mocks.acceptTeamInvite).toHaveBeenCalledWith(
      { userId: resolvedSession.userId },
      payload
    );
    expect(mocks.switchLocalSessionOrganization).toHaveBeenCalledWith(
      localSessionToken,
      teamMember.orgId
    );
    expect(mocks.createLocalSession).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
    const body = await response.json();
    expect(body.accountCreated).toBe(false);
    expect(JSON.stringify(body)).not.toContain(localSessionToken);
    expect(JSON.stringify(body)).not.toContain(rawInviteToken);
  });

  it("reads only the environment-appropriate existing cookie during production acceptance", async () => {
    mocks.getRuntimeConfig.mockReturnValue(runtimeConfig({ production: true }));
    mocks.resolveLocalSession.mockResolvedValue(resolvedSession);
    mocks.acceptTeamInvite.mockResolvedValue({
      member: teamMember,
      accountCreated: false,
      sessionAuthVersion: null
    });
    const request = jsonRequest(
      "/api/auth/team/invites/accept",
      "POST",
      { token: rawInviteToken },
      {
        urlOrigin: "https://app.example.test",
        host: "app.example.test",
        cookie: [
          `signalstack_session=${localSessionToken}`,
          `__Host-signalstack_session=${productionSessionToken}`
        ].join("; ")
      }
    );

    await acceptInviteRoute(request);

    expect(mocks.resolveLocalSession).toHaveBeenCalledWith(productionSessionToken);
    expect(mocks.switchLocalSessionOrganization).toHaveBeenCalledWith(
      productionSessionToken,
      teamMember.orgId
    );
    expect(mocks.resolveLocalSession.mock.calls[0]?.[0]).not.toBe(localSessionToken);
  });

  it("returns generic replay and session-switch failures without echoing bearer material", async () => {
    mocks.acceptTeamInvite.mockRejectedValueOnce(
      new TeamServiceError("INVITE_UNAVAILABLE")
    );
    const replay = await acceptInviteRoute(
      jsonRequest("/api/auth/team/invites/accept", "POST", {
        token: rawInviteToken,
        displayName: "Replay",
        password: "correct horse battery staple"
      })
    );
    expect(replay.status).toBe(400);
    expectNoStore(replay);
    const replayBody = await replay.json();
    expect(replayBody).toEqual({
      error: "The invitation is unavailable.",
      code: "INVITE_UNAVAILABLE"
    });
    expect(JSON.stringify(replayBody)).not.toContain(rawInviteToken);

    mocks.resolveLocalSession.mockResolvedValue(resolvedSession);
    mocks.acceptTeamInvite.mockResolvedValueOnce({
      member: teamMember,
      accountCreated: false,
      sessionAuthVersion: null
    });
    mocks.switchLocalSessionOrganization.mockResolvedValueOnce(null);
    const switchFailure = await acceptInviteRoute(
      jsonRequest(
        "/api/auth/team/invites/accept",
        "POST",
        { token: rawInviteToken },
        { cookie: `signalstack_session=${localSessionToken}` }
      )
    );
    expect(switchFailure.status).toBe(503);
    const switchBody = await switchFailure.json();
    expect(switchBody).toEqual({
      error: "Authentication service unavailable.",
      code: "AUTH_SERVICE_UNAVAILABLE"
    });
    expect(JSON.stringify(switchBody)).not.toContain(rawInviteToken);
    expect(JSON.stringify(switchBody)).not.toContain(localSessionToken);
  });

  it("sanitizes throttle/configuration failures before body parsing", async () => {
    const secret = "database-password-and-network-evidence";
    mocks.consumeAuthThrottle.mockRejectedValueOnce(new Error(secret));
    const request = jsonRequest("/api/auth/team/invites/accept", "POST", {
      token: rawInviteToken
    });
    const reader = vi.spyOn(request, "json");
    const response = await acceptInviteRoute(request);

    expect(response.status).toBe(503);
    expectNoStore(response);
    expect(reader).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body).toEqual({
      error: "Authentication service unavailable.",
      code: "AUTH_SERVICE_UNAVAILABLE"
    });
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(JSON.stringify(body)).not.toContain(rawInviteToken);
  });
});

function adminMutationCases(options: { origin?: string } = {}) {
  const createRequest = jsonRequest(
    "/api/auth/team/invites",
    "POST",
    { email: "invitee@example.test" },
    options
  );
  const inviteDeleteRequest = emptyRequest(
    `/api/auth/team/invites/${pendingInvite.inviteId}`,
    "DELETE",
    options
  );
  const memberPatchRequest = jsonRequest(
    `/api/auth/team/members/${teamMember.userId}`,
    "PATCH",
    { suspended: true },
    options
  );
  const memberDeleteRequest = emptyRequest(
    `/api/auth/team/members/${teamMember.userId}`,
    "DELETE",
    options
  );
  return [
    { request: createRequest, invoke: () => createInviteRoute(createRequest) },
    {
      request: inviteDeleteRequest,
      invoke: () =>
        revokeInviteRoute(inviteDeleteRequest, inviteContext(pendingInvite.inviteId))
    },
    {
      request: memberPatchRequest,
      invoke: () => updateMemberRoute(memberPatchRequest, memberContext(teamMember.userId))
    },
    {
      request: memberDeleteRequest,
      invoke: () => revokeMemberRoute(memberDeleteRequest, memberContext(teamMember.userId))
    }
  ];
}

function expectNoAdminMutationServiceCalls() {
  expect(mocks.createTeamInvite).not.toHaveBeenCalled();
  expect(mocks.revokeTeamInvite).not.toHaveBeenCalled();
  expect(mocks.updateTeamMemberRole).not.toHaveBeenCalled();
  expect(mocks.suspendTeamMember).not.toHaveBeenCalled();
  expect(mocks.reactivateTeamMember).not.toHaveBeenCalled();
  expect(mocks.revokeTeamMember).not.toHaveBeenCalled();
}

function runtimeConfig(
  options: {
    authMode?: "local" | "demo";
    production?: boolean;
    trustProxy?: boolean;
  } = {}
) {
  return {
    auth: {
      mode: options.authMode ?? "local",
      sessionIdleMinutes: 30,
      sessionAbsoluteHours: 24
    },
    runtime: { environment: options.production ? "production" : "local" },
    web: { trustProxy: options.trustProxy ?? false }
  };
}

function jsonRequest(
  path: string,
  method: string,
  body: unknown,
  options: {
    cookie?: string;
    headers?: Record<string, string>;
    host?: string;
    origin?: string;
    urlOrigin?: string;
  } = {}
) {
  return request(path, method, JSON.stringify(body), options);
}

function emptyRequest(
  path: string,
  method: string,
  options: {
    cookie?: string;
    headers?: Record<string, string>;
    host?: string;
    origin?: string;
    urlOrigin?: string;
  } = {}
) {
  return request(path, method, undefined, options);
}

function request(
  path: string,
  method: string,
  body: string | undefined,
  options: {
    cookie?: string;
    headers?: Record<string, string>;
    host?: string;
    origin?: string;
    urlOrigin?: string;
  }
) {
  const urlOrigin = options.urlOrigin ?? "http://localhost:3000";
  const headers = new Headers({
    "content-type": "application/json",
    host: options.host ?? "localhost:3000",
    origin: options.origin ?? urlOrigin,
    ...options.headers
  });
  if (options.cookie) {
    headers.set("cookie", options.cookie);
  }
  return new Request(`${urlOrigin}${path}`, { method, headers, body });
}

function memberContext(userId: string) {
  return { params: Promise.resolve({ userId }) };
}

function inviteContext(inviteId: string) {
  return { params: Promise.resolve({ inviteId }) };
}

function allowedThrottleDecision() {
  return {
    allowed: true,
    limit: 30,
    remaining: 29,
    resetAt: new Date("2099-07-11T00:15:00.000Z"),
    retryAfterSeconds: 0
  };
}

function blockedThrottleDecision() {
  return {
    allowed: false,
    limit: 30,
    remaining: 0,
    resetAt: new Date("2099-07-11T00:15:00.000Z"),
    retryAfterSeconds: 60
  };
}

function jsonMember(member: typeof teamMember) {
  return {
    ...member,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString()
  };
}

function jsonInvite(invite: typeof pendingInvite) {
  return {
    ...invite,
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString()
  };
}

function expectNoStore(response: Response) {
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("expires")).toBe("0");
  expect(response.headers.get("pragma")).toBe("no-cache");
}
