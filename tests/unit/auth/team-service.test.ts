import { MembershipRole, MembershipStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashOpaqueToken } from "@/lib/auth/crypto";
import type { LocalAuthenticationResult } from "@/lib/auth/local-credentials";
import {
  acceptTeamInvite,
  canGrantTeamRole,
  canManageTeamRole,
  createTeamInvite,
  listTeam,
  reactivateTeamMember,
  revokeTeamInvite,
  revokeTeamMember,
  suspendTeamMember,
  TeamServiceError,
  updateTeamMemberRole,
  type AcceptTeamInviteStoreInput,
  type AcceptedTeamInvite,
  type CreateTeamInviteStoreInput,
  type PendingTeamInviteSummary,
  type RevokeTeamInviteStoreInput,
  type TeamActor,
  type TeamMemberMutationStoreInput,
  type TeamMemberSummary,
  type TeamRoster,
  type TeamServiceStore,
  type TeamStoreResult,
  type UpdateTeamMemberRoleStoreInput
} from "@/lib/auth/team-service";

const NOW = new Date("2026-07-10T12:00:00.000Z");
const ACTOR = Object.freeze({ userId: "user-owner", orgId: "org-one" });
const RAW_INVITE_TOKEN = `ss_invite_${"a".repeat(43)}`;
const INVITE_TOKEN_HASH = hashOpaqueToken(RAW_INVITE_TOKEN);

function member(
  overrides: Partial<TeamMemberSummary> = {}
): TeamMemberSummary {
  return {
    membershipId: "membership-one",
    orgId: ACTOR.orgId,
    userId: "user-member",
    email: "member@example.test",
    displayName: "Member",
    role: MembershipRole.MEMBER,
    status: MembershipStatus.ACTIVE,
    userDisabled: false,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    ...overrides
  };
}

function invite(
  overrides: Partial<PendingTeamInviteSummary> = {}
): PendingTeamInviteSummary {
  return {
    inviteId: "invite-one",
    orgId: ACTOR.orgId,
    email: "invitee@example.test",
    role: MembershipRole.MEMBER,
    issuedByUserId: ACTOR.userId,
    expiresAt: new Date("2026-07-13T12:00:00.000Z"),
    createdAt: NOW,
    ...overrides
  };
}

class FakeTeamStore implements TeamServiceStore {
  inviteAvailableResult = true;
  listResult: TeamStoreResult<TeamRoster> = {
    ok: true,
    value: { members: [member()], pendingInvites: [invite()] }
  };
  createResult: TeamStoreResult<PendingTeamInviteSummary> = {
    ok: true,
    value: invite()
  };
  revokeInviteResult: TeamStoreResult<Readonly<{ inviteId: string; revokedAt: Date }>> = {
    ok: true,
    value: { inviteId: "invite-one", revokedAt: NOW }
  };
  acceptResult: TeamStoreResult<AcceptedTeamInvite> = {
    ok: true,
    value: { member: member(), accountCreated: false, sessionAuthVersion: null }
  };
  updateResult: TeamStoreResult<TeamMemberSummary> = { ok: true, value: member() };
  suspendResult: TeamStoreResult<TeamMemberSummary> = {
    ok: true,
    value: member({ status: MembershipStatus.SUSPENDED })
  };
  reactivateResult: TeamStoreResult<TeamMemberSummary> = {
    ok: true,
    value: member({ status: MembershipStatus.ACTIVE })
  };
  revokeMemberResult: TeamStoreResult<Readonly<{ userId: string; revokedAt: Date }>> = {
    ok: true,
    value: { userId: "user-member", revokedAt: NOW }
  };

  listCalls: Array<{ actor: TeamActor; now: Date }> = [];
  createCalls: CreateTeamInviteStoreInput[] = [];
  revokeInviteCalls: RevokeTeamInviteStoreInput[] = [];
  acceptCalls: AcceptTeamInviteStoreInput[] = [];
  updateCalls: UpdateTeamMemberRoleStoreInput[] = [];
  suspendCalls: TeamMemberMutationStoreInput[] = [];
  reactivateCalls: TeamMemberMutationStoreInput[] = [];
  revokeMemberCalls: TeamMemberMutationStoreInput[] = [];
  inviteAvailableCalls: Array<{ tokenHash: string; now: Date }> = [];

  async inviteAvailable(tokenHash: string, now: Date) {
    this.inviteAvailableCalls.push({ tokenHash, now });
    return this.inviteAvailableResult;
  }

  async listTeam(actor: TeamActor, now: Date) {
    this.listCalls.push({ actor, now });
    return this.listResult;
  }

  async createInvite(input: CreateTeamInviteStoreInput) {
    this.createCalls.push(input);
    return this.createResult;
  }

  async revokeInvite(input: RevokeTeamInviteStoreInput) {
    this.revokeInviteCalls.push(input);
    return this.revokeInviteResult;
  }

  async acceptInvite(input: AcceptTeamInviteStoreInput) {
    this.acceptCalls.push(input);
    return this.acceptResult;
  }

  async updateMemberRole(input: UpdateTeamMemberRoleStoreInput) {
    this.updateCalls.push(input);
    return this.updateResult;
  }

  async suspendMember(input: TeamMemberMutationStoreInput) {
    this.suspendCalls.push(input);
    return this.suspendResult;
  }

  async reactivateMember(input: TeamMemberMutationStoreInput) {
    this.reactivateCalls.push(input);
    return this.reactivateResult;
  }

  async revokeMember(input: TeamMemberMutationStoreInput) {
    this.revokeMemberCalls.push(input);
    return this.revokeMemberResult;
  }
}

function dependencies(store: FakeTeamStore) {
  return {
    store,
    now: () => NOW,
    createInviteToken: () => ({
      token: RAW_INVITE_TOKEN,
      tokenHash: INVITE_TOKEN_HASH
    }),
    encodePassword: vi.fn(async () => "encoded-password-material"),
    authenticateExistingAccount: vi.fn(
      async (): Promise<LocalAuthenticationResult> => ({
        authenticated: true,
        user: {
          id: "user-member",
          email: "member@example.test",
          displayName: "Member",
          authVersion: 3
        }
      })
    )
  };
}

describe("team service", () => {
  let store: FakeTeamStore;

  beforeEach(() => {
    store = new FakeTeamStore();
  });

  it("defines the OWNER/ADMIN/MEMBER management boundary", () => {
    expect(canGrantTeamRole(MembershipRole.OWNER, MembershipRole.OWNER)).toBe(true);
    expect(canGrantTeamRole(MembershipRole.OWNER, MembershipRole.ADMIN)).toBe(true);
    expect(canGrantTeamRole(MembershipRole.ADMIN, MembershipRole.ADMIN)).toBe(true);
    expect(canGrantTeamRole(MembershipRole.ADMIN, MembershipRole.MEMBER)).toBe(true);
    expect(canGrantTeamRole(MembershipRole.ADMIN, MembershipRole.OWNER)).toBe(false);
    expect(canGrantTeamRole(MembershipRole.MEMBER, MembershipRole.MEMBER)).toBe(false);

    expect(canManageTeamRole(MembershipRole.OWNER, MembershipRole.OWNER)).toBe(true);
    expect(canManageTeamRole(MembershipRole.ADMIN, MembershipRole.ADMIN)).toBe(true);
    expect(canManageTeamRole(MembershipRole.ADMIN, MembershipRole.OWNER)).toBe(false);
    expect(canManageTeamRole(MembershipRole.MEMBER, MembershipRole.MEMBER)).toBe(false);
  });

  it("lists only same-tenant sanitized members and pending invites", async () => {
    store.listResult = {
      ok: true,
      value: {
        members: [
          { ...member(), passwordHash: "member-hash" } as TeamMemberSummary,
          member({ orgId: "org-foreign", userId: "foreign-user" })
        ],
        pendingInvites: [
          { ...invite(), tokenHash: "invite-hash" } as PendingTeamInviteSummary,
          invite({ orgId: "org-foreign", inviteId: "foreign-invite" })
        ]
      }
    };

    const result = await listTeam(ACTOR, dependencies(store));

    expect(result.members).toEqual([member()]);
    expect(result.pendingInvites).toEqual([invite()]);
    expect(Object.keys(result.members[0])).toEqual([
      "membershipId",
      "orgId",
      "userId",
      "email",
      "displayName",
      "role",
      "status",
      "userDisabled",
      "createdAt",
      "updatedAt"
    ]);
    expect(JSON.stringify(result)).not.toMatch(/passwordHash|tokenHash|member-hash|invite-hash/);
  });

  it("creates a normalized expiring invite and exposes the raw token only once", async () => {
    store.createResult = {
      ok: true,
      value: invite({ role: MembershipRole.ADMIN })
    };
    const result = await createTeamInvite(
      ACTOR,
      {
        email: "  INVITEE@Example.Test ",
        role: MembershipRole.ADMIN,
        expiresInHours: 24
      },
      dependencies(store)
    );

    expect(store.createCalls).toEqual([
      {
        actor: ACTOR,
        normalizedEmail: "invitee@example.test",
        role: MembershipRole.ADMIN,
        tokenHash: INVITE_TOKEN_HASH,
        expiresAt: new Date("2026-07-11T12:00:00.000Z"),
        now: NOW
      }
    ]);
    expect(result).toEqual({
      invite: invite({ role: MembershipRole.ADMIN }),
      token: RAW_INVITE_TOKEN
    });
    expect(JSON.stringify(store.createCalls)).not.toContain(RAW_INVITE_TOKEN);
    expect(JSON.stringify(result)).not.toContain(INVITE_TOKEN_HASH);
  });

  it("allows exactly one service-level winner when storage reports a concurrent invite conflict", async () => {
    let reserved = false;
    store.createInvite = async (input) => {
      store.createCalls.push(input);
      if (reserved) {
        return { ok: false, reason: "CONFLICT" } as const;
      }
      reserved = true;
      return { ok: true, value: invite() } as const;
    };

    const attempts = await Promise.allSettled([
      createTeamInvite(ACTOR, { email: "invitee@example.test" }, dependencies(store)),
      createTeamInvite(ACTOR, { email: "invitee@example.test" }, dependencies(store))
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    const rejected = attempts.find(
      (attempt): attempt is PromiseRejectedResult => attempt.status === "rejected"
    );
    expect(rejected?.reason).toMatchObject({ code: "TEAM_CONFLICT", status: 409 });
  });

  it("accepts a new user without passing raw password or invite token to storage", async () => {
    store.acceptResult = {
      ok: true,
      value: { member: member(), accountCreated: true, sessionAuthVersion: 1 }
    };
    const overrides = dependencies(store);
    const password = "correct horse battery staple";

    const result = await acceptTeamInvite(
      null,
      { token: RAW_INVITE_TOKEN, displayName: "  New Member  ", password },
      overrides
    );

    expect(overrides.encodePassword).toHaveBeenCalledWith(password);
    expect(store.inviteAvailableCalls).toEqual([
      { tokenHash: INVITE_TOKEN_HASH, now: NOW }
    ]);
    expect(store.acceptCalls).toEqual([
      {
        tokenHash: hashOpaqueToken(RAW_INVITE_TOKEN),
        authenticatedUserId: null,
        existingAccount: null,
        newAccount: {
          displayName: "New Member",
          passwordHash: "encoded-password-material"
        },
        now: NOW
      }
    ]);
    expect(result).toEqual({
      member: member(),
      accountCreated: true,
      sessionAuthVersion: 1
    });
    expect(JSON.stringify(store.acceptCalls)).not.toContain(password);
    expect(JSON.stringify(result)).not.toMatch(/token|password|hash/i);
  });

  it("rejects an unavailable invite before performing password hashing", async () => {
    store.inviteAvailableResult = false;
    const overrides = dependencies(store);

    await expect(
      acceptTeamInvite(null, {
        token: RAW_INVITE_TOKEN,
        displayName: "New Member",
        password: "correct horse battery staple"
      }, overrides)
    ).rejects.toMatchObject({ code: "INVITE_UNAVAILABLE", status: 400 });
    expect(overrides.encodePassword).not.toHaveBeenCalled();
    expect(store.acceptCalls).toHaveLength(0);
  });

  it("proves an existing local account only after invite preflight and binds its auth generation", async () => {
    store.acceptResult = {
      ok: true,
      value: { member: member(), accountCreated: false, sessionAuthVersion: 3 }
    };
    const overrides = dependencies(store);
    const password = "correct horse battery staple";
    overrides.authenticateExistingAccount.mockImplementationOnce(async () => {
      expect(store.inviteAvailableCalls).toEqual([
        { tokenHash: INVITE_TOKEN_HASH, now: NOW }
      ]);
      return {
        authenticated: true,
        user: {
          id: "user-member",
          email: "member@example.test",
          displayName: "Member",
          authVersion: 3
        }
      };
    });

    const accepted = await acceptTeamInvite(
      null,
      {
        token: RAW_INVITE_TOKEN,
        email: " MEMBER@EXAMPLE.TEST ",
        password
      },
      overrides
    );

    expect(overrides.authenticateExistingAccount).toHaveBeenCalledWith({
      email: "member@example.test",
      password
    });
    expect(store.acceptCalls).toEqual([
      {
        tokenHash: INVITE_TOKEN_HASH,
        authenticatedUserId: null,
        existingAccount: { userId: "user-member", expectedAuthVersion: 3 },
        newAccount: null,
        now: NOW
      }
    ]);
    expect(accepted).toEqual({
      member: member(),
      accountCreated: false,
      sessionAuthVersion: 3
    });
    expect(JSON.stringify(store.acceptCalls)).not.toContain(password);
  });

  it("rejects an unavailable invite before existing-account password verification", async () => {
    store.inviteAvailableResult = false;
    const overrides = dependencies(store);

    await expect(
      acceptTeamInvite(
        null,
        {
          token: RAW_INVITE_TOKEN,
          email: "member@example.test",
          password: "correct horse battery staple"
        },
        overrides
      )
    ).rejects.toMatchObject({ code: "INVITE_UNAVAILABLE", status: 400 });
    expect(overrides.authenticateExistingAccount).not.toHaveBeenCalled();
    expect(overrides.encodePassword).not.toHaveBeenCalled();
    expect(store.acceptCalls).toHaveLength(0);
  });

  it("does not submit an existing-account claim after credential proof fails", async () => {
    const overrides = dependencies(store);
    overrides.authenticateExistingAccount.mockResolvedValueOnce({
      authenticated: false,
      code: "AUTHENTICATION_DENIED"
    });

    await expect(
      acceptTeamInvite(
        null,
        {
          token: RAW_INVITE_TOKEN,
          email: "member@example.test",
          password: "incorrect horse battery staple"
        },
        overrides
      )
    ).rejects.toMatchObject({ code: "INVITE_AUTHENTICATION_REQUIRED", status: 401 });
    expect(store.acceptCalls).toHaveLength(0);
  });

  it("requires existing authenticated invitees to omit credential material", async () => {
    const overrides = dependencies(store);
    await expect(
      acceptTeamInvite(
        { userId: "user-member" },
        {
          token: RAW_INVITE_TOKEN,
          displayName: "Unneeded",
          password: "correct horse battery staple"
        },
        overrides
      )
    ).rejects.toMatchObject({ code: "INVALID_INPUT", status: 400 });
    expect(store.acceptCalls).toHaveLength(0);
    expect(overrides.encodePassword).not.toHaveBeenCalled();
  });

  it.each([
    ["expired, revoked, replayed, or email-mismatched", "INVITE_UNAVAILABLE", 400],
    ["an existing unauthenticated account", "INVITE_AUTHENTICATION_REQUIRED", 401]
  ] as const)("returns a generic sanitized invite error for %s", async (_label, reason, status) => {
    store.acceptResult = { ok: false, reason };
    const operation = acceptTeamInvite(
      { userId: "user-member" },
      { token: RAW_INVITE_TOKEN },
      dependencies(store)
    );

    await expect(operation).rejects.toMatchObject({ code: reason, status });
    const error = await operation.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TeamServiceError);
    expect(JSON.stringify(error)).not.toMatch(/email|expired|revoked|replay|hash|token/i);
  });

  it("maps foreign-tenant resources and disabled actors to stable non-leaking errors", async () => {
    store.revokeInviteResult = { ok: false, reason: "RESOURCE_UNAVAILABLE" };
    await expect(
      revokeTeamInvite(ACTOR, "foreign-invite", dependencies(store))
    ).rejects.toMatchObject({ code: "TEAM_RESOURCE_UNAVAILABLE", status: 404 });

    store.listResult = { ok: false, reason: "ACTOR_DENIED" };
    await expect(listTeam(ACTOR, dependencies(store))).rejects.toMatchObject({
      code: "TEAM_ACCESS_DENIED",
      status: 403
    });
  });

  it("maps final-owner and OWNER role boundaries without leaking store details", async () => {
    store.suspendResult = { ok: false, reason: "FINAL_OWNER" };
    await expect(
      suspendTeamMember(ACTOR, ACTOR.userId, dependencies(store))
    ).rejects.toMatchObject({ code: "FINAL_OWNER_REQUIRED", status: 409 });

    store.updateResult = { ok: false, reason: "ROLE_DENIED" };
    await expect(
      updateTeamMemberRole(
        ACTOR,
        "user-member",
        { role: MembershipRole.OWNER },
        dependencies(store)
      )
    ).rejects.toMatchObject({ code: "TEAM_ROLE_FORBIDDEN", status: 403 });
  });

  it("delegates role, suspend, reactivate, and revoke mutations with server-owned context", async () => {
    const overrides = dependencies(store);
    await updateTeamMemberRole(
      ACTOR,
      "user-member",
      { role: MembershipRole.ADMIN },
      overrides
    );
    await suspendTeamMember(ACTOR, "user-member", overrides);
    await reactivateTeamMember(ACTOR, "user-member", overrides);
    await revokeTeamMember(ACTOR, "user-member", overrides);

    expect(store.updateCalls[0]).toEqual({
      actor: ACTOR,
      targetUserId: "user-member",
      role: MembershipRole.ADMIN,
      now: NOW
    });
    expect(store.suspendCalls[0]).toEqual({ actor: ACTOR, targetUserId: "user-member", now: NOW });
    expect(store.reactivateCalls[0]).toEqual({ actor: ACTOR, targetUserId: "user-member", now: NOW });
    expect(store.revokeMemberCalls[0]).toEqual({ actor: ACTOR, targetUserId: "user-member", now: NOW });
  });

  it("rejects malformed actor, identifier, invite, role, and password input before storage", async () => {
    const overrides = dependencies(store);
    await expect(listTeam({ userId: " user", orgId: "org" }, overrides)).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED"
    });
    await expect(
      createTeamInvite(ACTOR, { email: "not-an-email", role: "OWNERISH" }, overrides)
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      acceptTeamInvite(null, {
        token: RAW_INVITE_TOKEN,
        displayName: "New User",
        password: "password1234"
      }, overrides)
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      updateTeamMemberRole(ACTOR, " foreign ", { role: MembershipRole.MEMBER }, overrides)
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(store.createCalls).toHaveLength(0);
    expect(store.acceptCalls).toHaveLength(0);
    expect(store.updateCalls).toHaveLength(0);
  });

  it("sanitizes unexpected storage failures", async () => {
    store.listTeam = async () => {
      throw new Error("postgres password=super-secret token=raw-token");
    };
    const error = await listTeam(ACTOR, dependencies(store)).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: "TEAM_OPERATION_FAILED",
      status: 500,
      message: "Team operation failed."
    });
    expect(JSON.stringify(error)).not.toMatch(/super-secret|raw-token|postgres password/i);
  });
});
