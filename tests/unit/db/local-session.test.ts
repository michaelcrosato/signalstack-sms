import { randomUUID } from "node:crypto";
import { MembershipRole, MembershipStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createLocalSession,
  resolveLocalSession,
  revokeAllLocalSessionsForOrganization,
  revokeLocalSession,
  switchLocalSessionOrganization
} from "@/lib/auth/local-session";
import { prisma } from "@/lib/db/prisma";

const run = process.env.RUN_DB_TESTS === "true";

describe.runIf(run)("built-in local session service on Postgres", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const normalizedEmail = `session-service-${suffix}@example.test`;
  let userId = "";
  let orgAId = "";
  let orgBId = "";

  beforeAll(async () => {
    const user = await prisma.appUser.create({
      data: { email: normalizedEmail, normalizedEmail, displayName: "Session User" }
    });
    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({ data: { name: "Session Org A", slug: `session-a-${suffix}`, demoMode: false } }),
      prisma.organization.create({ data: { name: "Session Org B", slug: `session-b-${suffix}`, demoMode: false } })
    ]);
    await prisma.membership.createMany({
      data: [
        { userId: user.id, orgId: orgA.id, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE },
        { userId: user.id, orgId: orgB.id, role: MembershipRole.ADMIN, status: MembershipStatus.ACTIVE }
      ]
    });
    userId = user.id;
    orgAId = orgA.id;
    orgBId = orgB.id;
  });

  afterAll(async () => {
    await prisma.appUser.deleteMany({ where: { normalizedEmail } });
    await prisma.organization.deleteMany({ where: { slug: { in: [`session-a-${suffix}`, `session-b-${suffix}`] } } });
  });

  it("creates, resolves, and switches an opaque session without persisting its raw token", async () => {
    const created = await createLocalSession({ userId, orgId: orgAId });
    expect(created.session).toMatchObject({ userId, orgId: orgAId, role: MembershipRole.OWNER });

    const stored = await prisma.authSession.findUniqueOrThrow({ where: { id: created.session.sessionId } });
    expect(stored.tokenHash).not.toBe(created.token);
    expect(JSON.stringify(created.session)).not.toContain(created.token);
    await expect(resolveLocalSession(created.token)).resolves.toMatchObject({ orgId: orgAId });

    const switched = await switchLocalSessionOrganization(created.token, orgBId);
    expect(switched).toMatchObject({ orgId: orgBId, role: MembershipRole.ADMIN });
    await expect(prisma.authSession.findUniqueOrThrow({ where: { id: created.session.sessionId } })).resolves.toMatchObject({
      orgId: orgBId
    });
    await expect(
      prisma.liveReadinessAuditEvent.findMany({
        where: { subjectType: "AuthSession", subjectId: created.session.sessionId },
        orderBy: { createdAt: "asc" },
        select: { action: true, orgId: true }
      })
    ).resolves.toEqual([
      { action: "LOCAL_SESSION_CREATED", orgId: orgAId },
      { action: "LOCAL_SESSION_ORGANIZATION_SELECTED", orgId: orgBId }
    ]);

    await prisma.membership.update({
      where: { orgId_userId: { orgId: orgBId, userId } },
      data: { status: MembershipStatus.SUSPENDED }
    });
    await expect(resolveLocalSession(created.token)).resolves.toBeNull();
  });

  it("revokes individual and all sessions while invalidating the user auth version", async () => {
    await prisma.membership.update({
      where: { orgId_userId: { orgId: orgBId, userId } },
      data: { status: MembershipStatus.ACTIVE }
    });
    const first = await createLocalSession({ userId, orgId: orgAId });
    const second = await createLocalSession({ userId, orgId: orgBId });

    await expect(revokeLocalSession(first.token)).resolves.toBe(true);
    await expect(resolveLocalSession(first.token)).resolves.toBeNull();
    await expect(resolveLocalSession(second.token)).resolves.toMatchObject({ orgId: orgBId });

    const before = await prisma.appUser.findUniqueOrThrow({ where: { id: userId } });
    await expect(
      revokeAllLocalSessionsForOrganization(userId, orgAId)
    ).resolves.toBeGreaterThanOrEqual(1);
    const after = await prisma.appUser.findUniqueOrThrow({ where: { id: userId } });
    expect(after.authVersion).toBe(before.authVersion + 1);
    await expect(resolveLocalSession(second.token)).resolves.toBeNull();
    await expect(
      prisma.liveReadinessAuditEvent.findMany({
        where: {
          OR: [
            { subjectType: "AuthSession", subjectId: first.session.sessionId },
            { action: "LOCAL_SESSIONS_REVOKED_ALL", subjectId: userId }
          ]
        },
        select: { action: true }
      })
    ).resolves.toEqual(
      expect.arrayContaining([
        { action: "LOCAL_SESSION_CREATED" },
        { action: "LOCAL_SESSION_REVOKED" },
        { action: "LOCAL_SESSIONS_REVOKED_ALL" }
      ])
    );
  });

  it("still rotates the user generation and revokes every session after an authenticated membership race", async () => {
    await prisma.membership.update({
      where: { orgId_userId: { orgId: orgAId, userId } },
      data: { status: MembershipStatus.ACTIVE }
    });
    await prisma.membership.update({
      where: { orgId_userId: { orgId: orgBId, userId } },
      data: { status: MembershipStatus.ACTIVE }
    });
    const first = await createLocalSession({ userId, orgId: orgAId });
    const second = await createLocalSession({ userId, orgId: orgBId });
    const before = await prisma.appUser.findUniqueOrThrow({ where: { id: userId } });

    // Models the race after route authentication but before the revocation transaction begins.
    await prisma.membership.update({
      where: { orgId_userId: { orgId: orgAId, userId } },
      data: { status: MembershipStatus.SUSPENDED }
    });

    await expect(
      revokeAllLocalSessionsForOrganization(userId, orgAId)
    ).resolves.toBeGreaterThanOrEqual(2);
    const after = await prisma.appUser.findUniqueOrThrow({ where: { id: userId } });
    expect(after.authVersion).toBe(before.authVersion + 1);
    await expect(resolveLocalSession(first.token)).resolves.toBeNull();
    await expect(resolveLocalSession(second.token)).resolves.toBeNull();
    await expect(
      prisma.liveReadinessAuditEvent.count({
        where: {
          orgId: orgAId,
          action: "LOCAL_SESSIONS_REVOKED_ALL",
          subjectId: userId,
          createdAt: { gte: before.updatedAt }
        }
      })
    ).resolves.toBeGreaterThanOrEqual(1);
  });
});
