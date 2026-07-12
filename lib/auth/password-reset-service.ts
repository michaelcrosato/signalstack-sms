import { AuthTokenType, MembershipRole, Prisma } from "@prisma/client";
import { evaluatePasswordPolicy, hashOpaqueToken, hashPassword } from "@/lib/auth/crypto";
import { isValidAuthToken } from "@/lib/auth/auth-token-policy";
import { setAuthTransactionContext, withAuthDatabaseContext } from "@/lib/db/tenant-context";

const SERIALIZABLE_ATTEMPTS = 4;
const RESET_TOKEN_PATTERN = /^ss_reset_[A-Za-z0-9_-]{43}$/;

export type CompletePasswordResetInput = Readonly<{ token: string; password: string }>;
export type CompletedPasswordReset = Readonly<{ completed: true; completedAt: Date }>;

export type CompletePasswordResetStoreInput = Readonly<{
  tokenHash: string;
  passwordHash: string;
  now: Date;
}>;

export type StoredPasswordResetCompletion = Readonly<{ completedAt: Date }>;
export type PasswordResetStoreResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; reason: "RESET_UNAVAILABLE" }>;

export interface PasswordResetStore {
  resetAvailable(tokenHash: string, now: Date): Promise<boolean>;
  completeReset(
    input: CompletePasswordResetStoreInput
  ): Promise<PasswordResetStoreResult<StoredPasswordResetCompletion>>;
}

export type PasswordResetServiceDependencies = Readonly<{
  store: PasswordResetStore;
  now: () => Date;
  encodePassword: (password: string) => Promise<string>;
}>;

export type PasswordResetServiceDependencyOverrides = Partial<PasswordResetServiceDependencies>;
export type PasswordResetServiceErrorCode =
  | "INVALID_INPUT"
  | "PASSWORD_RESET_UNAVAILABLE"
  | "PASSWORD_RESET_OPERATION_FAILED";

const errorDefinitions = Object.freeze({
  INVALID_INPUT: { status: 400, message: "Password reset input is invalid." },
  PASSWORD_RESET_UNAVAILABLE: { status: 400, message: "Password reset is unavailable." },
  PASSWORD_RESET_OPERATION_FAILED: { status: 500, message: "Password reset operation failed." }
} satisfies Record<PasswordResetServiceErrorCode, { status: number; message: string }>);

export class PasswordResetServiceError extends Error {
  readonly status: number;

  constructor(readonly code: PasswordResetServiceErrorCode) {
    const definition = errorDefinitions[code];
    super(definition.message);
    this.name = "PasswordResetServiceError";
    this.status = definition.status;
  }

  toJSON() {
    return { code: this.code, message: this.message };
  }
}

class ResetTransactionUnavailableError extends Error {}

export const prismaPasswordResetStore: PasswordResetStore = {
  async resetAvailable(tokenHash, now) {
    const token = await withAuthDatabaseContext(
      { tokenHash, purpose: "password_reset" },
      (client) => client.authToken.findFirst({
        where: {
          tokenHash,
          type: AuthTokenType.PASSWORD_RESET,
          userId: { not: null },
          orgId: null,
          email: null,
          role: null,
          issuedByUserId: null,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: now }
        },
        select: { userId: true }
      })
    );
    if (!token?.userId) {
      return false;
    }
    const userId = token.userId;
    const account = await withAuthDatabaseContext(
      { userId, purpose: "password_reset" },
      async (client) => {
        const [user, membership] = await Promise.all([
          client.appUser.findFirst({
            where: { id: userId, disabledAt: null },
            select: { id: true }
          }),
          client.membership.findFirst({
            where: { userId },
            select: { id: true }
          })
        ]);
        return { user, membership };
      }
    );
    return Boolean(account.user && account.membership);
  },

  async completeReset(input) {
    try {
      return await runSerializable(input.tokenHash, async (transaction) => {
        await lockResetToken(transaction, input.tokenHash);
        const token = await transaction.authToken.findUnique({
          where: { tokenHash: input.tokenHash },
          select: {
            id: true,
            type: true,
            userId: true,
            orgId: true,
            email: true,
            role: true,
            issuedByUserId: true,
            expiresAt: true,
            consumedAt: true,
            revokedAt: true
          }
        });
        if (!resetTokenIsAvailable(token, input.now)) {
          return resetUnavailable();
        }

        await setAuthTransactionContext(transaction, {
          tokenHash: input.tokenHash,
          userId: token.userId,
          purpose: "password_reset"
        });
        await lockResetSubject(transaction, token.userId);
        const subject = await transaction.appUser.findUnique({
          where: { id: token.userId },
          select: {
            id: true,
            disabledAt: true,
            memberships: { select: { orgId: true } }
          }
        });
        if (!subject || subject.disabledAt || subject.memberships.length === 0) {
          return resetUnavailable();
        }

        const claimed = await transaction.authToken.updateMany({
          where: {
            id: token.id,
            type: AuthTokenType.PASSWORD_RESET,
            userId: token.userId,
            orgId: null,
            email: null,
            role: null,
            issuedByUserId: null,
            consumedAt: null,
            revokedAt: null,
            expiresAt: { gt: input.now }
          },
          data: { consumedAt: input.now }
        });
        if (claimed.count !== 1) {
          return resetUnavailable();
        }

        await transaction.localCredential.upsert({
          where: { userId: token.userId },
          create: {
            userId: token.userId,
            passwordHash: input.passwordHash,
            passwordChangedAt: input.now,
            failedAttempts: 0,
            lockedUntil: null,
            createdAt: input.now
          },
          update: {
            passwordHash: input.passwordHash,
            passwordChangedAt: input.now,
            failedAttempts: 0,
            lockedUntil: null
          },
          select: { id: true }
        });
        const versioned = await transaction.appUser.updateMany({
          where: { id: token.userId, disabledAt: null },
          data: { authVersion: { increment: 1 } }
        });
        if (versioned.count !== 1) {
          throw new ResetTransactionUnavailableError();
        }
        const revokedSessions = await transaction.authSession.updateMany({
          where: { userId: token.userId, revokedAt: null },
          data: { revokedAt: input.now }
        });
        const auditOrgIds = [...new Set(subject.memberships.map(({ orgId }) => orgId))];
        await transaction.liveReadinessAuditEvent.createMany({
          data: auditOrgIds.map((orgId) => ({
            orgId,
            actorUserId: null,
            action: "AUTH_PASSWORD_RESET_COMPLETED",
            subjectType: "AppUser",
            subjectId: token.userId,
            createdAt: input.now,
            metadata: {
              source: "self_hosted_identity",
              authentication: "operator_reset_bearer",
              sessionsRevoked: revokedSessions.count
            }
          }))
        });
        return { ok: true, value: { completedAt: input.now } } as const;
      });
    } catch (error) {
      if (error instanceof ResetTransactionUnavailableError) {
        return resetUnavailable();
      }
      throw error;
    }
  }
};

export async function completePasswordReset(
  input: unknown,
  overrides: PasswordResetServiceDependencyOverrides = {}
): Promise<CompletedPasswordReset> {
  const parsed = readCompletionInput(input);
  if (!parsed) {
    throw new PasswordResetServiceError("INVALID_INPUT");
  }
  if (!isStrictResetToken(parsed.token)) {
    throw new PasswordResetServiceError("PASSWORD_RESET_UNAVAILABLE");
  }
  if (!evaluatePasswordPolicy(parsed.password).valid) {
    throw new PasswordResetServiceError("INVALID_INPUT");
  }

  const dependencies = resolveDependencies(overrides);
  let tokenHash: string;
  try {
    tokenHash = hashOpaqueToken(parsed.token);
  } catch {
    throw new PasswordResetServiceError("PASSWORD_RESET_UNAVAILABLE");
  }
  const preflightAt = readCurrentTime(dependencies);
  try {
    if (!(await dependencies.store.resetAvailable(tokenHash, preflightAt))) {
      throw new PasswordResetServiceError("PASSWORD_RESET_UNAVAILABLE");
    }
  } catch (error) {
    if (error instanceof PasswordResetServiceError) throw error;
    throw new PasswordResetServiceError("PASSWORD_RESET_OPERATION_FAILED");
  }

  let passwordHash: string;
  try {
    passwordHash = await dependencies.encodePassword(parsed.password);
  } catch {
    throw new PasswordResetServiceError("PASSWORD_RESET_OPERATION_FAILED");
  }

  const now = readCurrentTime(dependencies);
  try {
    const result = await dependencies.store.completeReset({ tokenHash, passwordHash, now });
    if (!result.ok) {
      throw new PasswordResetServiceError("PASSWORD_RESET_UNAVAILABLE");
    }
    if (result.value.completedAt.getTime() !== now.getTime()) {
      throw new PasswordResetServiceError("PASSWORD_RESET_OPERATION_FAILED");
    }
    return Object.freeze({ completed: true, completedAt: result.value.completedAt });
  } catch (error) {
    throw sanitizeUnexpectedError(error);
  }
}

export function isPasswordResetServiceError(error: unknown): error is PasswordResetServiceError {
  return error instanceof PasswordResetServiceError;
}

function resolveDependencies(
  overrides: PasswordResetServiceDependencyOverrides
): PasswordResetServiceDependencies {
  return {
    store: overrides.store ?? prismaPasswordResetStore,
    now: overrides.now ?? (() => new Date()),
    encodePassword: overrides.encodePassword ?? hashPassword
  };
}

function readCompletionInput(input: unknown): CompletePasswordResetInput | null {
  if (!isPlainObject(input) || !hasExactKeys(input, ["token", "password"])) return null;
  return typeof input.token === "string" && typeof input.password === "string"
    ? { token: input.token, password: input.password }
    : null;
}

function hasExactKeys(value: Record<string, unknown>, required: readonly string[]) {
  const keys = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => required.includes(key));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
  );
}

function isStrictResetToken(value: unknown): value is string {
  return isValidAuthToken(value) && RESET_TOKEN_PATTERN.test(value);
}

function readCurrentTime(dependencies: PasswordResetServiceDependencies) {
  const now = dependencies.now();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new PasswordResetServiceError("PASSWORD_RESET_OPERATION_FAILED");
  }
  return new Date(now);
}

function resetTokenIsAvailable(
  token: Readonly<{
    id: string;
    type: AuthTokenType;
    userId: string | null;
    orgId: string | null;
    email: string | null;
    role: MembershipRole | null;
    issuedByUserId: string | null;
    expiresAt: Date;
    consumedAt: Date | null;
    revokedAt: Date | null;
  }> | null,
  now: Date
): token is Readonly<{
  id: string;
  type: AuthTokenType;
  userId: string;
  orgId: null;
  email: null;
  role: null;
  issuedByUserId: null;
  expiresAt: Date;
  consumedAt: null;
  revokedAt: null;
}> {
  return Boolean(
    token &&
      token.type === AuthTokenType.PASSWORD_RESET &&
      token.userId &&
      token.orgId === null &&
      token.email === null &&
      token.role === null &&
      token.issuedByUserId === null &&
      token.consumedAt === null &&
      token.revokedAt === null &&
      Number.isFinite(token.expiresAt.getTime()) &&
      token.expiresAt.getTime() > now.getTime()
  );
}

async function runSerializable<T>(
  tokenHash: string,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await withAuthDatabaseContext(
        { tokenHash, purpose: "password_reset" },
        operation,
        {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        }
      );
    } catch (error) {
      if (!isSerializableConflict(error) || attempt === SERIALIZABLE_ATTEMPTS - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5 * (attempt + 1)));
    }
  }
  throw new Error("unreachable");
}

async function lockResetSubject(transaction: Prisma.TransactionClient, userId: string) {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 742))::text
  `;
}

async function lockResetToken(transaction: Prisma.TransactionClient, tokenHash: string) {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${tokenHash}, 743))::text
  `;
}

function resetUnavailable(): PasswordResetStoreResult<never> {
  return { ok: false, reason: "RESET_UNAVAILABLE" };
}

function sanitizeUnexpectedError(error: unknown) {
  return error instanceof PasswordResetServiceError
    ? error
    : new PasswordResetServiceError("PASSWORD_RESET_OPERATION_FAILED");
}

function isSerializableConflict(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") ||
    (error instanceof Error && /(?:40001|could not serialize)/i.test(error.message))
  );
}
