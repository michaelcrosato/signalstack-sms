import { randomUUID } from "node:crypto";
import { MembershipStatus, type MembershipRole } from "@prisma/client";
import {
  createOpaqueToken,
  hashLocalSessionToken,
  hashOpaqueToken,
  type OpaqueToken
} from "@/lib/auth/crypto";
import { withAuthDatabaseContext, withTenantTransaction } from "@/lib/db/tenant-context";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export type LocalSessionPolicy = Readonly<{
  idleTtlMs: number;
  absoluteTtlMs: number;
  lastSeenRefreshIntervalMs: number;
}>;

export const defaultLocalSessionPolicy: LocalSessionPolicy = Object.freeze({
  idleTtlMs: 30 * MINUTE_MS,
  absoluteTtlMs: 24 * HOUR_MS,
  lastSeenRefreshIntervalMs: 5 * MINUTE_MS
});

export type StoredLocalSession = Readonly<{
  id: string;
  userId: string;
  orgId: string;
  authVersion: number;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
}>;

export type LocalSessionPrincipal = Readonly<{
  user: Readonly<{
    id: string;
    email: string;
    displayName: string | null;
    disabledAt: Date | null;
    authVersion: number;
  }>;
  org: Readonly<{
    id: string;
    slug: string;
    name: string;
    demoMode: boolean;
  }>;
  membership: Readonly<{
    role: MembershipRole;
    status: MembershipStatus;
  }>;
}>;

export type CreateStoredLocalSessionInput = Readonly<{
  tokenHash: string;
  userId: string;
  orgId: string;
  authVersion: number;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}>;

export type RefreshStoredLocalSessionInput = Readonly<{
  sessionId: string;
  userId: string;
  orgId: string;
  authVersion: number;
  now: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
}>;

export type SwitchStoredLocalSessionOrgInput = Readonly<{
  sessionId: string;
  userId: string;
  fromOrgId: string;
  toOrgId: string;
  authVersion: number;
  now: Date;
}>;

export interface LocalSessionStore {
  findPrincipal(userId: string, orgId: string): Promise<LocalSessionPrincipal | null>;
  /** Atomically rechecks the principal generation and eligibility before inserting. */
  createSession(input: CreateStoredLocalSessionInput): Promise<StoredLocalSession | null>;
  findSessionByTokenHash(tokenHash: string): Promise<StoredLocalSession | null>;
  refreshSession(input: RefreshStoredLocalSessionInput): Promise<boolean>;
  revokeSessionByTokenHash(tokenHash: string, now: Date): Promise<boolean>;
  /** Atomically increments the user's authVersion and revokes every currently active session. */
  revokeAllSessions(userId: string, now: Date, auditOrgId?: string): Promise<number | null>;
  switchSessionOrg(input: SwitchStoredLocalSessionOrgInput): Promise<boolean>;
}

export type LocalSessionDependencies = Readonly<{
  store: LocalSessionStore;
  now: () => Date;
  createToken: () => OpaqueToken;
  hashToken: (token: string) => string;
  policy: LocalSessionPolicy;
}>;

export type LocalSessionDependencyOverrides = Readonly<{
  store?: LocalSessionStore;
  now?: () => Date;
  createToken?: () => OpaqueToken;
  hashToken?: (token: string) => string;
  policy?: Partial<LocalSessionPolicy>;
}>;

export type ResolvedLocalSession = Readonly<{
  sessionId: string;
  userId: string;
  email: string;
  displayName: string | null;
  orgId: string;
  orgSlug: string;
  orgName: string;
  role: MembershipRole;
  demoMode: boolean;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}>;

export type CreatedLocalSession = Readonly<{
  /** The only service result that exposes the newly generated bearer token. */
  token: string;
  session: ResolvedLocalSession;
}>;

const storedSessionSelect = {
  id: true,
  userId: true,
  orgId: true,
  authVersion: true,
  createdAt: true,
  lastSeenAt: true,
  idleExpiresAt: true,
  absoluteExpiresAt: true,
  revokedAt: true
} as const;

const prismaLocalSessionStore: LocalSessionStore = {
  async findPrincipal(userId, orgId) {
    const membership = await withTenantTransaction({ orgId, userId }, (client) =>
      client.membership.findUnique({
        where: { orgId_userId: { orgId, userId } },
        select: {
          role: true,
          status: true,
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
              disabledAt: true,
              authVersion: true
            }
          },
          org: {
            select: {
              id: true,
              slug: true,
              name: true,
              demoMode: true
            }
          }
        }
      })
    );

    if (!membership) {
      return null;
    }

    return {
      user: membership.user,
      org: membership.org,
      membership: {
        role: membership.role,
        status: membership.status
      }
    };
  },

  async createSession(input) {
    return withTenantTransaction({ orgId: input.orgId, userId: input.userId }, async (transaction) => {
      // Password reset uses the same subject lock. Either this session commits first and is then
      // revoked by the reset, or the reset commits first and this generation check rejects it.
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${input.userId}, 742))::text
      `;
      const membership = await transaction.membership.findUnique({
        where: { orgId_userId: { orgId: input.orgId, userId: input.userId } },
        select: {
          status: true,
          user: { select: { disabledAt: true, authVersion: true } }
        }
      });
      if (
        membership?.status !== MembershipStatus.ACTIVE ||
        membership.user.disabledAt !== null ||
        membership.user.authVersion !== input.authVersion
      ) {
        return null;
      }

      const session = await transaction.authSession.create({
        data: input,
        select: storedSessionSelect
      });
      await transaction.liveReadinessAuditEvent.create({
        data: {
          orgId: input.orgId,
          actorUserId: input.userId,
          action: "LOCAL_SESSION_CREATED",
          subjectType: "AuthSession",
          subjectId: session.id,
          metadata: { authVersion: input.authVersion },
          createdAt: input.createdAt
        },
        select: { id: true }
      });
      return session;
    });
  },

  async findSessionByTokenHash(tokenHash) {
    return withAuthDatabaseContext({ sessionHash: tokenHash, purpose: "session" }, (client) =>
      client.authSession.findUnique({
        where: { tokenHash },
        select: storedSessionSelect
      })
    );
  },

  async refreshSession(input) {
    const result = await withTenantTransaction(
      { orgId: input.orgId, userId: input.userId },
      (client) => client.authSession.updateMany({
        where: {
          id: input.sessionId,
          userId: input.userId,
          orgId: input.orgId,
          authVersion: input.authVersion,
          revokedAt: null,
          idleExpiresAt: { gt: input.now },
          absoluteExpiresAt: { gt: input.now }
        },
        data: {
          lastSeenAt: input.lastSeenAt,
          idleExpiresAt: input.idleExpiresAt
        }
      })
    );
    return result.count === 1;
  },

  async revokeSessionByTokenHash(tokenHash, now) {
    const session = await withAuthDatabaseContext(
      { sessionHash: tokenHash, purpose: "session" },
      (client) => client.authSession.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, orgId: true, revokedAt: true }
      })
    );
    if (!session || session.revokedAt) {
      return false;
    }
    return withTenantTransaction({ orgId: session.orgId, userId: session.userId }, async (transaction) => {
      const result = await transaction.authSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now }
      });
      if (result.count !== 1) {
        return false;
      }
      await transaction.liveReadinessAuditEvent.create({
        data: {
          orgId: session.orgId,
          actorUserId: session.userId,
          action: "LOCAL_SESSION_REVOKED",
          subjectType: "AuthSession",
          subjectId: session.id,
          createdAt: now
        },
        select: { id: true }
      });
      return true;
    });
  },

  async revokeAllSessions(userId, now, auditOrgId) {
    return withAuthDatabaseContext(
      { userId, ...(auditOrgId ? { orgId: auditOrgId } : {}), purpose: "session" },
      async (transaction) => {
      // Serialize against session creation and password/reset operations for the same subject. The
      // request was already authenticated before this store call; a concurrent membership change
      // must not turn an authenticated self-revocation into a false successful no-op.
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 742))::text
      `;
      const user = await transaction.appUser.updateMany({
        where: { id: userId },
        data: { authVersion: { increment: 1 } }
      });
      if (user.count !== 1) {
        return null;
      }

      const sessions = await transaction.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now }
      });
      if (auditOrgId) {
        // INSERT ... SELECT both checks exact organization evidence and lets the foreign key acquire
        // its key-share lock. If the organization disappeared after request authentication, zero
        // audit rows are inserted while the security-critical revocation still commits.
        await transaction.$executeRaw`
          INSERT INTO "LiveReadinessAuditEvent" (
            "id", "orgId", "actorUserId", "action", "subjectType", "subjectId", "metadata", "createdAt"
          )
          SELECT
            ${randomUUID()},
            organization."id",
            ${userId},
            'LOCAL_SESSIONS_REVOKED_ALL',
            'AppUser',
            ${userId},
            jsonb_build_object('revokedSessions', ${sessions.count}),
            ${now}
          FROM "Organization" organization
          WHERE organization."id" = ${auditOrgId}
        `;
      }
        return sessions.count;
      }
    );
  },

  async switchSessionOrg(input) {
    return withAuthDatabaseContext(
      { orgId: input.toOrgId, userId: input.userId, purpose: "session" },
      async (transaction) => {
      const targetMembership = await transaction.membership.findUnique({
        where: { orgId_userId: { orgId: input.toOrgId, userId: input.userId } },
        select: {
          status: true,
          user: { select: { disabledAt: true, authVersion: true } }
        }
      });
      if (
        targetMembership?.status !== MembershipStatus.ACTIVE ||
        targetMembership.user.disabledAt ||
        targetMembership.user.authVersion !== input.authVersion
      ) {
        return false;
      }

      const result = await transaction.authSession.updateMany({
        where: {
          id: input.sessionId,
          userId: input.userId,
          orgId: input.fromOrgId,
          authVersion: input.authVersion,
          revokedAt: null,
          idleExpiresAt: { gt: input.now },
          absoluteExpiresAt: { gt: input.now }
        },
        data: { orgId: input.toOrgId }
      });
      if (result.count !== 1) {
        return false;
      }
      await transaction.liveReadinessAuditEvent.create({
        data: {
          orgId: input.toOrgId,
          actorUserId: input.userId,
          action: "LOCAL_SESSION_ORGANIZATION_SELECTED",
          subjectType: "AuthSession",
          subjectId: input.sessionId,
          createdAt: input.now
        },
        select: { id: true }
      });
        return true;
      }
    );
  }
};

export async function createLocalSession(
  input: Readonly<{ userId: string; orgId: string; expectedAuthVersion?: number }>,
  overrides: LocalSessionDependencyOverrides = {}
): Promise<CreatedLocalSession> {
  assertIdentifier(input.userId, "userId");
  assertIdentifier(input.orgId, "orgId");
  const dependencies = resolveDependencies(overrides);
  const principal = await dependencies.store.findPrincipal(input.userId, input.orgId);
  if (!principalIsEligible(principal, input.userId, input.orgId)) {
    throw new Error("Local session principal is not eligible.");
  }
  if (
    input.expectedAuthVersion !== undefined &&
    (!Number.isSafeInteger(input.expectedAuthVersion) ||
      input.expectedAuthVersion < 0 ||
      principal.user.authVersion !== input.expectedAuthVersion)
  ) {
    throw new Error("Local session principal is not eligible.");
  }

  const now = readCurrentTime(dependencies);
  const absoluteExpiresAt = new Date(now.getTime() + dependencies.policy.absoluteTtlMs);
  const idleExpiresAt = new Date(
    Math.min(now.getTime() + dependencies.policy.idleTtlMs, absoluteExpiresAt.getTime())
  );
  let opaqueToken: OpaqueToken;
  let tokenHash: string;
  try {
    opaqueToken = dependencies.createToken();
    tokenHash = dependencies.hashToken(opaqueToken.token);
  } catch {
    throw new Error("Local session token generation failed.");
  }
  if (opaqueToken.tokenHash !== tokenHash) {
    throw new Error("Local session token generation failed.");
  }

  const stored = await dependencies.store.createSession({
    tokenHash,
    userId: principal.user.id,
    orgId: principal.org.id,
    authVersion: principal.user.authVersion,
    createdAt: now,
    lastSeenAt: now,
    idleExpiresAt,
    absoluteExpiresAt
  });
  if (!stored) {
    throw new Error("Local session principal is not eligible.");
  }

  return {
    token: opaqueToken.token,
    session: projectResolvedSession(stored, principal)
  };
}

export async function resolveLocalSession(
  rawToken: string,
  overrides: LocalSessionDependencyOverrides = {}
): Promise<ResolvedLocalSession | null> {
  const dependencies = resolveDependencies(overrides);
  const tokenHash = safelyHashPresentedToken(rawToken, dependencies);
  if (!tokenHash) {
    return null;
  }

  return resolveStoredSession(tokenHash, dependencies, readCurrentTime(dependencies));
}

export async function revokeLocalSession(
  rawToken: string,
  overrides: LocalSessionDependencyOverrides = {}
): Promise<boolean> {
  const dependencies = resolveDependencies(overrides);
  const tokenHash = safelyHashPresentedToken(rawToken, dependencies);
  if (!tokenHash) {
    return false;
  }

  return dependencies.store.revokeSessionByTokenHash(tokenHash, readCurrentTime(dependencies));
}

export async function revokeAllLocalSessions(
  userId: string,
  overrides: LocalSessionDependencyOverrides = {}
): Promise<number> {
  if (!identifierIsValid(userId)) {
    return 0;
  }
  const dependencies = resolveDependencies(overrides);
  return (await dependencies.store.revokeAllSessions(userId, readCurrentTime(dependencies))) ?? 0;
}

export async function revokeAllLocalSessionsForOrganization(
  userId: string,
  auditOrgId: string,
  overrides: LocalSessionDependencyOverrides = {}
): Promise<number | null> {
  if (!identifierIsValid(userId) || !identifierIsValid(auditOrgId)) {
    return null;
  }
  const dependencies = resolveDependencies(overrides);
  return dependencies.store.revokeAllSessions(
    userId,
    readCurrentTime(dependencies),
    auditOrgId
  );
}

export async function switchLocalSessionOrganization(
  rawToken: string,
  targetOrgId: string,
  overrides: LocalSessionDependencyOverrides = {}
): Promise<ResolvedLocalSession | null> {
  if (!identifierIsValid(targetOrgId)) {
    return null;
  }
  const dependencies = resolveDependencies(overrides);
  const tokenHash = safelyHashPresentedToken(rawToken, dependencies);
  if (!tokenHash) {
    return null;
  }

  const now = readCurrentTime(dependencies);
  const current = await resolveStoredSession(tokenHash, dependencies, now);
  if (!current || current.orgId === targetOrgId) {
    return current;
  }

  const targetPrincipal = await dependencies.store.findPrincipal(current.userId, targetOrgId);
  if (!principalIsEligible(targetPrincipal, current.userId, targetOrgId)) {
    return null;
  }

  const switched = await dependencies.store.switchSessionOrg({
    sessionId: current.sessionId,
    userId: current.userId,
    fromOrgId: current.orgId,
    toOrgId: targetOrgId,
    authVersion: targetPrincipal.user.authVersion,
    now
  });
  if (!switched) {
    return null;
  }

  return {
    ...current,
    orgId: targetPrincipal.org.id,
    orgSlug: targetPrincipal.org.slug,
    orgName: targetPrincipal.org.name,
    role: targetPrincipal.membership.role,
    demoMode: targetPrincipal.org.demoMode
  };
}

async function resolveStoredSession(
  tokenHash: string,
  dependencies: LocalSessionDependencies,
  now: Date
): Promise<ResolvedLocalSession | null> {
  const stored = await dependencies.store.findSessionByTokenHash(tokenHash);
  if (!stored || !storedSessionIsTemporallyValid(stored, now)) {
    return null;
  }

  const principal = await dependencies.store.findPrincipal(stored.userId, stored.orgId);
  if (
    !principalIsEligible(principal, stored.userId, stored.orgId) ||
    principal.user.authVersion !== stored.authVersion
  ) {
    return null;
  }

  let resolvedStored = stored;
  if (now.getTime() - stored.lastSeenAt.getTime() >= dependencies.policy.lastSeenRefreshIntervalMs) {
    const nextIdleExpiresAt = new Date(
      Math.min(now.getTime() + dependencies.policy.idleTtlMs, stored.absoluteExpiresAt.getTime())
    );
    const refreshed = await dependencies.store.refreshSession({
      sessionId: stored.id,
      userId: stored.userId,
      orgId: stored.orgId,
      authVersion: stored.authVersion,
      now,
      lastSeenAt: now,
      idleExpiresAt: nextIdleExpiresAt
    });
    if (!refreshed) {
      return null;
    }
    resolvedStored = {
      ...stored,
      lastSeenAt: now,
      idleExpiresAt: nextIdleExpiresAt
    };
  }

  return projectResolvedSession(resolvedStored, principal);
}

function resolveDependencies(overrides: LocalSessionDependencyOverrides): LocalSessionDependencies {
  const policy = Object.freeze({ ...defaultLocalSessionPolicy, ...overrides.policy });
  assertPolicy(policy);
  const hashToken = overrides.hashToken ?? defaultSessionTokenHash;
  return {
    store: overrides.store ?? prismaLocalSessionStore,
    now: overrides.now ?? (() => new Date()),
    createToken:
      overrides.createToken ??
      (() => {
        const opaque = createOpaqueToken("session");
        return { token: opaque.token, tokenHash: hashToken(opaque.token) };
      }),
    hashToken,
    policy
  };
}

function defaultSessionTokenHash(token: string) {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (
    typeof secret === "string" &&
    secret.length >= 32 &&
    secret.length <= 1_024 &&
    Buffer.byteLength(secret, "utf8") <= 2_048 &&
    !Array.from(secret).some((character) => (character.codePointAt(0) ?? 0) < 32)
  ) {
    return hashLocalSessionToken(token, secret);
  }
  // Focused service tests intentionally run without process secrets. A production process must never
  // regain compatibility with legacy unkeyed rows when its operator key is missing.
  if (process.env.NODE_ENV === "production") {
    throw new Error("Local session hashing is unavailable.");
  }
  return hashOpaqueToken(token);
}

function safelyHashPresentedToken(token: string, dependencies: LocalSessionDependencies) {
  try {
    return dependencies.hashToken(token);
  } catch {
    return null;
  }
}

function principalIsEligible(
  principal: LocalSessionPrincipal | null,
  userId: string,
  orgId: string
): principal is LocalSessionPrincipal {
  return Boolean(
    principal &&
      principal.user.id === userId &&
      principal.org.id === orgId &&
      principal.user.disabledAt === null &&
      principal.membership.status === MembershipStatus.ACTIVE
  );
}

function storedSessionIsTemporallyValid(session: StoredLocalSession, now: Date) {
  const timestamps = [
    session.createdAt,
    session.lastSeenAt,
    session.idleExpiresAt,
    session.absoluteExpiresAt
  ];
  return (
    session.revokedAt === null &&
    timestamps.every((value) => Number.isFinite(value.getTime())) &&
    now.getTime() < session.idleExpiresAt.getTime() &&
    now.getTime() < session.absoluteExpiresAt.getTime()
  );
}

function projectResolvedSession(
  session: StoredLocalSession,
  principal: LocalSessionPrincipal
): ResolvedLocalSession {
  return {
    sessionId: session.id,
    userId: principal.user.id,
    email: principal.user.email,
    displayName: principal.user.displayName,
    orgId: principal.org.id,
    orgSlug: principal.org.slug,
    orgName: principal.org.name,
    role: principal.membership.role,
    demoMode: principal.org.demoMode,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    idleExpiresAt: session.idleExpiresAt,
    absoluteExpiresAt: session.absoluteExpiresAt
  };
}

function readCurrentTime(dependencies: Pick<LocalSessionDependencies, "now">) {
  const now = dependencies.now();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Local session clock returned an invalid time.");
  }
  return new Date(now.getTime());
}

function assertPolicy(policy: LocalSessionPolicy) {
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`Local session policy ${name} must be a positive safe integer.`);
    }
  }
  if (policy.idleTtlMs >= policy.absoluteTtlMs) {
    throw new Error("Local session idle lifetime must be shorter than its absolute lifetime.");
  }
  if (policy.lastSeenRefreshIntervalMs > policy.idleTtlMs) {
    throw new Error("Local session refresh interval cannot exceed its idle lifetime.");
  }
}

function identifierIsValid(value: string) {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && value.trim() === value;
}

function assertIdentifier(value: string, name: string) {
  if (!identifierIsValid(value)) {
    throw new Error(`Local session ${name} is invalid.`);
  }
}
