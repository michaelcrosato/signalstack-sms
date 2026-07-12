import { randomUUID } from "node:crypto";
import {
  MembershipRole,
  MembershipStatus,
  type Prisma
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  withAuthDatabaseContext,
  type AuthDatabaseContext
} from "@/lib/db/tenant-context";

const run = process.env.RUN_DB_TESTS === "true";
const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
const demoSubject = `demo-subject-${suffix}`;
const demoEmail = `demo-${suffix}@example.test`;
const foreignEmail = `foreign-${suffix}@example.test`;
const demoSlug = `control-demo-${suffix}`;
const foreignSlug = `control-foreign-${suffix}`;
const createdSlug = `control-created-${suffix}`;
const demoApiKeyHash = `api-key-demo-${suffix}`;
const foreignApiKeyHash = `api-key-foreign-${suffix}`;

describe.runIf(run)("control role policy hardening", () => {
  let demoOrgId = "";
  let foreignOrgId = "";
  let demoUserId = "";
  let foreignUserId = "";
  let foreignMembershipId = "";
  const extraOrgIds: string[] = [];

  beforeAll(async () => {
    const [demoOrg, foreignOrg, demoUser, foreignUser] = await prisma.$transaction(async (tx) => {
      const organizations = await Promise.all([
        tx.organization.create({
          data: { name: "Control Demo", slug: demoSlug, demoMode: true }
        }),
        tx.organization.create({
          data: { name: "Control Foreign", slug: foreignSlug, demoMode: false }
        })
      ]);
      const users = await Promise.all([
        tx.appUser.create({
          data: {
            clerkUserId: demoSubject,
            email: demoEmail,
            normalizedEmail: demoEmail
          }
        }),
        tx.appUser.create({
          data: { email: foreignEmail, normalizedEmail: foreignEmail }
        })
      ]);
      return [organizations[0], organizations[1], users[0], users[1]] as const;
    });

    demoOrgId = demoOrg.id;
    foreignOrgId = foreignOrg.id;
    demoUserId = demoUser.id;
    foreignUserId = foreignUser.id;
    const [demoMembership, foreignMembership] = await prisma.$transaction([
      prisma.membership.create({
        data: {
          orgId: demoOrgId,
          userId: demoUserId,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE
        }
      }),
      prisma.membership.create({
        data: {
          orgId: foreignOrgId,
          userId: foreignUserId,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE
        }
      })
    ]);
    void demoMembership;
    foreignMembershipId = foreignMembership.id;
    await prisma.apiCredential.createMany({
      data: [
        {
          orgId: demoOrgId,
          name: "Demo API key",
          prefix: `demo_${suffix}`,
          secretHash: demoApiKeyHash,
          scopes: ["organization:read"]
        },
        {
          orgId: foreignOrgId,
          name: "Foreign API key",
          prefix: `foreign_${suffix}`,
          secretHash: foreignApiKeyHash,
          scopes: ["organization:read"]
        }
      ]
    });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: [...extraOrgIds, demoOrgId, foreignOrgId].filter(Boolean) } }
    });
    await prisma.appUser.deleteMany({
      where: { id: { in: [demoUserId, foreignUserId].filter(Boolean) } }
    });
  });

  it("exposes no control rows and permits no organization insert from purpose alone", async () => {
    for (const purpose of ["bootstrap", "organization_create"] as const) {
      const counts = await withControlContext({ purpose }, async (tx) => ({
        organizations: await tx.organization.count(),
        memberships: await tx.membership.count(),
        users: await tx.appUser.count()
      }));
      expect(counts).toEqual({ organizations: 0, memberships: 0, users: 0 });
    }

    await expect(
      withControlContext({ purpose: "organization_create" }, (tx) =>
        tx.organization.create({
          data: {
            name: "Purpose Only",
            slug: `purpose-only-${suffix}`,
            demoMode: false
          }
        })
      )
    ).rejects.toThrow();
  });

  it("preserves exact organization evidence through the application control wrapper", async () => {
    const snapshot = await withAuthDatabaseContext(
      { orgId: demoOrgId, userId: demoUserId, purpose: "session" },
      async (tx) => {
        const [setting] = await tx.$queryRaw<Array<{ orgId: string | null }>>`
          SELECT NULLIF(current_setting('app.current_org_id', true), '') AS "orgId"
        `;
        return {
          setting: setting?.orgId ?? null,
          organizations: await tx.organization.findMany({ select: { id: true } })
        };
      }
    );
    expect(snapshot).toEqual({ setting: demoOrgId, organizations: [{ id: demoOrgId }] });
  });

  it("resolves only the exact API-key hash through a SELECT-only control policy", async () => {
    const exact = await withAuthDatabaseContext(
      { apiKeyHash: demoApiKeyHash, purpose: "api_key" },
      (tx) => tx.apiCredential.findMany({ select: { orgId: true, secretHash: true } })
    );
    expect(exact).toEqual([{ orgId: demoOrgId, secretHash: demoApiKeyHash }]);

    const wrongPurpose = await withAuthDatabaseContext(
      { apiKeyHash: demoApiKeyHash, purpose: "session" },
      (tx) => tx.apiCredential.findMany({ select: { id: true } })
    );
    expect(wrongPurpose).toEqual([]);

    const absentHash = await withAuthDatabaseContext(
      { purpose: "api_key" },
      (tx) => tx.apiCredential.findMany({ select: { id: true } })
    );
    expect(absentHash).toEqual([]);

    await expect(
      withAuthDatabaseContext(
        { apiKeyHash: demoApiKeyHash, purpose: "api_key" },
        (tx) => tx.apiCredential.update({
          where: { secretHash: demoApiKeyHash },
          data: { lastUsedAt: new Date() }
        })
      )
    ).rejects.toThrow();
  });

  it("binds bootstrap visibility and mutation to the exact demo subject and slug", async () => {
    const snapshot = await withControlContext(
      {
        loginEmail: foreignEmail,
        orgSlug: foreignSlug,
        tokenHash: demoSubject,
        purpose: "bootstrap"
      },
      async (tx) => ({
        organizationIds: (await tx.organization.findMany({ select: { id: true } })).map(({ id }) => id),
        membershipIds: (await tx.membership.findMany({ select: { id: true } })).map(({ id }) => id),
        userIds: (await tx.appUser.findMany({ select: { id: true } })).map(({ id }) => id),
        foreignUserUpdates: (
          await tx.appUser.updateMany({
            where: { id: foreignUserId },
            data: { displayName: "forged" }
          })
        ).count,
        foreignOrgUpdates: (
          await tx.organization.updateMany({
            where: { id: foreignOrgId },
            data: { name: "forged" }
          })
        ).count,
        foreignMembershipUpdates: (
          await tx.membership.updateMany({
            where: { id: foreignMembershipId },
            data: { role: MembershipRole.ADMIN }
          })
        ).count
      })
    );

    expect(snapshot).toEqual({
      organizationIds: [],
      membershipIds: [],
      userIds: [demoUserId],
      foreignUserUpdates: 0,
      foreignOrgUpdates: 0,
      foreignMembershipUpdates: 0
    });

    await expect(
      withControlContext(
        { orgId: demoOrgId, userId: demoUserId, purpose: "session" },
        (tx) => tx.membership.create({
          data: {
            orgId: demoOrgId,
            userId: foreignUserId,
            role: MembershipRole.MEMBER,
            status: MembershipStatus.ACTIVE
          }
        })
      )
    ).rejects.toThrow();
  });

  it("preserves exact demo upserts", async () => {
    const result = await withControlContext(
      {
        loginEmail: demoEmail,
        orgSlug: demoSlug,
        tokenHash: demoSubject,
        purpose: "bootstrap"
      },
      async (tx) => {
        const user = await tx.appUser.upsert({
          where: { clerkUserId: demoSubject },
          update: { displayName: "Exact Demo User" },
          create: {
            clerkUserId: demoSubject,
            email: demoEmail,
            normalizedEmail: demoEmail,
            displayName: "Exact Demo User"
          }
        });
        const org = await tx.organization.upsert({
          where: { slug: demoSlug },
          update: { name: "Exact Demo Organization", demoMode: true },
          create: { name: "Exact Demo Organization", slug: demoSlug, demoMode: true }
        });
        await setControlContext(tx, {
          orgId: org.id,
          orgSlug: org.slug,
          userId: user.id,
          loginEmail: demoEmail,
          tokenHash: demoSubject,
          purpose: "bootstrap"
        });
        const membership = await tx.membership.upsert({
          where: { orgId_userId: { orgId: org.id, userId: user.id } },
          update: { role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE },
          create: {
            orgId: org.id,
            userId: user.id,
            role: MembershipRole.OWNER,
            status: MembershipStatus.ACTIVE
          }
        });
        return { orgId: org.id, userId: user.id, membershipUserId: membership.userId };
      }
    );

    expect(result).toEqual({
      orgId: demoOrgId,
      userId: demoUserId,
      membershipUserId: demoUserId
    });
  });

  it("creates only the requested organization and exact owner membership", async () => {
    const result = await withControlContext(
      { userId: foreignUserId, orgSlug: createdSlug, purpose: "organization_create" },
      async (tx) => {
        const organization = await tx.organization.create({
          data: { name: "Exact Created Organization", slug: createdSlug, demoMode: false }
        });
        await setControlContext(tx, {
          orgId: organization.id,
          orgSlug: organization.slug,
          userId: foreignUserId,
          purpose: "organization_create"
        });
        const membership = await tx.membership.create({
          data: {
            orgId: organization.id,
            userId: foreignUserId,
            role: MembershipRole.OWNER,
            status: MembershipStatus.ACTIVE
          }
        });
        const audit = await tx.liveReadinessAuditEvent.create({
          data: {
            orgId: organization.id,
            actorUserId: foreignUserId,
            action: "ORGANIZATION_CREATED",
            subjectType: "Organization",
            subjectId: organization.id
          }
        });
        return { organization, membership, audit };
      }
    );
    extraOrgIds.push(result.organization.id);

    expect(result.organization).toMatchObject({ slug: createdSlug, demoMode: false });
    expect(result.membership).toMatchObject({
      orgId: result.organization.id,
      userId: foreignUserId,
      role: MembershipRole.OWNER
    });
    expect(result.audit.orgId).toBe(result.organization.id);
  });

  it("removes delete authority from all three control tables", async () => {
    const context = { orgId: demoOrgId, userId: demoUserId, purpose: "session" } as const;
    await expect(
      withControlContext(context, (tx) => tx.organization.deleteMany({ where: { id: demoOrgId } }))
    ).rejects.toThrow();
    await expect(
      withControlContext(context, (tx) => tx.membership.deleteMany({ where: { orgId: demoOrgId } }))
    ).rejects.toThrow();
    await expect(
      withControlContext(context, (tx) => tx.appUser.deleteMany({ where: { id: demoUserId } }))
    ).rejects.toThrow();
  });
});

async function withControlContext<T>(
  context: AuthDatabaseContext,
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_control");
    await setControlContext(tx, context);
    return operation(tx);
  });
}

async function setControlContext(
  tx: Prisma.TransactionClient,
  context: AuthDatabaseContext
): Promise<void> {
  await tx.$queryRaw`
    SELECT
      set_config('app.current_org_id', ${context.orgId ?? ""}, true),
      set_config('app.current_org_slug', ${context.orgSlug ?? ""}, true),
      set_config('app.current_user_id', ${context.userId ?? ""}, true),
      set_config('app.current_session_hash', ${context.sessionHash ?? ""}, true),
      set_config('app.current_token_hash', ${context.tokenHash ?? ""}, true),
      set_config('app.current_api_key_hash', ${context.apiKeyHash ?? ""}, true),
      set_config('app.current_login_email', ${context.loginEmail ?? ""}, true),
      set_config('app.control_purpose', ${context.purpose ?? ""}, true)
  `;
}
