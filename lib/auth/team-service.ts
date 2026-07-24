import {
  AuthTokenType,
  MembershipRole,
  MembershipStatus,
  Prisma
} from "@prisma/client";
import {
  createOpaqueToken,
  evaluatePasswordPolicy,
  hashOpaqueToken,
  hashPassword,
  safeEqualSecret,
  type OpaqueToken
} from "@/lib/auth/crypto";
import {
  setAuthTransactionContext,
  withAuthDatabaseContext,
  withTenantTransaction,
  type AuthDatabaseContext
} from "@/lib/db/tenant-context";
import {
  inviteAcceptSchema,
  teamInviteCreateSchema,
  teamMemberRoleUpdateSchema
} from "@/lib/validation/auth";
import type {
  LocalAuthenticationInput,
  LocalAuthenticationResult
} from "@/lib/auth/local-credentials";
import { enforceSeatQuota } from "@/lib/operations/entitlements";

const SERIALIZABLE_ATTEMPTS = 4;
const IDENTIFIER_MAX_CHARACTERS = 256;
const TEAM_AUDIT_SOURCE = "self_hosted_identity";

export type TeamActor = Readonly<{
  /** Values must come from the resolved server-side authentication principal. */
  userId: string;
  orgId: string;
}>;

export type TeamMemberSummary = Readonly<{
  membershipId: string;
  orgId: string;
  userId: string;
  email: string;
  displayName: string | null;
  role: MembershipRole;
  status: Extract<MembershipStatus, "ACTIVE" | "SUSPENDED">;
  userDisabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}>;

export type PendingTeamInviteSummary = Readonly<{
  inviteId: string;
  orgId: string;
  email: string;
  role: MembershipRole;
  issuedByUserId: string | null;
  expiresAt: Date;
  createdAt: Date;
}>;

export type TeamRoster = Readonly<{
  members: readonly TeamMemberSummary[];
  pendingInvites: readonly PendingTeamInviteSummary[];
}>;

export type CreatedTeamInvite = Readonly<{
  invite: PendingTeamInviteSummary;
  /** The only service result that contains raw bearer material. */
  token: string;
}>;

export type AcceptedTeamInvite = Readonly<{
  member: TeamMemberSummary;
  accountCreated: boolean;
  /** Non-null only when the route must create a fresh local session. */
  sessionAuthVersion: number | null;
}>;

export type TeamStoreFailureReason =
  | "ACTOR_DENIED"
  | "ROLE_DENIED"
  | "RESOURCE_UNAVAILABLE"
  | "CONFLICT"
  | "FINAL_OWNER"
  | "INVITE_UNAVAILABLE"
  | "INVITE_AUTHENTICATION_REQUIRED";

export type TeamStoreResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; reason: TeamStoreFailureReason }>;

export type CreateTeamInviteStoreInput = Readonly<{
  actor: TeamActor;
  normalizedEmail: string;
  role: MembershipRole;
  tokenHash: string;
  expiresAt: Date;
  now: Date;
}>;

export type RevokeTeamInviteStoreInput = Readonly<{
  actor: TeamActor;
  inviteId: string;
  now: Date;
}>;

export type AcceptTeamInviteStoreInput = Readonly<{
  tokenHash: string;
  authenticatedUserId: string | null;
  existingAccount: Readonly<{
    userId: string;
    expectedAuthVersion: number;
  }> | null;
  newAccount: Readonly<{
    displayName: string;
    passwordHash: string;
  }> | null;
  now: Date;
}>;

export type TeamMemberMutationStoreInput = Readonly<{
  actor: TeamActor;
  targetUserId: string;
  now: Date;
}>;

export type UpdateTeamMemberRoleStoreInput = TeamMemberMutationStoreInput &
  Readonly<{ role: MembershipRole }>;

export interface TeamServiceStore {
  inviteAvailable(tokenHash: string, now: Date): Promise<boolean>;
  listTeam(actor: TeamActor, now: Date): Promise<TeamStoreResult<TeamRoster>>;
  createInvite(
    input: CreateTeamInviteStoreInput
  ): Promise<TeamStoreResult<PendingTeamInviteSummary>>;
  revokeInvite(
    input: RevokeTeamInviteStoreInput
  ): Promise<TeamStoreResult<Readonly<{ inviteId: string; revokedAt: Date }>>>;
  acceptInvite(
    input: AcceptTeamInviteStoreInput
  ): Promise<TeamStoreResult<AcceptedTeamInvite>>;
  updateMemberRole(
    input: UpdateTeamMemberRoleStoreInput
  ): Promise<TeamStoreResult<TeamMemberSummary>>;
  suspendMember(
    input: TeamMemberMutationStoreInput
  ): Promise<TeamStoreResult<TeamMemberSummary>>;
  reactivateMember(
    input: TeamMemberMutationStoreInput
  ): Promise<TeamStoreResult<TeamMemberSummary>>;
  revokeMember(
    input: TeamMemberMutationStoreInput
  ): Promise<TeamStoreResult<Readonly<{ userId: string; revokedAt: Date }>>>;
}

export type TeamServiceDependencies = Readonly<{
  store: TeamServiceStore;
  now: () => Date;
  createInviteToken: () => OpaqueToken;
  encodePassword: (password: string) => Promise<string>;
  authenticateExistingAccount(
    input: LocalAuthenticationInput
  ): Promise<LocalAuthenticationResult>;
}>;

export type TeamServiceDependencyOverrides = Partial<TeamServiceDependencies>;

export type TeamServiceErrorCode =
  | "INVALID_INPUT"
  | "AUTHENTICATION_REQUIRED"
  | "TEAM_ACCESS_DENIED"
  | "TEAM_ROLE_FORBIDDEN"
  | "TEAM_RESOURCE_UNAVAILABLE"
  | "TEAM_CONFLICT"
  | "FINAL_OWNER_REQUIRED"
  | "INVITE_UNAVAILABLE"
  | "INVITE_AUTHENTICATION_REQUIRED"
  | "TEAM_OPERATION_FAILED";

const errorDefinitions = Object.freeze({
  INVALID_INPUT: { status: 400, message: "Team operation input is invalid." },
  AUTHENTICATION_REQUIRED: { status: 401, message: "Authentication is required." },
  TEAM_ACCESS_DENIED: { status: 403, message: "Team access is denied." },
  TEAM_ROLE_FORBIDDEN: { status: 403, message: "The requested team role operation is not allowed." },
  TEAM_RESOURCE_UNAVAILABLE: { status: 404, message: "The team resource is unavailable." },
  TEAM_CONFLICT: { status: 409, message: "The team operation conflicts with current state." },
  FINAL_OWNER_REQUIRED: { status: 409, message: "The organization must retain an active owner." },
  INVITE_UNAVAILABLE: { status: 400, message: "The invitation is unavailable." },
  INVITE_AUTHENTICATION_REQUIRED: {
    status: 401,
    message: "Sign in with the invited account to continue."
  },
  TEAM_OPERATION_FAILED: { status: 500, message: "Team operation failed." }
} satisfies Record<TeamServiceErrorCode, { status: number; message: string }>);

export class TeamServiceError extends Error {
  readonly code: TeamServiceErrorCode;
  readonly status: number;

  constructor(code: TeamServiceErrorCode) {
    const definition = errorDefinitions[code];
    super(definition.message);
    this.name = "TeamServiceError";
    this.code = code;
    this.status = definition.status;
  }

  toJSON() {
    return { code: this.code, message: this.message };
  }
}

const memberProjection = {
  id: true,
  orgId: true,
  userId: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      email: true,
      displayName: true,
      disabledAt: true
    }
  }
} satisfies Prisma.MembershipSelect;

const inviteProjection = {
  id: true,
  orgId: true,
  email: true,
  role: true,
  issuedByUserId: true,
  expiresAt: true,
  createdAt: true
} satisfies Prisma.AuthTokenSelect;

type ProjectedMember = Prisma.MembershipGetPayload<{ select: typeof memberProjection }>;
type ProjectedInvite = Prisma.AuthTokenGetPayload<{ select: typeof inviteProjection }>;

export const prismaTeamServiceStore: TeamServiceStore = {
  async inviteAvailable(tokenHash, now) {
    const invite = await withAuthDatabaseContext({ tokenHash, purpose: "invite" }, (client) =>
      client.authToken.findFirst({
        where: {
          tokenHash,
          type: AuthTokenType.INVITE,
          orgId: { not: null },
          email: { not: null },
          role: { not: null },
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: now }
        },
        select: { orgId: true, role: true, issuedByUserId: true }
      })
    );
    if (!invite?.orgId || !invite.role || !invite.issuedByUserId) {
      return false;
    }
    const issuerMembership = await withTenantTransaction(
      { orgId: invite.orgId, userId: invite.issuedByUserId },
      (client) => client.membership.findUnique({
        where: {
          orgId_userId: { orgId: invite.orgId!, userId: invite.issuedByUserId! }
        },
        select: {
          role: true,
          status: true,
          user: { select: { disabledAt: true } }
        }
      })
    );
    return Boolean(
      issuerMembership?.status === MembershipStatus.ACTIVE &&
        !issuerMembership.user.disabledAt &&
        canGrantTeamRole(issuerMembership.role, invite.role)
    );
  },

  async listTeam(actor, now) {
    return withTenantTransaction(actor, async (transaction) => {
      const actorRole = await findEligibleActorRole(transaction, actor);
      if (!actorRole) {
        return failure("ACTOR_DENIED");
      }
      if (actorRole === MembershipRole.MEMBER) {
        return failure("ROLE_DENIED");
      }

      const [members, pendingInvites] = await Promise.all([
        transaction.membership.findMany({
          where: {
            orgId: actor.orgId,
            status: { in: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED] }
          },
          select: memberProjection,
          orderBy: [{ role: "asc" }, { createdAt: "asc" }, { id: "asc" }]
        }),
        transaction.authToken.findMany({
          where: {
            type: AuthTokenType.INVITE,
            orgId: actor.orgId,
            consumedAt: null,
            revokedAt: null,
            expiresAt: { gt: now }
          },
          select: inviteProjection,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }]
        })
      ]);

      return success({
        members: members.map(toMemberSummary),
        pendingInvites: pendingInvites.map(toInviteSummary)
      });
    });
  },

  async createInvite(input) {
    return runTenantSerializable(input.actor, async (transaction) => {
      await lockOrganization(transaction, input.actor.orgId);
      const actorRole = await findEligibleActorRole(transaction, input.actor);
      if (!actorRole) {
        return failure("ACTOR_DENIED");
      }
      if (!canGrantTeamRole(actorRole, input.role)) {
        return failure("ROLE_DENIED");
      }

      try {
        await enforceSeatQuota(transaction, input.actor.orgId);
      } catch {
        return failure("CONFLICT");
      }

      const [existingMembership, existingInvite] = await Promise.all([
        transaction.membership.findFirst({
          where: {
            orgId: input.actor.orgId,
            user: { normalizedEmail: input.normalizedEmail }
          },
          select: { id: true }
        }),
        transaction.authToken.findFirst({
          where: {
            type: AuthTokenType.INVITE,
            orgId: input.actor.orgId,
            email: input.normalizedEmail,
            consumedAt: null,
            revokedAt: null,
            expiresAt: { gt: input.now }
          },
          select: { id: true }
        })
      ]);
      if (existingMembership || existingInvite) {
        return failure("CONFLICT");
      }

      const invite = await transaction.authToken.create({
        data: {
          type: AuthTokenType.INVITE,
          tokenHash: input.tokenHash,
          orgId: input.actor.orgId,
          email: input.normalizedEmail,
          role: input.role,
          issuedByUserId: input.actor.userId,
          expiresAt: input.expiresAt
        },
        select: inviteProjection
      });
      await createTeamAuditEvent(transaction, {
        orgId: input.actor.orgId,
        actorUserId: input.actor.userId,
        action: "TEAM_INVITE_CREATED",
        subjectType: "AuthToken",
        subjectId: invite.id,
        metadata: { role: input.role }
      });
      return success(toInviteSummary(invite));
    });
  },

  async revokeInvite(input) {
    return runTenantSerializable(input.actor, async (transaction) => {
      await lockOrganization(transaction, input.actor.orgId);
      const actorRole = await findEligibleActorRole(transaction, input.actor);
      if (!actorRole) {
        return failure("ACTOR_DENIED");
      }

      const invite = await transaction.authToken.findFirst({
        where: {
          id: input.inviteId,
          type: AuthTokenType.INVITE,
          orgId: input.actor.orgId
        },
        select: {
          id: true,
          role: true,
          createdAt: true,
          expiresAt: true,
          consumedAt: true,
          revokedAt: true
        }
      });
      if (
        !invite?.role ||
        invite.consumedAt ||
        invite.revokedAt ||
        invite.expiresAt.getTime() <= input.now.getTime()
      ) {
        return failure("RESOURCE_UNAVAILABLE");
      }
      if (!canManageTeamRole(actorRole, invite.role)) {
        return failure("ROLE_DENIED");
      }

      const revokedAt = laterDate(input.now, invite.createdAt);
      await transaction.authToken.update({
        where: { id: invite.id },
        data: { revokedAt }
      });
      await createTeamAuditEvent(transaction, {
        orgId: input.actor.orgId,
        actorUserId: input.actor.userId,
        action: "TEAM_INVITE_REVOKED",
        subjectType: "AuthToken",
        subjectId: invite.id,
        metadata: { role: invite.role }
      });
      return success({ inviteId: invite.id, revokedAt });
    });
  },

  async acceptInvite(input) {
    try {
      return await runAuthSerializable(
        { tokenHash: input.tokenHash, purpose: "invite" },
        async (transaction) => {
        await lockInviteToken(transaction, input.tokenHash);
        const invite = await transaction.authToken.findUnique({
          where: { tokenHash: input.tokenHash },
          select: {
            id: true,
            type: true,
            orgId: true,
            email: true,
            role: true,
            issuedByUserId: true,
            createdAt: true,
            expiresAt: true,
            consumedAt: true,
            revokedAt: true
          }
        });
        if (
          !invite ||
          invite.type !== AuthTokenType.INVITE ||
          !invite.orgId ||
          !invite.email ||
          !invite.role ||
          !invite.issuedByUserId ||
          invite.consumedAt ||
          invite.revokedAt ||
          invite.expiresAt.getTime() <= input.now.getTime()
        ) {
          return failure("INVITE_UNAVAILABLE");
        }
        const authenticationModeCount =
          Number(Boolean(input.authenticatedUserId)) +
          Number(Boolean(input.existingAccount)) +
          Number(Boolean(input.newAccount));
        if (authenticationModeCount !== 1) {
          return failure("INVITE_UNAVAILABLE");
        }

        await setAuthTransactionContext(transaction, {
          orgId: invite.orgId,
          userId: invite.issuedByUserId,
          tokenHash: input.tokenHash,
          loginEmail: invite.email,
          purpose: "invite"
        });
        const acceptedAt = laterDate(input.now, invite.createdAt);
        await lockOrganization(transaction, invite.orgId);
        const issuerRole = await findEligibleActorRole(transaction, {
          userId: invite.issuedByUserId,
          orgId: invite.orgId
        });
        if (!issuerRole || !canGrantTeamRole(issuerRole, invite.role)) {
          return failure("INVITE_UNAVAILABLE");
        }
        let user: Readonly<{
          id: string;
          normalizedEmail: string;
          authVersion: number;
        }>;
        let accountCreated = false;
        let sessionAuthVersion: number | null = null;

        if (input.authenticatedUserId) {
          const authenticatedUser = await transaction.appUser.findUnique({
            where: { id: input.authenticatedUserId },
            select: {
              id: true,
              normalizedEmail: true,
              disabledAt: true,
              authVersion: true
            }
          });
          if (
            !authenticatedUser ||
            authenticatedUser.disabledAt ||
            authenticatedUser.normalizedEmail !== invite.email
          ) {
            return failure("INVITE_UNAVAILABLE");
          }
          user = authenticatedUser;
        } else if (input.existingAccount) {
          const provenUserId = readIdentifier(input.existingAccount.userId);
          if (
            !provenUserId ||
            !Number.isSafeInteger(input.existingAccount.expectedAuthVersion) ||
            input.existingAccount.expectedAuthVersion < 1
          ) {
            return failure("INVITE_UNAVAILABLE");
          }
          await lockLocalAuthUser(transaction, provenUserId);
          const provenUser = await transaction.appUser.findUnique({
            where: { id: provenUserId },
            select: {
              id: true,
              normalizedEmail: true,
              disabledAt: true,
              authVersion: true
            }
          });
          if (
            !provenUser ||
            provenUser.disabledAt ||
            provenUser.normalizedEmail !== invite.email ||
            provenUser.authVersion !== input.existingAccount.expectedAuthVersion
          ) {
            return failure("INVITE_UNAVAILABLE");
          }
          user = provenUser;
          sessionAuthVersion = provenUser.authVersion;
        } else {
          if (!input.newAccount) {
            return failure("INVITE_UNAVAILABLE");
          }
          const existingUser = await transaction.appUser.findUnique({
            where: { normalizedEmail: invite.email },
            select: { id: true }
          });
          if (existingUser) {
            return failure("INVITE_AUTHENTICATION_REQUIRED");
          }
          user = await transaction.appUser.create({
            data: {
              email: invite.email,
              normalizedEmail: invite.email,
              displayName: input.newAccount.displayName
            },
            select: { id: true, normalizedEmail: true, authVersion: true }
          });
          await transaction.localCredential.create({
            data: {
              userId: user.id,
              passwordHash: input.newAccount.passwordHash,
              passwordChangedAt: acceptedAt
            },
            select: { id: true }
          });
          accountCreated = true;
          sessionAuthVersion = user.authVersion;
        }

        await setAuthTransactionContext(transaction, {
          orgId: invite.orgId,
          userId: user.id,
          tokenHash: input.tokenHash,
          loginEmail: invite.email,
          purpose: "invite"
        });

        const existingMembership = await transaction.membership.findUnique({
          where: { orgId_userId: { orgId: invite.orgId, userId: user.id } },
          select: { id: true }
        });
        if (existingMembership) {
          return failure("INVITE_UNAVAILABLE");
        }
        const membership = await transaction.membership.create({
          data: {
            orgId: invite.orgId,
            userId: user.id,
            role: invite.role,
            status: MembershipStatus.ACTIVE
          },
          select: memberProjection
        });

        await transaction.authToken.update({
          where: { id: invite.id },
          data: { consumedAt: acceptedAt, userId: user.id },
          select: { id: true }
        });
        await createTeamAuditEvent(transaction, {
          orgId: invite.orgId,
          actorUserId: user.id,
          action: "TEAM_INVITE_ACCEPTED",
          subjectType: "Membership",
          subjectId: membership.id,
          metadata: { role: invite.role, accountCreated }
        });
        return success({
          member: toMemberSummary(membership),
          accountCreated,
          sessionAuthVersion
        });
        }
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return failure("INVITE_AUTHENTICATION_REQUIRED");
      }
      throw error;
    }
  },

  updateMemberRole(input) {
    return mutateMember(input, "ROLE_UPDATED");
  },

  suspendMember(input) {
    return mutateMember(input, "SUSPENDED");
  },

  reactivateMember(input) {
    return mutateMember(input, "REACTIVATED");
  },

  async revokeMember(input) {
    const result = await mutateMember(input, "REVOKED");
    if (!result.ok) {
      return result;
    }
    return success({ userId: result.value.userId, revokedAt: input.now });
  }
};

export async function listTeam(
  actor: TeamActor,
  overrides: TeamServiceDependencyOverrides = {}
): Promise<TeamRoster> {
  const normalizedActor = readActor(actor);
  const dependencies = resolveDependencies(overrides);
  try {
    const result = await dependencies.store.listTeam(normalizedActor, dependencies.now());
    const value = unwrapStoreResult(result);
    return Object.freeze({
      members: Object.freeze(
        value.members
          .filter((member) => member.orgId === normalizedActor.orgId)
          .map(sanitizeMember)
      ),
      pendingInvites: Object.freeze(
        value.pendingInvites
          .filter((invite) => invite.orgId === normalizedActor.orgId)
          .map(sanitizeInvite)
      )
    });
  } catch (error) {
    throw sanitizeUnexpectedError(error);
  }
}

export async function createTeamInvite(
  actor: TeamActor,
  input: unknown,
  overrides: TeamServiceDependencyOverrides = {}
): Promise<CreatedTeamInvite> {
  const normalizedActor = readActor(actor);
  const parsed = teamInviteCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new TeamServiceError("INVALID_INPUT");
  }
  const dependencies = resolveDependencies(overrides);
  const now = dependencies.now();
  const expiresAt = new Date(now.getTime() + parsed.data.expiresInHours * 60 * 60 * 1_000);

  try {
    const opaqueToken = dependencies.createInviteToken();
    if (
      !safeEqualSecret(hashOpaqueToken(opaqueToken.token), opaqueToken.tokenHash)
    ) {
      throw new TeamServiceError("TEAM_OPERATION_FAILED");
    }
    const result = await dependencies.store.createInvite({
      actor: normalizedActor,
      normalizedEmail: parsed.data.email,
      role: parsed.data.role,
      tokenHash: opaqueToken.tokenHash,
      expiresAt,
      now
    });
    const invite = unwrapStoreResult(result);
    if (
      invite.orgId !== normalizedActor.orgId ||
      invite.email !== parsed.data.email ||
      invite.role !== parsed.data.role
    ) {
      throw new TeamServiceError("TEAM_OPERATION_FAILED");
    }
    return Object.freeze({ invite: sanitizeInvite(invite), token: opaqueToken.token });
  } catch (error) {
    throw sanitizeUnexpectedError(error);
  }
}

export async function revokeTeamInvite(
  actor: TeamActor,
  inviteId: unknown,
  overrides: TeamServiceDependencyOverrides = {}
) {
  const normalizedActor = readActor(actor);
  const normalizedInviteId = readIdentifier(inviteId);
  if (!normalizedInviteId) {
    throw new TeamServiceError("INVALID_INPUT");
  }
  const dependencies = resolveDependencies(overrides);
  try {
    const result = await dependencies.store.revokeInvite({
      actor: normalizedActor,
      inviteId: normalizedInviteId,
      now: dependencies.now()
    });
    const value = unwrapStoreResult(result);
    return Object.freeze({ inviteId: value.inviteId, revokedAt: value.revokedAt });
  } catch (error) {
    throw sanitizeUnexpectedError(error);
  }
}

export async function acceptTeamInvite(
  authentication: Readonly<{ userId?: string | null }> | null,
  input: unknown,
  overrides: TeamServiceDependencyOverrides = {}
): Promise<AcceptedTeamInvite> {
  const parsed = inviteAcceptSchema.safeParse(input);
  if (!parsed.success) {
    throw new TeamServiceError("INVALID_INPUT");
  }
  const authenticatedUserId =
    authentication?.userId === null || authentication?.userId === undefined
      ? null
      : readIdentifier(authentication.userId);
  if (authentication?.userId && !authenticatedUserId) {
    throw new TeamServiceError("AUTHENTICATION_REQUIRED");
  }
  const newAccountInput = "displayName" in parsed.data ? parsed.data : null;
  const existingAccountInput = "email" in parsed.data ? parsed.data : null;
  const requestsNewAccount = newAccountInput !== null;
  const requestsExistingAccount = existingAccountInput !== null;
  if (
    (authenticatedUserId !== null && (requestsNewAccount || requestsExistingAccount)) ||
    (authenticatedUserId === null && !requestsNewAccount && !requestsExistingAccount)
  ) {
    throw new TeamServiceError("INVALID_INPUT");
  }
  if (
    requestsNewAccount &&
    !evaluatePasswordPolicy(newAccountInput.password).valid
  ) {
    throw new TeamServiceError("INVALID_INPUT");
  }

  let tokenHash: string;
  try {
    tokenHash = hashOpaqueToken(parsed.data.token);
  } catch {
    throw new TeamServiceError("INVALID_INPUT");
  }
  const dependencies = resolveDependencies(overrides);
  const preflightAt = dependencies.now();
  let inviteAvailable = false;
  try {
    inviteAvailable = await dependencies.store.inviteAvailable(tokenHash, preflightAt);
  } catch {
    throw new TeamServiceError("TEAM_OPERATION_FAILED");
  }
  if (!inviteAvailable) {
    throw new TeamServiceError("INVITE_UNAVAILABLE");
  }
  let passwordHash: string | null = null;
  if (requestsNewAccount) {
    try {
      passwordHash = await dependencies.encodePassword(newAccountInput!.password);
    } catch {
      throw new TeamServiceError("INVALID_INPUT");
    }
  }
  let existingAccount: AcceptTeamInviteStoreInput["existingAccount"] = null;
  if (requestsExistingAccount) {
    let authenticationResult: LocalAuthenticationResult;
    try {
      authenticationResult = await dependencies.authenticateExistingAccount({
        email: existingAccountInput!.email,
        password: existingAccountInput!.password
      });
    } catch {
      throw new TeamServiceError("TEAM_OPERATION_FAILED");
    }
    if (!authenticationResult.authenticated) {
      throw new TeamServiceError("INVITE_AUTHENTICATION_REQUIRED");
    }
    existingAccount = {
      userId: authenticationResult.user.id,
      expectedAuthVersion: authenticationResult.user.authVersion
    };
  }

  try {
    const acceptanceAt = dependencies.now();
    const result = await dependencies.store.acceptInvite({
      tokenHash,
      authenticatedUserId,
      existingAccount,
      newAccount: requestsNewAccount
        ? {
            displayName: newAccountInput!.displayName,
            passwordHash: passwordHash!
          }
        : null,
      now: acceptanceAt
    });
    const accepted = unwrapStoreResult(result);
    if (
      accepted.sessionAuthVersion !== null &&
      (!Number.isSafeInteger(accepted.sessionAuthVersion) || accepted.sessionAuthVersion < 1)
    ) {
      throw new TeamServiceError("TEAM_OPERATION_FAILED");
    }
    return Object.freeze({
      member: sanitizeMember(accepted.member),
      accountCreated: accepted.accountCreated,
      sessionAuthVersion: accepted.sessionAuthVersion
    });
  } catch (error) {
    throw sanitizeUnexpectedError(error);
  }
}

export async function updateTeamMemberRole(
  actor: TeamActor,
  targetUserId: unknown,
  input: unknown,
  overrides: TeamServiceDependencyOverrides = {}
): Promise<TeamMemberSummary> {
  const normalizedActor = readActor(actor);
  const normalizedTargetUserId = readIdentifier(targetUserId);
  const parsed = teamMemberRoleUpdateSchema.safeParse(input);
  if (!normalizedTargetUserId || !parsed.success) {
    throw new TeamServiceError("INVALID_INPUT");
  }
  return performMemberMutation(
    dependenciesFor(overrides),
    "updateMemberRole",
    {
      actor: normalizedActor,
      targetUserId: normalizedTargetUserId,
      role: parsed.data.role
    }
  );
}

export async function suspendTeamMember(
  actor: TeamActor,
  targetUserId: unknown,
  overrides: TeamServiceDependencyOverrides = {}
) {
  return performSimpleMemberMutation(actor, targetUserId, "suspendMember", overrides);
}

export async function reactivateTeamMember(
  actor: TeamActor,
  targetUserId: unknown,
  overrides: TeamServiceDependencyOverrides = {}
) {
  return performSimpleMemberMutation(actor, targetUserId, "reactivateMember", overrides);
}

export async function revokeTeamMember(
  actor: TeamActor,
  targetUserId: unknown,
  overrides: TeamServiceDependencyOverrides = {}
) {
  const normalizedActor = readActor(actor);
  const normalizedTargetUserId = readIdentifier(targetUserId);
  if (!normalizedTargetUserId) {
    throw new TeamServiceError("INVALID_INPUT");
  }
  const dependencies = resolveDependencies(overrides);
  try {
    const result = await dependencies.store.revokeMember({
      actor: normalizedActor,
      targetUserId: normalizedTargetUserId,
      now: dependencies.now()
    });
    const value = unwrapStoreResult(result);
    return Object.freeze({ userId: value.userId, revokedAt: value.revokedAt });
  } catch (error) {
    throw sanitizeUnexpectedError(error);
  }
}

export function canGrantTeamRole(actorRole: MembershipRole, intendedRole: MembershipRole) {
  return (
    actorRole === MembershipRole.OWNER ||
    (actorRole === MembershipRole.ADMIN && intendedRole !== MembershipRole.OWNER)
  );
}

export function canManageTeamRole(actorRole: MembershipRole, targetRole: MembershipRole) {
  return (
    actorRole === MembershipRole.OWNER ||
    (actorRole === MembershipRole.ADMIN && targetRole !== MembershipRole.OWNER)
  );
}

export function isTeamServiceError(error: unknown): error is TeamServiceError {
  return error instanceof TeamServiceError;
}

type MemberMutationKind = "ROLE_UPDATED" | "SUSPENDED" | "REACTIVATED" | "REVOKED";

async function mutateMember(
  input: UpdateTeamMemberRoleStoreInput | TeamMemberMutationStoreInput,
  kind: MemberMutationKind
): Promise<TeamStoreResult<TeamMemberSummary>> {
  return runTenantSerializable(input.actor, async (transaction) => {
    await lockOrganization(transaction, input.actor.orgId);
    const actorRole = await findEligibleActorRole(transaction, input.actor);
    if (!actorRole) {
      return failure("ACTOR_DENIED");
    }

    const target = await transaction.membership.findUnique({
      where: {
        orgId_userId: { orgId: input.actor.orgId, userId: input.targetUserId }
      },
      select: memberProjection
    });
    if (
      !target ||
      (target.status !== MembershipStatus.ACTIVE &&
        target.status !== MembershipStatus.SUSPENDED)
    ) {
      return failure("RESOURCE_UNAVAILABLE");
    }
    if (!canManageTeamRole(actorRole, target.role)) {
      return failure("ROLE_DENIED");
    }

    const requestedRole =
      kind === "ROLE_UPDATED"
        ? (input as UpdateTeamMemberRoleStoreInput).role
        : target.role;
    if (kind === "ROLE_UPDATED" && !canGrantTeamRole(actorRole, requestedRole)) {
      return failure("ROLE_DENIED");
    }
    if (kind === "SUSPENDED" && target.status !== MembershipStatus.ACTIVE) {
      return failure("CONFLICT");
    }
    if (kind === "REACTIVATED") {
      if (target.status !== MembershipStatus.SUSPENDED) {
        return failure("CONFLICT");
      }
      if (target.user.disabledAt) {
        return failure("RESOURCE_UNAVAILABLE");
      }
    }

    const removesActiveOwner =
      target.role === MembershipRole.OWNER &&
      target.status === MembershipStatus.ACTIVE &&
      target.user.disabledAt === null &&
      ((kind === "ROLE_UPDATED" && requestedRole !== MembershipRole.OWNER) ||
        kind === "SUSPENDED" ||
        kind === "REVOKED");
    if (removesActiveOwner && (await countActiveOwners(transaction, input.actor.orgId)) <= 1) {
      return failure("FINAL_OWNER");
    }

    const auditMetadata: Record<string, unknown> = { role: target.role };
    if (kind !== "REACTIVATED") {
      // Revoke issuer authority while the membership still exists. The tenant-integrity triggers
      // validate historical audit/token references at write time without preventing hard deletion.
      auditMetadata.revokedPendingInviteCount = await revokePendingInvitesIssuedBy(
        transaction,
        input.actor.orgId,
        input.targetUserId,
        input.now
      );
    }

    let auditCreatedBeforeMembershipDelete = false;
    let result: ProjectedMember;
    if (kind === "ROLE_UPDATED") {
      result = await transaction.membership.update({
        where: { id: target.id },
        data: { role: requestedRole },
        select: memberProjection
      });
      auditMetadata.previousRole = target.role;
      auditMetadata.role = requestedRole;
    } else if (kind === "SUSPENDED") {
      result = await transaction.membership.update({
        where: { id: target.id },
        data: { status: MembershipStatus.SUSPENDED },
        select: memberProjection
      });
      await revokeOrganizationSessions(
        transaction,
        input.actor.orgId,
        input.targetUserId,
        input.now
      );
    } else if (kind === "REACTIVATED") {
      result = await transaction.membership.update({
        where: { id: target.id },
        data: { status: MembershipStatus.ACTIVE },
        select: memberProjection
      });
    } else {
      result = target;
      await revokeOrganizationSessions(
        transaction,
        input.actor.orgId,
        input.targetUserId,
        input.now
      );
      await createTeamAuditEvent(transaction, {
        orgId: input.actor.orgId,
        actorUserId: input.actor.userId,
        action: `TEAM_MEMBER_${kind}`,
        subjectType: "Membership",
        subjectId: target.id,
        metadata: auditMetadata
      });
      auditCreatedBeforeMembershipDelete = true;
      await transaction.membership.delete({ where: { id: target.id }, select: { id: true } });
    }

    if (!auditCreatedBeforeMembershipDelete) {
      await createTeamAuditEvent(transaction, {
        orgId: input.actor.orgId,
        actorUserId: input.actor.userId,
        action: `TEAM_MEMBER_${kind}`,
        subjectType: "Membership",
        subjectId: target.id,
        metadata: auditMetadata
      });
    }
    return success(toMemberSummary(result));
  });
}

async function performSimpleMemberMutation(
  actor: TeamActor,
  targetUserId: unknown,
  method: "suspendMember" | "reactivateMember",
  overrides: TeamServiceDependencyOverrides
) {
  const normalizedActor = readActor(actor);
  const normalizedTargetUserId = readIdentifier(targetUserId);
  if (!normalizedTargetUserId) {
    throw new TeamServiceError("INVALID_INPUT");
  }
  return performMemberMutation(dependenciesFor(overrides), method, {
    actor: normalizedActor,
    targetUserId: normalizedTargetUserId
  });
}

function dependenciesFor(overrides: TeamServiceDependencyOverrides) {
  return resolveDependencies(overrides);
}

async function performMemberMutation(
  dependencies: TeamServiceDependencies,
  method: "updateMemberRole" | "suspendMember" | "reactivateMember",
  input: Omit<UpdateTeamMemberRoleStoreInput, "now"> | Omit<TeamMemberMutationStoreInput, "now">
) {
  try {
    const result = await dependencies.store[method]({
      ...input,
      now: dependencies.now()
    } as UpdateTeamMemberRoleStoreInput);
    return sanitizeMember(unwrapStoreResult(result));
  } catch (error) {
    throw sanitizeUnexpectedError(error);
  }
}

function resolveDependencies(
  overrides: TeamServiceDependencyOverrides
): TeamServiceDependencies {
  return {
    store: overrides.store ?? prismaTeamServiceStore,
    now: overrides.now ?? (() => new Date()),
    createInviteToken: overrides.createInviteToken ?? (() => createOpaqueToken("invite")),
    encodePassword: overrides.encodePassword ?? hashPassword,
    authenticateExistingAccount:
      overrides.authenticateExistingAccount ??
      (async (input) => {
        const { createPrismaLocalCredentialService } = await import(
          "@/lib/auth/local-credential-store"
        );
        const credentials = await createPrismaLocalCredentialService();
        return credentials.authenticate(input);
      })
  };
}

async function findEligibleActorRole(
  transaction: Prisma.TransactionClient,
  actor: TeamActor
) {
  const membership = await transaction.membership.findUnique({
    where: { orgId_userId: { orgId: actor.orgId, userId: actor.userId } },
    select: { role: true, status: true, user: { select: { disabledAt: true } } }
  });
  return membership?.status === MembershipStatus.ACTIVE && !membership.user.disabledAt
    ? membership.role
    : null;
}

async function countActiveOwners(
  transaction: Prisma.TransactionClient,
  orgId: string
) {
  return transaction.membership.count({
    where: {
      orgId,
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,
      user: { disabledAt: null }
    }
  });
}

async function revokeOrganizationSessions(
  transaction: Prisma.TransactionClient,
  orgId: string,
  userId: string,
  revokedAt: Date
) {
  await transaction.$executeRaw`
    UPDATE "AuthSession"
    SET "revokedAt" = GREATEST(${revokedAt}, "createdAt")
    WHERE "orgId" = ${orgId}
      AND "userId" = ${userId}
      AND "revokedAt" IS NULL
  `;
}

async function revokePendingInvitesIssuedBy(
  transaction: Prisma.TransactionClient,
  orgId: string,
  issuedByUserId: string,
  revokedAt: Date
) {
  return transaction.$executeRaw`
    UPDATE "AuthToken"
    SET "revokedAt" = GREATEST(${revokedAt}, "createdAt")
    WHERE "type" = 'INVITE'::"AuthTokenType"
      AND "orgId" = ${orgId}
      AND "issuedByUserId" = ${issuedByUserId}
      AND "consumedAt" IS NULL
      AND "revokedAt" IS NULL
      AND "expiresAt" > ${revokedAt}
  `;
}

async function lockOrganization(transaction: Prisma.TransactionClient, orgId: string) {
  await transaction.$queryRaw`
    SELECT TRUE AS "locked"
    FROM (SELECT pg_advisory_xact_lock(hashtextextended(${orgId}, 731))) AS acquired
  `;
}

async function lockInviteToken(
  transaction: Prisma.TransactionClient,
  tokenHash: string
) {
  await transaction.$queryRaw`
    SELECT TRUE AS "locked"
    FROM (SELECT pg_advisory_xact_lock(hashtextextended(${tokenHash}, 732))) AS acquired
  `;
}

async function lockLocalAuthUser(
  transaction: Prisma.TransactionClient,
  userId: string
) {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 742))::text
  `;
}

async function createTeamAuditEvent(
  transaction: Prisma.TransactionClient,
  input: Readonly<{
    orgId: string;
    actorUserId: string;
    action: string;
    subjectType: string;
    subjectId: string;
    metadata: Record<string, unknown>;
  }>
) {
  await transaction.liveReadinessAuditEvent.create({
    data: {
      orgId: input.orgId,
      actorUserId: input.actorUserId,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      metadata: { source: TEAM_AUDIT_SOURCE, ...input.metadata }
    },
    select: { id: true }
  });
}

async function runTenantSerializable<T>(
  context: TeamActor,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return runSerializableAttempt(() =>
    withTenantTransaction(context, operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    })
  );
}

async function runAuthSerializable<T>(
  context: AuthDatabaseContext,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return runSerializableAttempt(() =>
    withAuthDatabaseContext(context, operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    })
  );
}

async function runSerializableAttempt<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isSerializableConflict(error) || attempt === SERIALIZABLE_ATTEMPTS - 1) {
        throw error;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, (attempt + 1) * 5));
    }
  }
  throw new Error("Serializable transaction retry was exhausted.");
}

function toMemberSummary(member: ProjectedMember): TeamMemberSummary {
  if (
    member.status !== MembershipStatus.ACTIVE &&
    member.status !== MembershipStatus.SUSPENDED
  ) {
    throw new Error("Unsupported team membership status.");
  }
  return {
    membershipId: member.id,
    orgId: member.orgId,
    userId: member.userId,
    email: member.user.email,
    displayName: member.user.displayName,
    role: member.role,
    status: member.status,
    userDisabled: member.user.disabledAt !== null,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt
  };
}

function toInviteSummary(invite: ProjectedInvite): PendingTeamInviteSummary {
  if (!invite.orgId || !invite.email || !invite.role) {
    throw new Error("Invalid invitation projection.");
  }
  return {
    inviteId: invite.id,
    orgId: invite.orgId,
    email: invite.email,
    role: invite.role,
    issuedByUserId: invite.issuedByUserId,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt
  };
}

function sanitizeMember(member: TeamMemberSummary): TeamMemberSummary {
  return Object.freeze({
    membershipId: member.membershipId,
    orgId: member.orgId,
    userId: member.userId,
    email: member.email,
    displayName: member.displayName,
    role: member.role,
    status: member.status,
    userDisabled: member.userDisabled,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt
  });
}

function sanitizeInvite(invite: PendingTeamInviteSummary): PendingTeamInviteSummary {
  return Object.freeze({
    inviteId: invite.inviteId,
    orgId: invite.orgId,
    email: invite.email,
    role: invite.role,
    issuedByUserId: invite.issuedByUserId,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt
  });
}

function readActor(actor: TeamActor): TeamActor {
  const userId = readIdentifier(actor?.userId);
  const orgId = readIdentifier(actor?.orgId);
  if (!userId || !orgId) {
    throw new TeamServiceError("AUTHENTICATION_REQUIRED");
  }
  return Object.freeze({ userId, orgId });
}

function readIdentifier(value: unknown) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= IDENTIFIER_MAX_CHARACTERS &&
    value.trim() === value
    ? value
    : null;
}

function laterDate(first: Date, second: Date) {
  return first.getTime() >= second.getTime() ? first : second;
}

function success<T>(value: T): TeamStoreResult<T> {
  return { ok: true, value };
}

function failure(reason: TeamStoreFailureReason): TeamStoreResult<never> {
  return { ok: false, reason };
}

function unwrapStoreResult<T>(result: TeamStoreResult<T>): T {
  if (result.ok) {
    return result.value;
  }
  throw new TeamServiceError(storeFailureToErrorCode(result.reason));
}

function storeFailureToErrorCode(reason: TeamStoreFailureReason): TeamServiceErrorCode {
  switch (reason) {
    case "ACTOR_DENIED":
      return "TEAM_ACCESS_DENIED";
    case "ROLE_DENIED":
      return "TEAM_ROLE_FORBIDDEN";
    case "RESOURCE_UNAVAILABLE":
      return "TEAM_RESOURCE_UNAVAILABLE";
    case "CONFLICT":
      return "TEAM_CONFLICT";
    case "FINAL_OWNER":
      return "FINAL_OWNER_REQUIRED";
    case "INVITE_UNAVAILABLE":
      return "INVITE_UNAVAILABLE";
    case "INVITE_AUTHENTICATION_REQUIRED":
      return "INVITE_AUTHENTICATION_REQUIRED";
  }
}

function sanitizeUnexpectedError(error: unknown) {
  return error instanceof TeamServiceError
    ? error
    : new TeamServiceError("TEAM_OPERATION_FAILED");
}

function isUniqueConstraintError(error: unknown) {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") ||
    (isObject(error) && error.code === "P2002")
  );
}

function isSerializableConflict(error: unknown): boolean {
  if (!isObject(error)) {
    return false;
  }
  if (error.code === "P2034" || error.code === "40001") {
    return true;
  }
  if (isObject(error.meta)) {
    if (
      error.meta.code === "40001" ||
      String(error.meta.database_error ?? "").includes("40001")
    ) {
      return true;
    }
  }
  return error.cause !== error && isSerializableConflict(error.cause);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
