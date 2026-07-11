import {
  MembershipRole,
  MembershipStatus,
  Prisma
} from "@prisma/client";
import {
  switchLocalSessionOrganization,
  type ResolvedLocalSession
} from "@/lib/auth/local-session";
import { prisma } from "@/lib/db/prisma";
import {
  organizationCreateSchema,
  sessionOrganizationSelectSchema
} from "@/lib/validation/auth";

export type AuthenticatedOrganizationActor = Readonly<{
  /** Must come from the resolved server-side authentication principal. */
  userId: string;
}>;

export type OrganizationMembershipSummary = Readonly<{
  organization: Readonly<{
    id: string;
    name: string;
    slug: string;
    timezone: string;
    demoMode: boolean;
  }>;
  role: MembershipRole;
}>;

export type OrganizationMembershipStoreRecord = Readonly<{
  userId: string;
  userDisabledAt: Date | null;
  status: MembershipStatus;
  role: MembershipRole;
  organization: OrganizationMembershipSummary["organization"];
}>;

export type CreateOwnedOrganizationStoreInput = Readonly<{
  actorUserId: string;
  name: string;
  slug: string;
  timezone: string;
}>;

export interface OrganizationServiceStore {
  listActiveMembershipsForUser(
    userId: string
  ): Promise<readonly OrganizationMembershipStoreRecord[]>;
  findActiveMembershipForUser(
    userId: string,
    organizationId: string
  ): Promise<OrganizationMembershipStoreRecord | null>;
  /** Creates the organization, OWNER membership, and audit event in one transaction. */
  createOwnedOrganization(
    input: CreateOwnedOrganizationStoreInput
  ): Promise<OrganizationMembershipStoreRecord | null>;
}

export type OrganizationSessionSwitcher = (
  rawSessionToken: string,
  targetOrganizationId: string
) => Promise<ResolvedLocalSession | null>;

export type OrganizationServiceDependencies = Readonly<{
  store: OrganizationServiceStore;
  switchSessionOrganization: OrganizationSessionSwitcher;
}>;

export type OrganizationServiceDependencyOverrides = Partial<OrganizationServiceDependencies>;

export type OrganizationServiceErrorCode =
  | "INVALID_INPUT"
  | "AUTHENTICATION_REQUIRED"
  | "ORGANIZATION_SLUG_UNAVAILABLE"
  | "ORGANIZATION_ACCESS_DENIED"
  | "ORGANIZATION_OPERATION_FAILED";

const errorDefinitions = Object.freeze({
  INVALID_INPUT: { status: 400, message: "Organization details are invalid." },
  AUTHENTICATION_REQUIRED: { status: 401, message: "Authentication is required." },
  ORGANIZATION_SLUG_UNAVAILABLE: {
    status: 409,
    message: "Organization slug is unavailable."
  },
  ORGANIZATION_ACCESS_DENIED: {
    status: 403,
    message: "Organization is unavailable."
  },
  ORGANIZATION_OPERATION_FAILED: {
    status: 500,
    message: "Organization operation failed."
  }
} satisfies Record<OrganizationServiceErrorCode, { status: number; message: string }>);

export class OrganizationServiceError extends Error {
  readonly code: OrganizationServiceErrorCode;
  readonly status: number;

  constructor(code: OrganizationServiceErrorCode) {
    const definition = errorDefinitions[code];
    super(definition.message);
    this.name = "OrganizationServiceError";
    this.code = code;
    this.status = definition.status;
  }

  toJSON() {
    return { code: this.code, message: this.message };
  }
}

const organizationProjection = {
  id: true,
  name: true,
  slug: true,
  timezone: true,
  demoMode: true
} satisfies Prisma.OrganizationSelect;

const membershipProjection = {
  userId: true,
  role: true,
  status: true,
  user: { select: { disabledAt: true } },
  org: { select: organizationProjection }
} satisfies Prisma.MembershipSelect;

type ProjectedMembership = Prisma.MembershipGetPayload<{
  select: typeof membershipProjection;
}>;

const prismaOrganizationServiceStore: OrganizationServiceStore = {
  async listActiveMembershipsForUser(userId) {
    const memberships = await prisma.membership.findMany({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
        user: { disabledAt: null }
      },
      select: membershipProjection,
      orderBy: [{ org: { name: "asc" } }, { orgId: "asc" }]
    });
    return memberships.map(toOrganizationMembershipRecord);
  },

  async findActiveMembershipForUser(userId, organizationId) {
    const membership = await prisma.membership.findFirst({
      where: {
        userId,
        orgId: organizationId,
        status: MembershipStatus.ACTIVE,
        user: { disabledAt: null }
      },
      select: membershipProjection
    });
    return membership ? toOrganizationMembershipRecord(membership) : null;
  },

  async createOwnedOrganization(input) {
    return prisma.$transaction(async (transaction) => {
      const enabledUser = await transaction.appUser.findFirst({
        where: { id: input.actorUserId, disabledAt: null },
        select: { id: true }
      });
      if (!enabledUser) {
        return null;
      }

      const organization = await transaction.organization.create({
        data: {
          name: input.name,
          slug: input.slug,
          timezone: input.timezone,
          demoMode: false
        },
        select: organizationProjection
      });
      const membership = await transaction.membership.create({
        data: {
          orgId: organization.id,
          userId: enabledUser.id,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE
        },
        select: {
          userId: true,
          role: true,
          status: true
        }
      });

      await transaction.liveReadinessAuditEvent.create({
        data: {
          orgId: organization.id,
          actorUserId: enabledUser.id,
          action: "ORGANIZATION_CREATED",
          subjectType: "Organization",
          subjectId: organization.id,
          metadata: { source: "self_hosted_identity" }
        },
        select: { id: true }
      });

      return {
        userId: membership.userId,
        userDisabledAt: null,
        status: membership.status,
        role: membership.role,
        organization
      };
    });
  }
};

export async function listOrganizationsForUser(
  actor: AuthenticatedOrganizationActor,
  overrides: OrganizationServiceDependencyOverrides = {}
): Promise<readonly OrganizationMembershipSummary[]> {
  const actorUserId = readActorUserId(actor);
  const dependencies = resolveDependencies(overrides);

  try {
    const memberships = await dependencies.store.listActiveMembershipsForUser(actorUserId);
    return memberships
      .filter((membership) => membershipIsEligible(membership, actorUserId))
      .map(projectMembershipSummary);
  } catch (error) {
    throw sanitizeUnexpectedError(error);
  }
}

export async function createOrganizationForUser(
  actor: AuthenticatedOrganizationActor,
  input: unknown,
  overrides: OrganizationServiceDependencyOverrides = {}
): Promise<OrganizationMembershipSummary> {
  const actorUserId = readActorUserId(actor);
  const parsed = organizationCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrganizationServiceError("INVALID_INPUT");
  }
  const dependencies = resolveDependencies(overrides);

  try {
    const membership = await dependencies.store.createOwnedOrganization({
      actorUserId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      timezone: parsed.data.timezone
    });
    if (!membership) {
      throw new OrganizationServiceError("AUTHENTICATION_REQUIRED");
    }
    if (
      !membershipIsEligible(membership, actorUserId) ||
      membership.role !== MembershipRole.OWNER ||
      membership.organization.demoMode
    ) {
      throw new OrganizationServiceError("ORGANIZATION_OPERATION_FAILED");
    }
    return projectMembershipSummary(membership);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new OrganizationServiceError("ORGANIZATION_SLUG_UNAVAILABLE");
    }
    throw sanitizeUnexpectedError(error);
  }
}

export async function selectOrganizationForSession(
  actor: AuthenticatedOrganizationActor,
  rawSessionToken: string,
  input: unknown,
  overrides: OrganizationServiceDependencyOverrides = {}
): Promise<OrganizationMembershipSummary> {
  const actorUserId = readActorUserId(actor);
  const parsed = sessionOrganizationSelectSchema.safeParse(input);
  if (!parsed.success || !sessionTokenIsPlausible(rawSessionToken)) {
    throw new OrganizationServiceError("INVALID_INPUT");
  }
  const dependencies = resolveDependencies(overrides);

  try {
    const membership = await dependencies.store.findActiveMembershipForUser(
      actorUserId,
      parsed.data.organizationId
    );
    if (!membershipIsEligible(membership, actorUserId)) {
      throw new OrganizationServiceError("ORGANIZATION_ACCESS_DENIED");
    }

    const switched = await dependencies.switchSessionOrganization(
      rawSessionToken,
      parsed.data.organizationId
    );
    if (
      !switched ||
      switched.userId !== actorUserId ||
      switched.orgId !== parsed.data.organizationId ||
      switched.role !== membership.role
    ) {
      throw new OrganizationServiceError("ORGANIZATION_ACCESS_DENIED");
    }

    return projectMembershipSummary(membership);
  } catch (error) {
    throw sanitizeUnexpectedError(error);
  }
}

export function isOrganizationServiceError(error: unknown): error is OrganizationServiceError {
  return error instanceof OrganizationServiceError;
}

function toOrganizationMembershipRecord(membership: ProjectedMembership) {
  return {
    userId: membership.userId,
    userDisabledAt: membership.user.disabledAt,
    status: membership.status,
    role: membership.role,
    organization: membership.org
  } satisfies OrganizationMembershipStoreRecord;
}

function projectMembershipSummary(
  membership: OrganizationMembershipStoreRecord
): OrganizationMembershipSummary {
  return {
    organization: {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      timezone: membership.organization.timezone,
      demoMode: membership.organization.demoMode
    },
    role: membership.role
  };
}

function membershipIsEligible(
  membership: OrganizationMembershipStoreRecord | null,
  actorUserId: string
): membership is OrganizationMembershipStoreRecord {
  return Boolean(
    membership &&
      membership.userId === actorUserId &&
      membership.userDisabledAt === null &&
      membership.status === MembershipStatus.ACTIVE
  );
}

function resolveDependencies(
  overrides: OrganizationServiceDependencyOverrides
): OrganizationServiceDependencies {
  return {
    store: overrides.store ?? prismaOrganizationServiceStore,
    switchSessionOrganization:
      overrides.switchSessionOrganization ?? switchLocalSessionOrganization
  };
}

function readActorUserId(actor: AuthenticatedOrganizationActor) {
  if (!actor || !identifierIsValid(actor.userId)) {
    throw new OrganizationServiceError("AUTHENTICATION_REQUIRED");
  }
  return actor.userId;
}

function identifierIsValid(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= 256 && value.trim() === value
  );
}

function sessionTokenIsPlausible(value: unknown): value is string {
  return typeof value === "string" && value.length >= 32 && value.length <= 512;
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  ) || (isObject(error) && error.code === "P2002");
}

function sanitizeUnexpectedError(error: unknown): OrganizationServiceError {
  if (error instanceof OrganizationServiceError) {
    return error;
  }
  return new OrganizationServiceError("ORGANIZATION_OPERATION_FAILED");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
