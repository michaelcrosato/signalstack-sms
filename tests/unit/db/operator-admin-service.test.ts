import { createHash, randomUUID } from "node:crypto";
import { AuthTokenType, MembershipRole, MembershipStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyPassword } from "@/lib/auth/crypto";
import { createPrismaOperatorAdminService } from "@/lib/auth/operator-admin-store";
import { prisma } from "@/lib/db/prisma";

const run = process.env.RUN_DB_TESTS === "true";

describe.runIf(run)("operator administrator service on Postgres", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const organizationSlug = `operator-org-${suffix}`;
  const demoOrganizationSlug = `operator-demo-${suffix}`;
  const email = `operator-owner-${suffix}@example.test`;
  const foreignEmail = `operator-foreign-${suffix}@example.test`;
  const password = "correct horse battery staple\n";
  const bootstrapToken = `operator-bootstrap-${suffix}-0123456789abcdef`;

  beforeAll(async () => {
    await cleanup();
    await prisma.organization.createMany({
      data: [
        {
          name: "Operator Recovery Organization",
          slug: organizationSlug,
          demoMode: false,
          timezone: "America/Vancouver"
        },
        {
          name: "Operator Demo Organization",
          slug: demoOrganizationSlug,
          demoMode: true,
          timezone: "America/Vancouver"
        }
      ]
    });
  });

  afterAll(cleanup);

  it("serializes recovery creation and persists one enabled owner, credential, and secret-free audit", async () => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: organizationSlug }
    });
    const inviteIssuer = await prisma.appUser.create({
      data: {
        email: `operator-invite-issuer-${suffix}@example.test`,
        normalizedEmail: `operator-invite-issuer-${suffix}@example.test`
      }
    });
    await prisma.membership.create({
      data: {
        orgId: organization.id,
        userId: inviteIssuer.id,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE
      }
    });
    const pendingInvite = await prisma.authToken.create({
      data: {
        type: AuthTokenType.INVITE,
        tokenHash: createHash("sha256")
          .update(`operator-pending-invite-${suffix}`, "utf8")
          .digest("base64url"),
        orgId: organization.id,
        email,
        role: MembershipRole.OWNER,
        issuedByUserId: inviteIssuer.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1_000)
      }
    });
    const service = await createPrismaOperatorAdminService({ bootstrapToken });
    const input = {
      mode: "existing-org" as const,
      email: email.toUpperCase(),
      displayName: "Operator Recovery Owner",
      password,
      organizationSlug
    };

    const concurrent = await Promise.all([service.create(input), service.create(input)]);
    expect(concurrent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ created: true }),
        { created: false, code: "ADMIN_IDENTITY_EXISTS" }
      ])
    );
    await expect(service.create(input)).resolves.toEqual({
      created: false,
      code: "ADMIN_IDENTITY_EXISTS"
    });

    const user = await prisma.appUser.findUniqueOrThrow({
      where: { normalizedEmail: email },
      include: { localCredential: true, memberships: true }
    });
    expect(user).toMatchObject({
      email,
      normalizedEmail: email,
      disabledAt: null,
      clerkUserId: null
    });
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(user.localCredential).not.toBeNull();
    expect(user.localCredential?.passwordHash).not.toContain(password);
    await expect(
      verifyPassword(password, user.localCredential!.passwordHash)
    ).resolves.toBe(true);
    expect(user.memberships).toEqual([
      expect.objectContaining({
        orgId: expect.any(String),
        userId: user.id,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE
      })
    ]);

    expect(organization.demoMode).toBe(false);
    expect(user.memberships[0]?.orgId).toBe(organization.id);
    await expect(
      prisma.authToken.findUniqueOrThrow({ where: { id: pendingInvite.id } })
    ).resolves.toMatchObject({ consumedAt: null, revokedAt: expect.any(Date) });

    const auditEvents = await prisma.liveReadinessAuditEvent.findMany({
      where: { orgId: organization.id, action: "LOCAL_OWNER_RECOVERY_CREATED" }
    });
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      actorUserId: null,
      subjectType: "AppUser",
      subjectId: user.id,
      metadata: {
        authMode: "local",
        source: "operator_admin_cli",
        role: "OWNER",
        revokedPendingInviteCount: 1
      }
    });
    const serializedAudit = JSON.stringify(auditEvents);
    expect(serializedAudit).not.toContain(password);
    expect(serializedAudit).not.toContain(email);
    expect(serializedAudit).not.toContain(bootstrapToken);
  });

  it("does not adopt an existing identity without a credential", async () => {
    const foreign = await prisma.appUser.create({
      data: {
        email: foreignEmail,
        normalizedEmail: foreignEmail,
        displayName: "Foreign Existing Identity"
      }
    });
    const service = await createPrismaOperatorAdminService({ bootstrapToken });

    await expect(
      service.create({
        mode: "existing-org",
        email: foreignEmail,
        displayName: "Replacement Name",
        password,
        organizationSlug
      })
    ).resolves.toEqual({ created: false, code: "ADMIN_IDENTITY_EXISTS" });
    await expect(
      prisma.localCredential.findUnique({ where: { userId: foreign.id } })
    ).resolves.toBeNull();
    await expect(
      prisma.membership.findMany({ where: { userId: foreign.id } })
    ).resolves.toEqual([]);
  });

  it("rejects missing, demo, and non-exact organization slugs without writes", async () => {
    const service = await createPrismaOperatorAdminService({ bootstrapToken });
    const candidate = `operator-rejected-${suffix}@example.test`;
    const base = {
      mode: "existing-org" as const,
      email: candidate,
      displayName: "Rejected Operator Owner",
      password
    };

    await expect(
      service.create({ ...base, organizationSlug: `missing-${suffix}` })
    ).resolves.toEqual({ created: false, code: "ADMIN_ORGANIZATION_NOT_FOUND" });
    await expect(
      service.create({ ...base, organizationSlug: demoOrganizationSlug })
    ).resolves.toEqual({ created: false, code: "ADMIN_ORGANIZATION_NOT_ELIGIBLE" });
    await expect(
      service.create({ ...base, organizationSlug: organizationSlug.toUpperCase() })
    ).resolves.toEqual({ created: false, code: "ADMIN_INPUT_INVALID" });
    await expect(
      prisma.appUser.findUnique({ where: { normalizedEmail: candidate } })
    ).resolves.toBeNull();
  });

  async function cleanup() {
    await prisma.organization.deleteMany({
      where: { slug: { in: [organizationSlug, demoOrganizationSlug] } }
    });
    await prisma.appUser.deleteMany({
      where: { normalizedEmail: { contains: suffix } }
    });
  }
});
