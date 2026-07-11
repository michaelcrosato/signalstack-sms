import { randomUUID } from "node:crypto";
import {
  AuthTokenType,
  MembershipRole,
  MembershipStatus
} from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import {
  createOpaqueToken,
  hashPassword,
  hashOpaqueToken,
  verifyPassword
} from "@/lib/auth/crypto";
import { createLocalSession } from "@/lib/auth/local-session";
import {
  acceptTeamInvite,
  createTeamInvite,
  listTeam,
  prismaTeamServiceStore,
  reactivateTeamMember,
  revokeTeamInvite,
  revokeTeamMember,
  suspendTeamMember,
  TeamServiceError,
  updateTeamMemberRole
} from "@/lib/auth/team-service";
import { prisma } from "@/lib/db/prisma";

const run = process.env.RUN_DB_TESTS === "true";
const suffix = randomUUID().replaceAll("-", "");
let sequence = 0;

type Fixture = Awaited<ReturnType<typeof createFixture>>;

describe.runIf(run)("team service on Postgres", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { slug: { contains: suffix } } });
    await prisma.appUser.deleteMany({
      where: { normalizedEmail: { contains: suffix } }
    });
  });

  it("lists sanitized members/invites, persists only the invite hash, and enforces invite role bounds", async () => {
    const fixture = await createFixture("roster");
    const admin = await addMember(fixture, "admin", MembershipRole.ADMIN);
    const member = await addMember(fixture, "member", MembershipRole.MEMBER);
    const suspended = await addMember(
      fixture,
      "suspended",
      MembershipRole.MEMBER,
      MembershipStatus.SUSPENDED
    );
    const invitedStatus = await addMember(
      fixture,
      "legacy-invited",
      MembershipRole.MEMBER,
      MembershipStatus.INVITED
    );
    const disabled = await addMember(fixture, "disabled", MembershipRole.MEMBER);
    await prisma.appUser.update({
      where: { id: disabled.userId },
      data: { disabledAt: new Date() }
    });

    const created = await createTeamInvite(
      fixture.owner,
      {
        email: fixture.email("new-admin").toUpperCase(),
        role: MembershipRole.ADMIN,
        expiresInHours: 48
      }
    );
    const stored = await prisma.authToken.findUniqueOrThrow({
      where: { id: created.invite.inviteId }
    });

    expect(stored).toMatchObject({
      type: AuthTokenType.INVITE,
      orgId: fixture.organization.id,
      email: fixture.email("new-admin"),
      role: MembershipRole.ADMIN,
      issuedByUserId: fixture.owner.userId,
      tokenHash: hashOpaqueToken(created.token),
      consumedAt: null,
      revokedAt: null
    });
    expect(stored.tokenHash).not.toBe(created.token);

    const roster = await listTeam(fixture.owner);
    expect(roster.members.map((entry) => entry.userId)).toEqual(
      expect.arrayContaining([
        fixture.owner.userId,
        admin.userId,
        member.userId,
        suspended.userId,
        disabled.userId
      ])
    );
    expect(roster.members.map((entry) => entry.userId)).not.toContain(invitedStatus.userId);
    expect(roster.members.find((entry) => entry.userId === disabled.userId)).toMatchObject({
      status: MembershipStatus.ACTIVE,
      userDisabled: true
    });
    expect(roster.pendingInvites).toEqual([created.invite]);
    expect(JSON.stringify(roster)).not.toContain(stored.tokenHash);
    expect(JSON.stringify(roster)).not.toContain(created.token);
    await expect(
      listTeam({ userId: member.userId, orgId: fixture.organization.id })
    ).rejects.toMatchObject({ code: "TEAM_ROLE_FORBIDDEN", status: 403 });

    await expect(
      createTeamInvite(
        { userId: admin.userId, orgId: fixture.organization.id },
        { email: fixture.email("owner-invite"), role: MembershipRole.OWNER }
      )
    ).rejects.toMatchObject({ code: "TEAM_ROLE_FORBIDDEN", status: 403 });
    await expect(
      createTeamInvite(
        { userId: member.userId, orgId: fixture.organization.id },
        { email: fixture.email("member-invite") }
      )
    ).rejects.toMatchObject({ code: "TEAM_ROLE_FORBIDDEN", status: 403 });
    await expect(
      createTeamInvite(fixture.owner, { email: fixture.email("new-admin") })
    ).rejects.toMatchObject({ code: "TEAM_CONFLICT", status: 409 });

    const audits = await teamAudits(fixture.organization.id);
    expect(audits).toEqual([
      expect.objectContaining({
        actorUserId: fixture.owner.userId,
        action: "TEAM_INVITE_CREATED",
        subjectType: "AuthToken",
        subjectId: created.invite.inviteId,
        metadata: { source: "self_hosted_identity", role: MembershipRole.ADMIN }
      })
    ]);
    expect(JSON.stringify(audits)).not.toContain(created.token);
    expect(JSON.stringify(audits)).not.toContain(stored.tokenHash);
  });

  it("accepts a new account once without claiming email verification or returning secrets", async () => {
    const fixture = await createFixture("new-account");
    const email = fixture.email("new-user");
    const password = "correct horse battery staple";
    const created = await createTeamInvite(fixture.owner, {
      email,
      role: MembershipRole.ADMIN
    });

    const accepted = await acceptTeamInvite(null, {
      token: created.token,
      displayName: "  New Admin  ",
      password
    });

    expect(accepted).toMatchObject({
      accountCreated: true,
      member: {
        orgId: fixture.organization.id,
        email,
        displayName: "New Admin",
        role: MembershipRole.ADMIN,
        status: MembershipStatus.ACTIVE,
        userDisabled: false
      }
    });
    const user = await prisma.appUser.findUniqueOrThrow({
      where: { normalizedEmail: email },
      include: { localCredential: true }
    });
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.localCredential?.passwordHash).not.toContain(password);
    await expect(
      verifyPassword(password, user.localCredential!.passwordHash)
    ).resolves.toBe(true);

    const storedInvite = await prisma.authToken.findUniqueOrThrow({
      where: { id: created.invite.inviteId }
    });
    expect(storedInvite).toMatchObject({ userId: user.id, revokedAt: null });
    expect(storedInvite.consumedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(accepted)).not.toMatch(/password|hash|token/i);

    await expect(
      acceptTeamInvite(null, {
        token: created.token,
        displayName: "Replay",
        password: "another secure password value"
      })
    ).rejects.toMatchObject({ code: "INVITE_UNAVAILABLE", status: 400 });

    const audits = await teamAudits(fixture.organization.id);
    expect(audits.map((event) => event.action)).toEqual([
      "TEAM_INVITE_CREATED",
      "TEAM_INVITE_ACCEPTED"
    ]);
    const auditJson = JSON.stringify(audits);
    expect(auditJson).not.toContain(password);
    expect(auditJson).not.toContain(created.token);
    expect(auditJson).not.toContain(storedInvite.tokenHash);
  });

  it("binds acceptance to an enabled matching-email user and rejects any pre-existing membership", async () => {
    const fixture = await createFixture("email-binding");
    const invitee = await createUser(fixture.email("invitee"), "Invitee");
    const wrongUser = await createUser(fixture.email("wrong"), "Wrong User");
    const created = await createTeamInvite(fixture.owner, {
      email: invitee.normalizedEmail,
      role: MembershipRole.ADMIN
    });

    await expect(
      acceptTeamInvite({ userId: wrongUser.id }, { token: created.token })
    ).rejects.toMatchObject({ code: "INVITE_UNAVAILABLE", status: 400 });
    expect(
      (await prisma.authToken.findUniqueOrThrow({ where: { id: created.invite.inviteId } }))
        .consumedAt
    ).toBeNull();

    await prisma.appUser.update({
      where: { id: invitee.id },
      data: { disabledAt: new Date() }
    });
    await expect(
      acceptTeamInvite({ userId: invitee.id }, { token: created.token })
    ).rejects.toMatchObject({ code: "INVITE_UNAVAILABLE", status: 400 });
    await prisma.appUser.update({
      where: { id: invitee.id },
      data: { disabledAt: null }
    });
    await prisma.membership.create({
      data: {
        orgId: fixture.organization.id,
        userId: invitee.id,
        role: MembershipRole.MEMBER,
        status: MembershipStatus.SUSPENDED
      }
    });

    await expect(
      acceptTeamInvite({ userId: invitee.id }, { token: created.token })
    ).rejects.toMatchObject({ code: "INVITE_UNAVAILABLE", status: 400 });
    expect(
      await prisma.membership.findUnique({
        where: {
          orgId_userId: { orgId: fixture.organization.id, userId: invitee.id }
        }
      })
    ).toMatchObject({ role: MembershipRole.MEMBER, status: MembershipStatus.SUSPENDED });
    expect(
      (await prisma.authToken.findUniqueOrThrow({ where: { id: created.invite.inviteId } }))
        .consumedAt
    ).toBeNull();
    expect(await prisma.localCredential.count({ where: { userId: invitee.id } })).toBe(0);

    const activeInvitee = await createUser(fixture.email("active-invitee"), "Active Invitee");
    const activeInvite = await createTeamInvite(fixture.owner, {
      email: activeInvitee.normalizedEmail,
      role: MembershipRole.MEMBER
    });
    await prisma.membership.create({
      data: {
        orgId: fixture.organization.id,
        userId: activeInvitee.id,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE
      }
    });
    await expect(
      acceptTeamInvite({ userId: activeInvitee.id }, { token: activeInvite.token })
    ).rejects.toMatchObject({ code: "INVITE_UNAVAILABLE", status: 400 });
    expect(
      await prisma.membership.findUnique({
        where: {
          orgId_userId: { orgId: fixture.organization.id, userId: activeInvitee.id }
        }
      })
    ).toMatchObject({ role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE });
    expect(
      (await prisma.authToken.findUniqueOrThrow({ where: { id: activeInvite.invite.inviteId } }))
        .consumedAt
    ).toBeNull();
  });

  it("reinvites a local identity after its last membership was revoked and creates a fresh session", async () => {
    const fixture = await createFixture("last-membership-reinvite");
    const invitee = await addMember(fixture, "invitee", MembershipRole.MEMBER);
    const password = "correct horse battery staple";
    await prisma.localCredential.create({
      data: {
        userId: invitee.userId,
        passwordHash: await hashPassword(password),
        passwordChangedAt: new Date()
      }
    });
    await revokeTeamMember(fixture.owner, invitee.userId);
    expect(
      await prisma.membership.count({ where: { userId: invitee.userId } })
    ).toBe(0);

    const created = await createTeamInvite(fixture.owner, {
      email: invitee.email,
      role: MembershipRole.ADMIN
    });
    const accepted = await acceptTeamInvite(null, {
      token: created.token,
      email: invitee.email,
      password
    });

    expect(accepted).toMatchObject({
      accountCreated: false,
      sessionAuthVersion: 1,
      member: {
        userId: invitee.userId,
        orgId: fixture.organization.id,
        role: MembershipRole.ADMIN,
        status: MembershipStatus.ACTIVE
      }
    });
    const session = await createLocalSession({
      userId: accepted.member.userId,
      orgId: accepted.member.orgId,
      expectedAuthVersion: accepted.sessionAuthVersion!
    });
    expect(session.session).toMatchObject({
      userId: invitee.userId,
      orgId: fixture.organization.id
    });
    expect(
      await prisma.authSession.findUnique({
        where: { tokenHash: hashOpaqueToken(session.token) },
        select: { authVersion: true }
      })
    ).toEqual({ authVersion: 1 });
    expect(
      (await prisma.authToken.findUniqueOrThrow({ where: { id: created.invite.inviteId } }))
        .consumedAt
    ).toBeInstanceOf(Date);
  });

  it("rejects a stale existing-password proof after the credential generation changes", async () => {
    const fixture = await createFixture("reinvite-reset-race");
    const invitee = await addMember(fixture, "invitee", MembershipRole.MEMBER);
    const oldPassword = "correct horse battery staple";
    await prisma.localCredential.create({
      data: {
        userId: invitee.userId,
        passwordHash: await hashPassword(oldPassword),
        passwordChangedAt: new Date()
      }
    });
    await revokeTeamMember(fixture.owner, invitee.userId);
    const created = await createTeamInvite(fixture.owner, { email: invitee.email });
    const beforeReset = await prisma.appUser.findUniqueOrThrow({
      where: { id: invitee.userId },
      select: { email: true, displayName: true, authVersion: true }
    });

    await expect(
      acceptTeamInvite(
        null,
        { token: created.token, email: invitee.email, password: oldPassword },
        {
          authenticateExistingAccount: async () => {
            const resetAt = new Date();
            await prisma.$transaction([
              prisma.localCredential.update({
                where: { userId: invitee.userId },
                data: {
                  passwordHash: await hashPassword("replacement horse battery staple"),
                  passwordChangedAt: resetAt
                }
              }),
              prisma.appUser.update({
                where: { id: invitee.userId },
                data: { authVersion: { increment: 1 } }
              })
            ]);
            return {
              authenticated: true,
              user: {
                id: invitee.userId,
                email: beforeReset.email,
                displayName: beforeReset.displayName,
                authVersion: beforeReset.authVersion
              }
            };
          }
        }
      )
    ).rejects.toMatchObject({ code: "INVITE_UNAVAILABLE", status: 400 });
    expect(
      await prisma.membership.count({
        where: { orgId: fixture.organization.id, userId: invitee.userId }
      })
    ).toBe(0);
    expect(
      (await prisma.authToken.findUniqueOrThrow({ where: { id: created.invite.inviteId } }))
        .consumedAt
    ).toBeNull();
  });

  it("rejects acceptance when the issuer is no longer authorized, even if the token was not revoked", async () => {
    const fixture = await createFixture("issuer-revalidation");
    const downgradedIssuer = await addMember(
      fixture,
      "downgraded-issuer",
      MembershipRole.ADMIN
    );
    const downgradedInvitee = await createUser(
      fixture.email("downgraded-invitee"),
      "Downgraded Invitee"
    );
    const downgradedInvite = await createTeamInvite(
      { userId: downgradedIssuer.userId, orgId: fixture.organization.id },
      { email: downgradedInvitee.normalizedEmail, role: MembershipRole.MEMBER }
    );
    await prisma.membership.update({
      where: { id: downgradedIssuer.membershipId },
      data: { role: MembershipRole.MEMBER }
    });

    await expect(
      prismaTeamServiceStore.acceptInvite({
        tokenHash: hashOpaqueToken(downgradedInvite.token),
        authenticatedUserId: downgradedInvitee.id,
        existingAccount: null,
        newAccount: null,
        now: new Date()
      })
    ).resolves.toEqual({ ok: false, reason: "INVITE_UNAVAILABLE" });
    await expect(
      acceptTeamInvite(
        { userId: downgradedInvitee.id },
        { token: downgradedInvite.token }
      )
    ).rejects.toMatchObject({ code: "INVITE_UNAVAILABLE", status: 400 });

    const disabledIssuer = await addMember(
      fixture,
      "disabled-issuer",
      MembershipRole.ADMIN
    );
    const disabledInvitee = await createUser(
      fixture.email("disabled-invitee"),
      "Disabled Invitee"
    );
    const disabledInvite = await createTeamInvite(
      { userId: disabledIssuer.userId, orgId: fixture.organization.id },
      { email: disabledInvitee.normalizedEmail, role: MembershipRole.MEMBER }
    );
    await prisma.appUser.update({
      where: { id: disabledIssuer.userId },
      data: { disabledAt: new Date() }
    });

    await expect(
      prismaTeamServiceStore.acceptInvite({
        tokenHash: hashOpaqueToken(disabledInvite.token),
        authenticatedUserId: disabledInvitee.id,
        existingAccount: null,
        newAccount: null,
        now: new Date()
      })
    ).resolves.toEqual({ ok: false, reason: "INVITE_UNAVAILABLE" });
    await expect(
      acceptTeamInvite(
        { userId: disabledInvitee.id },
        { token: disabledInvite.token }
      )
    ).rejects.toMatchObject({ code: "INVITE_UNAVAILABLE", status: 400 });

    const storedInvites = await prisma.authToken.findMany({
      where: { id: { in: [downgradedInvite.invite.inviteId, disabledInvite.invite.inviteId] } },
      select: { consumedAt: true, revokedAt: true }
    });
    expect(storedInvites).toEqual([
      { consumedAt: null, revokedAt: null },
      { consumedAt: null, revokedAt: null }
    ]);
    expect(
      await prisma.membership.count({
        where: {
          orgId: fixture.organization.id,
          userId: { in: [downgradedInvitee.id, disabledInvitee.id] }
        }
      })
    ).toBe(0);
  });

  it("revokes an issuer's pending invites when their role, status, or membership authority is removed", async () => {
    const fixture = await createFixture("issuer-invite-revocation");
    const roleIssuer = await addMember(fixture, "role-issuer", MembershipRole.ADMIN);
    const suspendedIssuer = await addMember(
      fixture,
      "suspended-issuer",
      MembershipRole.ADMIN
    );
    const revokedIssuer = await addMember(
      fixture,
      "revoked-issuer",
      MembershipRole.ADMIN
    );
    const roleInvite = await createTeamInvite(
      { userId: roleIssuer.userId, orgId: fixture.organization.id },
      { email: fixture.email("role-invitee") }
    );
    const suspendedInvite = await createTeamInvite(
      { userId: suspendedIssuer.userId, orgId: fixture.organization.id },
      { email: fixture.email("suspended-invitee") }
    );
    const revokedInvite = await createTeamInvite(
      { userId: revokedIssuer.userId, orgId: fixture.organization.id },
      { email: fixture.email("revoked-invitee") }
    );

    await updateTeamMemberRole(fixture.owner, roleIssuer.userId, {
      role: MembershipRole.MEMBER
    });
    await suspendTeamMember(fixture.owner, suspendedIssuer.userId);
    await revokeTeamMember(fixture.owner, revokedIssuer.userId);

    const storedInvites = await prisma.authToken.findMany({
      where: {
        id: {
          in: [
            roleInvite.invite.inviteId,
            suspendedInvite.invite.inviteId,
            revokedInvite.invite.inviteId
          ]
        }
      },
      select: { id: true, consumedAt: true, revokedAt: true }
    });
    expect(storedInvites).toHaveLength(3);
    expect(storedInvites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: roleInvite.invite.inviteId, consumedAt: null }),
        expect.objectContaining({ id: suspendedInvite.invite.inviteId, consumedAt: null }),
        expect.objectContaining({ id: revokedInvite.invite.inviteId, consumedAt: null })
      ])
    );
    expect(storedInvites.every((invite) => invite.revokedAt instanceof Date)).toBe(true);

    const mutationAudits = (await teamAudits(fixture.organization.id)).filter((event) =>
      event.action.startsWith("TEAM_MEMBER_")
    );
    expect(mutationAudits).toHaveLength(3);
    expect(mutationAudits.map((event) => event.metadata)).toEqual([
      expect.objectContaining({ revokedPendingInviteCount: 1 }),
      expect.objectContaining({ revokedPendingInviteCount: 1 }),
      expect.objectContaining({ revokedPendingInviteCount: 1 })
    ]);
  });

  it("serializes invite acceptance against issuer demotion", async () => {
    const fixture = await createFixture("issuer-accept-race");
    const issuer = await addMember(fixture, "issuer", MembershipRole.ADMIN);
    const invitee = await createUser(fixture.email("invitee"), "Race Invitee");
    const created = await createTeamInvite(
      { userId: issuer.userId, orgId: fixture.organization.id },
      { email: invitee.normalizedEmail, role: MembershipRole.MEMBER }
    );

    const [acceptance, demotion] = await Promise.allSettled([
      acceptTeamInvite({ userId: invitee.id }, { token: created.token }),
      updateTeamMemberRole(fixture.owner, issuer.userId, {
        role: MembershipRole.MEMBER
      })
    ]);

    expect(demotion.status).toBe("fulfilled");
    const storedInvite = await prisma.authToken.findUniqueOrThrow({
      where: { id: created.invite.inviteId },
      select: { consumedAt: true, revokedAt: true }
    });
    const inviteeMembership = await prisma.membership.findUnique({
      where: {
        orgId_userId: { orgId: fixture.organization.id, userId: invitee.id }
      }
    });
    const demotionAudit = (await teamAudits(fixture.organization.id)).find(
      (event) => event.action === "TEAM_MEMBER_ROLE_UPDATED" && event.subjectId === issuer.membershipId
    );

    if (acceptance.status === "fulfilled") {
      expect(storedInvite.consumedAt).toBeInstanceOf(Date);
      expect(storedInvite.revokedAt).toBeNull();
      expect(inviteeMembership).not.toBeNull();
      expect(demotionAudit?.metadata).toEqual(
        expect.objectContaining({ revokedPendingInviteCount: 0 })
      );
    } else {
      expect(acceptance.reason).toMatchObject({ code: "INVITE_UNAVAILABLE", status: 400 });
      expect(storedInvite.consumedAt).toBeNull();
      expect(storedInvite.revokedAt).toBeInstanceOf(Date);
      expect(inviteeMembership).toBeNull();
      expect(demotionAudit?.metadata).toEqual(
        expect.objectContaining({ revokedPendingInviteCount: 1 })
      );
    }
  });

  it("allows exactly one winner when the same invite is accepted concurrently", async () => {
    const fixture = await createFixture("accept-race");
    const invitee = await createUser(fixture.email("invitee"), "Concurrent Invitee");
    const created = await createTeamInvite(fixture.owner, {
      email: invitee.normalizedEmail,
      role: MembershipRole.MEMBER
    });

    const attempts = await Promise.allSettled([
      acceptTeamInvite({ userId: invitee.id }, { token: created.token }),
      acceptTeamInvite({ userId: invitee.id }, { token: created.token })
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult => attempt.status === "rejected"
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      code: "INVITE_UNAVAILABLE",
      status: 400
    });
    expect(
      await prisma.membership.count({
        where: { orgId: fixture.organization.id, userId: invitee.id }
      })
    ).toBe(1);
    expect(
      (await teamAudits(fixture.organization.id)).filter(
        (event) => event.action === "TEAM_INVITE_ACCEPTED"
      )
    ).toHaveLength(1);
  });

  it("rejects expired/revoked invites and prevents foreign-tenant invite revocation", async () => {
    const fixture = await createFixture("invite-state");
    const foreign = await createFixture("invite-state-foreign");
    const expired = await createTeamInvite(fixture.owner, {
      email: fixture.email("expired")
    });
    const clock = Date.now();
    await prisma.authToken.update({
      where: { id: expired.invite.inviteId },
      data: {
        createdAt: new Date(clock - 48 * 60 * 60 * 1_000),
        expiresAt: new Date(clock - 24 * 60 * 60 * 1_000)
      }
    });
    await expect(
      acceptTeamInvite(null, {
        token: expired.token,
        displayName: "Expired User",
        password: "correct horse battery staple"
      })
    ).rejects.toMatchObject({ code: "INVITE_UNAVAILABLE", status: 400 });

    const revocable = await createTeamInvite(fixture.owner, {
      email: fixture.email("revoked")
    });
    await expect(
      revokeTeamInvite(foreign.owner, revocable.invite.inviteId)
    ).rejects.toMatchObject({ code: "TEAM_RESOURCE_UNAVAILABLE", status: 404 });
    expect(
      (await prisma.authToken.findUniqueOrThrow({ where: { id: revocable.invite.inviteId } }))
        .revokedAt
    ).toBeNull();

    await expect(
      revokeTeamInvite(fixture.owner, revocable.invite.inviteId)
    ).resolves.toMatchObject({ inviteId: revocable.invite.inviteId });
    await expect(
      acceptTeamInvite(null, {
        token: revocable.token,
        displayName: "Revoked User",
        password: "correct horse battery staple"
      })
    ).rejects.toMatchObject({ code: "INVITE_UNAVAILABLE", status: 400 });
  });

  it("enforces tenant, actor, target, and OWNER management bounds and revokes suspended sessions", async () => {
    const fixture = await createFixture("role-bounds");
    const foreign = await createFixture("role-bounds-foreign");
    const secondOwner = await addMember(fixture, "second-owner", MembershipRole.OWNER);
    const admin = await addMember(fixture, "admin", MembershipRole.ADMIN);
    const member = await addMember(fixture, "member", MembershipRole.MEMBER);
    const ordinaryMember = await addMember(
      fixture,
      "ordinary-member",
      MembershipRole.MEMBER
    );

    const promoted = await updateTeamMemberRole(
      { userId: admin.userId, orgId: fixture.organization.id },
      member.userId,
      { role: MembershipRole.ADMIN }
    );
    expect(promoted.role).toBe(MembershipRole.ADMIN);
    await expect(
      updateTeamMemberRole(
        { userId: admin.userId, orgId: fixture.organization.id },
        member.userId,
        { role: MembershipRole.OWNER }
      )
    ).rejects.toMatchObject({ code: "TEAM_ROLE_FORBIDDEN", status: 403 });
    await expect(
      suspendTeamMember(
        { userId: admin.userId, orgId: fixture.organization.id },
        secondOwner.userId
      )
    ).rejects.toMatchObject({ code: "TEAM_ROLE_FORBIDDEN", status: 403 });
    await expect(
      suspendTeamMember(
        { userId: ordinaryMember.userId, orgId: fixture.organization.id },
        admin.userId
      )
    ).rejects.toMatchObject({ code: "TEAM_ROLE_FORBIDDEN", status: 403 });
    await expect(
      suspendTeamMember(foreign.owner, admin.userId)
    ).rejects.toMatchObject({ code: "TEAM_RESOURCE_UNAVAILABLE", status: 404 });

    const sessionToken = createOpaqueToken("session");
    const session = await prisma.authSession.create({
      data: {
        tokenHash: sessionToken.tokenHash,
        userId: admin.userId,
        orgId: fixture.organization.id,
        authVersion: 1,
        idleExpiresAt: new Date(Date.now() + 30 * 60 * 1_000),
        absoluteExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000)
      }
    });
    await suspendTeamMember(fixture.owner, admin.userId);
    expect(
      (await prisma.authSession.findUniqueOrThrow({ where: { id: session.id } })).revokedAt
    ).toBeInstanceOf(Date);

    await prisma.appUser.update({
      where: { id: admin.userId },
      data: { disabledAt: new Date() }
    });
    await expect(
      reactivateTeamMember(fixture.owner, admin.userId)
    ).rejects.toMatchObject({ code: "TEAM_RESOURCE_UNAVAILABLE", status: 404 });
    await expect(
      updateTeamMemberRole(
        { userId: admin.userId, orgId: fixture.organization.id },
        ordinaryMember.userId,
        { role: MembershipRole.ADMIN }
      )
    ).rejects.toMatchObject({ code: "TEAM_ACCESS_DENIED", status: 403 });
  });

  it("serializes mixed concurrent owner demotion, suspension, and revocation so one active owner remains", async () => {
    const fixture = await createFixture("owner-race");
    const secondOwner = await addMember(fixture, "owner-two", MembershipRole.OWNER);
    const thirdOwner = await addMember(fixture, "owner-three", MembershipRole.OWNER);

    const attempts = await Promise.allSettled([
      updateTeamMemberRole(
        fixture.owner,
        fixture.owner.userId,
        { role: MembershipRole.MEMBER }
      ),
      suspendTeamMember(
        { userId: secondOwner.userId, orgId: fixture.organization.id },
        secondOwner.userId
      ),
      revokeTeamMember(
        { userId: thirdOwner.userId, orgId: fixture.organization.id },
        thirdOwner.userId
      )
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(2);
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult => attempt.status === "rejected"
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(TeamServiceError);
    expect(rejected[0].reason).toMatchObject({
      code: "FINAL_OWNER_REQUIRED",
      status: 409
    });

    const activeOwners = await prisma.membership.count({
      where: {
        orgId: fixture.organization.id,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
        user: { disabledAt: null }
      }
    });
    expect(activeOwners).toBe(1);
    const mutationAudits = (await teamAudits(fixture.organization.id)).filter((event) =>
      event.action.startsWith("TEAM_MEMBER_")
    );
    expect(mutationAudits).toHaveLength(2);
  });

  it("revokes membership without deleting the user and retains secret-free audit evidence", async () => {
    const fixture = await createFixture("membership-revoke");
    const member = await addMember(fixture, "member", MembershipRole.MEMBER);

    await expect(
      revokeTeamMember(fixture.owner, member.userId)
    ).resolves.toMatchObject({ userId: member.userId });
    expect(
      await prisma.membership.findUnique({
        where: {
          orgId_userId: {
            orgId: fixture.organization.id,
            userId: member.userId
          }
        }
      })
    ).toBeNull();
    expect(await prisma.appUser.findUnique({ where: { id: member.userId } })).not.toBeNull();

    const audits = await teamAudits(fixture.organization.id);
    expect(audits).toEqual([
      expect.objectContaining({
        action: "TEAM_MEMBER_REVOKED",
        actorUserId: fixture.owner.userId,
        subjectType: "Membership",
        subjectId: member.membershipId,
        metadata: {
          source: "self_hosted_identity",
          role: MembershipRole.MEMBER,
          revokedPendingInviteCount: 0
        }
      })
    ]);
    expect(JSON.stringify(audits)).not.toMatch(/correct horse|ss_invite_|passwordHash|tokenHash/);
  });
});

async function createFixture(label: string) {
  sequence += 1;
  const fixtureKey = `${label}-${sequence}-${suffix}`;
  const organization = await prisma.organization.create({
    data: {
      name: `Team Service ${label}`,
      slug: `team-service-${fixtureKey}`,
      timezone: "UTC",
      demoMode: false
    }
  });
  const ownerUser = await createUser(
    `${label}-owner-${sequence}-${suffix}@example.test`,
    `${label} Owner`
  );
  const ownerMembership = await prisma.membership.create({
    data: {
      orgId: organization.id,
      userId: ownerUser.id,
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE
    }
  });

  return {
    organization,
    owner: Object.freeze({ userId: ownerUser.id, orgId: organization.id }),
    ownerMembership,
    key: fixtureKey,
    email(name: string) {
      return `${name}-${fixtureKey}@example.test`.toLowerCase();
    }
  };
}

async function createUser(email: string, displayName: string) {
  const normalizedEmail = email.toLowerCase();
  return prisma.appUser.create({
    data: { email: normalizedEmail, normalizedEmail, displayName }
  });
}

async function addMember(
  fixture: Fixture,
  label: string,
  role: MembershipRole,
  status: MembershipStatus = MembershipStatus.ACTIVE
) {
  const user = await createUser(fixture.email(label), label);
  const membership = await prisma.membership.create({
    data: {
      orgId: fixture.organization.id,
      userId: user.id,
      role,
      status
    }
  });
  return {
    userId: user.id,
    membershipId: membership.id,
    email: user.normalizedEmail
  };
}

async function teamAudits(orgId: string) {
  return prisma.liveReadinessAuditEvent.findMany({
    where: { orgId, action: { startsWith: "TEAM_" } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
}
