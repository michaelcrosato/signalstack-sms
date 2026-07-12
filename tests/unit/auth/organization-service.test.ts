import { MembershipRole, MembershipStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedLocalSession } from "@/lib/auth/local-session";
import {
  createOrganizationForUser,
  listOrganizationsForUser,
  OrganizationServiceError,
  selectOrganizationForSession,
  type CreateOwnedOrganizationStoreInput,
  type OrganizationMembershipStoreRecord,
  type OrganizationServiceStore
} from "@/lib/auth/organization-service";

const USER_ONE = "user-one";
const USER_TWO = "user-two";
const SESSION_TOKEN = `session_${"a".repeat(64)}`;

function record(
  overrides: Partial<OrganizationMembershipStoreRecord> &
    Pick<OrganizationMembershipStoreRecord, "userId">
): OrganizationMembershipStoreRecord {
  const { userId, ...recordOverrides } = overrides;
  return {
    userId,
    userDisabledAt: null,
    status: MembershipStatus.ACTIVE,
    role: MembershipRole.MEMBER,
    organization: {
      id: "org-one",
      name: "Organization One",
      slug: "organization-one",
      timezone: "UTC",
      demoMode: false
    },
    ...recordOverrides
  };
}

class MemoryOrganizationStore implements OrganizationServiceStore {
  readonly memberships: OrganizationMembershipStoreRecord[] = [];
  readonly unavailableSlugs = new Set<string>();
  readonly disabledUsers = new Set<string>();
  readonly createCalls: CreateOwnedOrganizationStoreInput[] = [];
  failListWith: unknown = null;
  failCreateWith: unknown = null;

  async listActiveMembershipsForUser(userId: string) {
    if (this.failListWith) {
      throw this.failListWith;
    }
    // Deliberately return every row for defense-in-depth service tests.
    return this.memberships.filter(
      (membership) => membership.userId === userId || membership.organization.id === "malicious-row"
    );
  }

  async findActiveMembershipForUser(userId: string, organizationId: string) {
    return (
      this.memberships.find(
        (membership) =>
          membership.userId === userId && membership.organization.id === organizationId
      ) ??
      this.memberships.find((membership) => membership.organization.id === organizationId) ??
      null
    );
  }

  async createOwnedOrganization(input: CreateOwnedOrganizationStoreInput) {
    this.createCalls.push(input);
    if (this.failCreateWith) {
      throw this.failCreateWith;
    }
    if (this.disabledUsers.has(input.actorUserId)) {
      return null;
    }
    if (this.unavailableSlugs.has(input.slug)) {
      throw { code: "P2002", internalDetail: "database-secret" };
    }
    // Reserve synchronously so concurrent calls model the database unique constraint.
    this.unavailableSlugs.add(input.slug);
    const membership = record({
      userId: input.actorUserId,
      role: MembershipRole.OWNER,
      organization: {
        id: `org-${input.slug}`,
        name: input.name,
        slug: input.slug,
        timezone: input.timezone,
        demoMode: false
      }
    });
    this.memberships.push(membership);
    return membership;
  }
}

function resolvedSession(overrides: Partial<ResolvedLocalSession> = {}): ResolvedLocalSession {
  const now = new Date("2026-07-10T12:00:00.000Z");
  return {
    sessionId: "session-one",
    userId: USER_ONE,
    email: "private@example.test",
    displayName: "Private Name",
    orgId: "org-one",
    orgSlug: "organization-one",
    orgName: "Organization One",
    role: MembershipRole.MEMBER,
    demoMode: false,
    createdAt: now,
    lastSeenAt: now,
    idleExpiresAt: new Date("2026-07-10T12:30:00.000Z"),
    absoluteExpiresAt: new Date("2026-07-11T12:00:00.000Z"),
    ...overrides
  };
}

describe("organization membership service", () => {
  let store: MemoryOrganizationStore;

  beforeEach(() => {
    store = new MemoryOrganizationStore();
  });

  it("lists only ACTIVE memberships for the enabled authenticated user", async () => {
    store.memberships.push(
      record({ userId: USER_ONE, role: MembershipRole.OWNER }),
      record({
        userId: USER_ONE,
        status: MembershipStatus.SUSPENDED,
        organization: {
          id: "org-suspended",
          name: "Suspended",
          slug: "suspended",
          timezone: "UTC",
          demoMode: false
        }
      }),
      record({
        userId: USER_ONE,
        userDisabledAt: new Date("2026-07-10T00:00:00.000Z"),
        organization: {
          id: "org-disabled-user",
          name: "Disabled User",
          slug: "disabled-user",
          timezone: "UTC",
          demoMode: false
        }
      }),
      record({
        userId: USER_TWO,
        organization: {
          id: "malicious-row",
          name: "Other Tenant",
          slug: "other-tenant",
          timezone: "UTC",
          demoMode: false
        }
      })
    );

    await expect(listOrganizationsForUser({ userId: USER_ONE }, { store })).resolves.toEqual([
      {
        organization: {
          id: "org-one",
          name: "Organization One",
          slug: "organization-one",
          timezone: "UTC",
          demoMode: false
        },
        role: MembershipRole.OWNER
      }
    ]);
  });

  it("creates a normalized non-demo organization with an implicit OWNER membership", async () => {
    const result = await createOrganizationForUser(
      { userId: USER_ONE },
      { name: "  Acme North  ", slug: "acme-north", timezone: "  UTC  " },
      { store }
    );

    expect(store.createCalls).toEqual([
      {
        actorUserId: USER_ONE,
        name: "Acme North",
        slug: "acme-north",
        timezone: "UTC"
      }
    ]);
    expect(result).toEqual({
      organization: {
        id: "org-acme-north",
        name: "Acme North",
        slug: "acme-north",
        timezone: "UTC",
        demoMode: false
      },
      role: MembershipRole.OWNER
    });
    expect(Object.keys(result)).toEqual(["organization", "role"]);
    expect(JSON.stringify(result)).not.toContain(USER_ONE);
  });

  it("rejects invalid input and caller-supplied user or role fields before storage", async () => {
    await expect(
      createOrganizationForUser(
        { userId: USER_ONE },
        {
          name: "Acme",
          slug: "Acme",
          timezone: "UTC",
          userId: USER_TWO,
          role: MembershipRole.ADMIN
        },
        { store }
      )
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      status: 400,
      message: "Organization details are invalid."
    });
    expect(store.createCalls).toHaveLength(0);
  });

  it("allows exactly one winner for concurrent duplicate slugs and returns a sanitized conflict", async () => {
    const requests = await Promise.allSettled([
      createOrganizationForUser(
        { userId: USER_ONE },
        { name: "First", slug: "shared-slug", timezone: "UTC" },
        { store }
      ),
      createOrganizationForUser(
        { userId: USER_TWO },
        { name: "Second", slug: "shared-slug", timezone: "UTC" },
        { store }
      )
    ]);

    expect(requests.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = requests.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    expect(rejected?.reason).toBeInstanceOf(OrganizationServiceError);
    expect(rejected?.reason).toMatchObject({
      code: "ORGANIZATION_SLUG_UNAVAILABLE",
      status: 409,
      message: "Organization slug is unavailable."
    });
    expect(JSON.stringify(rejected?.reason)).not.toContain("database-secret");
  });

  it("rejects organization creation for a disabled authenticated user", async () => {
    store.disabledUsers.add(USER_ONE);
    await expect(
      createOrganizationForUser(
        { userId: USER_ONE },
        { name: "Acme", slug: "acme", timezone: "UTC" },
        { store }
      )
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED", status: 401 });
  });

  it.each([
    ["suspended membership", MembershipStatus.SUSPENDED, null, USER_ONE],
    ["disabled user", MembershipStatus.ACTIVE, new Date("2026-07-10T00:00:00.000Z"), USER_ONE],
    ["other user's membership", MembershipStatus.ACTIVE, null, USER_TWO]
  ])("does not switch for a %s", async (_label, status, disabledAt, membershipUserId) => {
    store.memberships.push(
      record({
        userId: membershipUserId,
        status,
        userDisabledAt: disabledAt,
        organization: {
          id: "org-target",
          name: "Target",
          slug: "target",
          timezone: "UTC",
          demoMode: false
        }
      })
    );
    const switchSessionOrganization = vi.fn();

    await expect(
      selectOrganizationForSession(
        { userId: USER_ONE },
        SESSION_TOKEN,
        { organizationId: "org-target" },
        { store, switchSessionOrganization }
      )
    ).rejects.toMatchObject({
      code: "ORGANIZATION_ACCESS_DENIED",
      message: "Organization is unavailable."
    });
    expect(switchSessionOrganization).not.toHaveBeenCalled();
  });

  it("switches through the opaque-session seam and returns only organization and role data", async () => {
    store.memberships.push(
      record({
        userId: USER_ONE,
        role: MembershipRole.ADMIN,
        organization: {
          id: "org-target",
          name: "Target",
          slug: "target",
          timezone: "America/Vancouver",
          demoMode: false
        }
      })
    );
    const switchSessionOrganization = vi.fn().mockResolvedValue(
      resolvedSession({
        orgId: "org-target",
        orgSlug: "target",
        orgName: "Target",
        role: MembershipRole.ADMIN
      })
    );

    const result = await selectOrganizationForSession(
      { userId: USER_ONE },
      SESSION_TOKEN,
      { organizationId: "org-target" },
      { store, switchSessionOrganization }
    );

    expect(switchSessionOrganization).toHaveBeenCalledWith(SESSION_TOKEN, "org-target");
    expect(result).toEqual({
      organization: {
        id: "org-target",
        name: "Target",
        slug: "target",
        timezone: "America/Vancouver",
        demoMode: false
      },
      role: MembershipRole.ADMIN
    });
    expect(JSON.stringify(result)).not.toContain("private@example.test");
    expect(JSON.stringify(result)).not.toContain("session-one");
  });

  it("rejects a token resolved for another user even when the actor has target membership", async () => {
    store.memberships.push(
      record({
        userId: USER_ONE,
        organization: {
          id: "org-target",
          name: "Target",
          slug: "target",
          timezone: "UTC",
          demoMode: false
        }
      })
    );
    const switchSessionOrganization = vi
      .fn()
      .mockResolvedValue(resolvedSession({ userId: USER_TWO, orgId: "org-target" }));

    await expect(
      selectOrganizationForSession(
        { userId: USER_ONE },
        SESSION_TOKEN,
        { organizationId: "org-target" },
        { store, switchSessionOrganization }
      )
    ).rejects.toMatchObject({ code: "ORGANIZATION_ACCESS_DENIED" });
  });

  it("sanitizes unexpected storage errors", async () => {
    store.failListWith = new Error("postgres://admin:super-secret@internal/database");

    const error = await listOrganizationsForUser({ userId: USER_ONE }, { store }).catch(
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect(error).toMatchObject({
      code: "ORGANIZATION_OPERATION_FAILED",
      status: 500,
      message: "Organization operation failed."
    });
    expect(JSON.stringify(error)).not.toContain("super-secret");
    expect(String(error)).not.toContain("postgres://");
  });
});
