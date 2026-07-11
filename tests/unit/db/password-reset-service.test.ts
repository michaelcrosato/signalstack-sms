import { randomUUID } from "node:crypto";
import { AuthTokenType, MembershipRole, MembershipStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashOpaqueToken, hashPassword, verifyPassword } from "@/lib/auth/crypto";
import { createLocalSession, resolveLocalSession } from "@/lib/auth/local-session";
import {
  createPrismaOperatorPasswordResetService,
  OperatorPasswordResetError
} from "@/lib/auth/operator-password-reset";
import { completePasswordReset } from "@/lib/auth/password-reset-service";
import { prisma } from "@/lib/db/prisma";

const run = process.env.RUN_DB_TESTS === "true";

describe.runIf(run)("operator-global password reset on Postgres", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const email = `operator-reset-${suffix}@example.test`;
  const orgASlug = `operator-reset-a-${suffix}`;
  const orgBSlug = `operator-reset-b-${suffix}`;
  const oldPassword = "old standalone password 2026";
  const replacementPassword = "new standalone password 2026";
  let userId = "";
  let orgAId = "";
  let orgBId = "";

  beforeAll(async () => {
    const [orgA, orgB, user] = await Promise.all([
      prisma.organization.create({ data: { name: "Reset A", slug: orgASlug, demoMode: false } }),
      prisma.organization.create({ data: { name: "Reset B", slug: orgBSlug, demoMode: false } }),
      prisma.appUser.create({ data: { email, normalizedEmail: email, displayName: "Reset User" } })
    ]);
    await prisma.membership.createMany({
      data: [
        { orgId: orgA.id, userId: user.id, role: MembershipRole.MEMBER, status: MembershipStatus.ACTIVE },
        { orgId: orgB.id, userId: user.id, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE }
      ]
    });
    await prisma.localCredential.create({
      data: { userId: user.id, passwordHash: await hashPassword(oldPassword) }
    });
    userId = user.id;
    orgAId = orgA.id;
    orgBId = orgB.id;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { slug: { in: [orgASlug, orgBSlug] } } });
    await prisma.appUser.deleteMany({ where: { normalizedEmail: email } });
  });

  it("issues one operator-global hashed bearer and audits every current organization", async () => {
    const issue = await createPrismaOperatorPasswordResetService(prisma);
    const first = await issue({ email, organizationSlug: orgASlug });
    const second = await issue({ email, organizationSlug: orgBSlug });
    const [storedFirst, storedSecond, audits] = await Promise.all([
      prisma.authToken.findUniqueOrThrow({ where: { tokenHash: hashOpaqueToken(first.token) } }),
      prisma.authToken.findUniqueOrThrow({ where: { tokenHash: hashOpaqueToken(second.token) } }),
      prisma.liveReadinessAuditEvent.findMany({
        where: { action: "AUTH_PASSWORD_RESET_LINK_ISSUED_BY_OPERATOR", subjectId: userId }
      })
    ]);

    expect(storedFirst.revokedAt).not.toBeNull();
    expect(storedSecond).toMatchObject({
      type: AuthTokenType.PASSWORD_RESET,
      userId,
      orgId: null,
      email: null,
      role: null,
      issuedByUserId: null,
      consumedAt: null,
      revokedAt: null
    });
    expect(storedSecond.tokenHash).not.toBe(second.token);
    expect(audits.map((audit) => audit.orgId)).toEqual(
      expect.arrayContaining([orgAId, orgBId])
    );
    expect(audits.every((audit) => audit.actorUserId === null)).toBe(true);
    expect(JSON.stringify(audits)).not.toContain(first.token);
    expect(JSON.stringify(audits)).not.toContain(second.token);
  });

  it("requires the exact operator-selected organization membership to remain active", async () => {
    await prisma.membership.update({
      where: { orgId_userId: { orgId: orgAId, userId } },
      data: { status: MembershipStatus.SUSPENDED }
    });
    const issue = await createPrismaOperatorPasswordResetService(prisma);
    try {
      await expect(issue({ email, organizationSlug: orgASlug })).rejects.toEqual(
        new OperatorPasswordResetError("SUBJECT_UNAVAILABLE")
      );
      await expect(issue({ email, organizationSlug: orgBSlug })).resolves.toMatchObject({ email });
    } finally {
      await prisma.membership.update({
        where: { orgId_userId: { orgId: orgAId, userId } },
        data: { status: MembershipStatus.ACTIVE }
      });
    }
  });

  it("allows only one completion and rotates the credential generation plus every organization session", async () => {
    const [sessionA, sessionB] = await Promise.all([
      createLocalSession({ userId, orgId: orgAId }),
      createLocalSession({ userId, orgId: orgBId })
    ]);
    const before = await prisma.appUser.findUniqueOrThrow({ where: { id: userId } });
    const issue = await createPrismaOperatorPasswordResetService(prisma);
    const reset = await issue({ email, organizationSlug: orgASlug });

    const attempts = await Promise.allSettled([
      completePasswordReset({ token: reset.token, password: replacementPassword }),
      completePasswordReset({ token: reset.token, password: replacementPassword })
    ]);
    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(1);

    const [credential, after, token, sessions, audits] = await Promise.all([
      prisma.localCredential.findUniqueOrThrow({ where: { userId } }),
      prisma.appUser.findUniqueOrThrow({ where: { id: userId } }),
      prisma.authToken.findUniqueOrThrow({ where: { tokenHash: hashOpaqueToken(reset.token) } }),
      prisma.authSession.findMany({ where: { userId } }),
      prisma.liveReadinessAuditEvent.findMany({
        where: { action: "AUTH_PASSWORD_RESET_COMPLETED", subjectId: userId }
      })
    ]);
    expect(await verifyPassword(replacementPassword, credential.passwordHash)).toBe(true);
    expect(await verifyPassword(oldPassword, credential.passwordHash)).toBe(false);
    expect(after.authVersion).toBe(before.authVersion + 1);
    expect(token.consumedAt).not.toBeNull();
    expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);
    await expect(resolveLocalSession(sessionA.token)).resolves.toBeNull();
    await expect(resolveLocalSession(sessionB.token)).resolves.toBeNull();
    expect(audits.map((audit) => audit.orgId)).toEqual(
      expect.arrayContaining([orgAId, orgBId])
    );
    expect(audits.every((audit) => audit.actorUserId === null)).toBe(true);
    expect(audits.every((audit) => JSON.stringify(audit.metadata).includes("operator_reset_bearer"))).toBe(true);
  });

  it("rejects replay before hashing and leaves no plaintext reset token in storage", async () => {
    const issue = await createPrismaOperatorPasswordResetService(prisma);
    const reset = await issue({ email, organizationSlug: orgASlug });
    await completePasswordReset({ token: reset.token, password: replacementPassword });
    await expect(
      completePasswordReset({ token: reset.token, password: replacementPassword })
    ).rejects.toMatchObject({ code: "PASSWORD_RESET_UNAVAILABLE" });
    expect(await prisma.authToken.count({ where: { tokenHash: reset.token } })).toBe(0);
  });
});
