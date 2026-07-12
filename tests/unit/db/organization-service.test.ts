import { randomUUID } from "node:crypto";
import { MembershipRole, MembershipStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createOrganizationForUser,
  listOrganizationsForUser,
  OrganizationServiceError
} from "@/lib/auth/organization-service";
import { prisma } from "@/lib/db/prisma";

const run = process.env.RUN_DB_TESTS === "true";

describe.runIf(run)("organization membership service on Postgres", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const firstEmail = `organization-service-one-${suffix}@example.test`;
  const secondEmail = `organization-service-two-${suffix}@example.test`;
  let firstUserId = "";
  let secondUserId = "";

  beforeAll(async () => {
    const [firstUser, secondUser] = await Promise.all([
      prisma.appUser.create({
        data: { email: firstEmail, normalizedEmail: firstEmail, displayName: "First Owner" }
      }),
      prisma.appUser.create({
        data: { email: secondEmail, normalizedEmail: secondEmail, displayName: "Second Owner" }
      })
    ]);
    firstUserId = firstUser.id;
    secondUserId = secondUser.id;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { slug: { contains: suffix } } });
    await prisma.appUser.deleteMany({ where: { normalizedEmail: { contains: suffix } } });
  });

  it("atomically creates one non-demo tenant, OWNER membership, and secret-free audit event", async () => {
    const slug = `organization-service-race-${suffix}`;
    const attempts = await Promise.allSettled([
      createOrganizationForUser(
        { userId: firstUserId },
        { name: "Concurrent Organization", slug, timezone: "UTC" }
      ),
      createOrganizationForUser(
        { userId: firstUserId },
        { name: "Concurrent Organization", slug, timezone: "UTC" }
      )
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find(
      (attempt): attempt is PromiseRejectedResult => attempt.status === "rejected"
    );
    expect(rejected?.reason).toBeInstanceOf(OrganizationServiceError);
    expect(rejected?.reason).toMatchObject({ code: "ORGANIZATION_SLUG_UNAVAILABLE", status: 409 });

    const organizations = await prisma.organization.findMany({
      where: { slug },
      include: { memberships: true, liveReadinessAuditEvents: true }
    });
    expect(organizations).toHaveLength(1);
    expect(organizations[0]).toMatchObject({
      name: "Concurrent Organization",
      slug,
      timezone: "UTC",
      demoMode: false
    });
    expect(organizations[0]?.memberships).toEqual([
      expect.objectContaining({
        userId: firstUserId,
        orgId: organizations[0]?.id,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE
      })
    ]);
    expect(organizations[0]?.liveReadinessAuditEvents).toEqual([
      expect.objectContaining({
        orgId: organizations[0]?.id,
        actorUserId: firstUserId,
        action: "ORGANIZATION_CREATED",
        subjectType: "Organization",
        subjectId: organizations[0]?.id,
        metadata: { source: "self_hosted_identity" }
      })
    ]);
    const auditJson = JSON.stringify(organizations[0]?.liveReadinessAuditEvents);
    expect(auditJson).not.toMatch(/password|token|credential|secret/i);
  });

  it("lists only active memberships and returns none once the user is disabled", async () => {
    const active = await createOrganizationForUser(
      { userId: secondUserId },
      {
        name: "Active Organization",
        slug: `organization-service-active-${suffix}`,
        timezone: "America/Vancouver"
      }
    );
    const suspended = await createOrganizationForUser(
      { userId: secondUserId },
      {
        name: "Suspended Organization",
        slug: `organization-service-suspended-${suffix}`,
        timezone: "UTC"
      }
    );
    await prisma.membership.update({
      where: {
        orgId_userId: {
          orgId: suspended.organization.id,
          userId: secondUserId
        }
      },
      data: { status: MembershipStatus.SUSPENDED }
    });

    await expect(listOrganizationsForUser({ userId: secondUserId })).resolves.toEqual([active]);

    await prisma.appUser.update({
      where: { id: secondUserId },
      data: { disabledAt: new Date("2026-07-10T00:00:00.000Z") }
    });
    await expect(listOrganizationsForUser({ userId: secondUserId })).resolves.toEqual([]);
  });
});
