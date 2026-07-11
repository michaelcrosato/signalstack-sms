import { randomBytes } from "node:crypto";
import { MembershipRole, MembershipStatus, Prisma, type PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/auth/crypto";
import {
  setAuthTransactionContext,
  withAuthDatabaseContext,
  type AuthDatabaseContext
} from "@/lib/db/tenant-context";
import {
  createLocalCredentialService,
  type FirstOwnerBootstrapTransaction,
  type LocalAuthenticationRecord,
  type LocalCredentialService,
  type LocalCredentialStore
} from "@/lib/auth/local-credentials";
export function createPrismaLocalCredentialStore(
  prisma: PrismaClient,
  storeOptions: Readonly<{ enforceRuntimeControl?: boolean }> = {}
): LocalCredentialStore {
  const run = <T>(
    context: AuthDatabaseContext,
    operation: (client: Prisma.TransactionClient) => Promise<T>
  ) =>
    storeOptions.enforceRuntimeControl
      ? withAuthDatabaseContext(context, operation)
      : operation(prisma as unknown as Prisma.TransactionClient);

  return {
  transaction(operation, options) {
    if (storeOptions.enforceRuntimeControl) {
      return withAuthDatabaseContext(
        { purpose: "bootstrap" },
        (transaction) => operation(createBootstrapTransaction(transaction)),
        { isolationLevel: Prisma.TransactionIsolationLevel[options.isolationLevel] }
      );
    }
    return prisma.$transaction(
      (transaction) => operation(createBootstrapTransaction(transaction)),
      { isolationLevel: Prisma.TransactionIsolationLevel[options.isolationLevel] }
    );
  },

  async findAuthenticationRecord(normalizedEmail) {
    const user = await run({ loginEmail: normalizedEmail, purpose: "login" }, (client) => client.appUser.findUnique({
      where: { normalizedEmail },
      select: {
        id: true,
        email: true,
        normalizedEmail: true,
        displayName: true,
        disabledAt: true,
        authVersion: true,
        localCredential: {
          select: {
            id: true,
            passwordHash: true,
            passwordChangedAt: true,
            failedAttempts: true,
            lockedUntil: true
          }
        }
      }
    }));

    if (!user?.localCredential) {
      return null;
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        normalizedEmail: user.normalizedEmail,
        displayName: user.displayName,
        disabledAt: user.disabledAt,
        authVersion: user.authVersion
      },
      credential: user.localCredential
    } satisfies LocalAuthenticationRecord;
  },

  async recordFailedAuthentication(input) {
    const lockedUntil = new Date(input.occurredAt.getTime() + input.lockDurationMs);
    const updated = await run({ userId: input.userId, purpose: "login" }, (client) => client.$executeRaw`
        UPDATE "LocalCredential"
        SET
          "failedAttempts" = CASE
            WHEN "lockedUntil" IS NOT NULL AND "lockedUntil" <= ${input.occurredAt} THEN 1
            ELSE "failedAttempts" + 1
          END,
          "lockedUntil" = CASE
            WHEN (
              CASE
                WHEN "lockedUntil" IS NOT NULL AND "lockedUntil" <= ${input.occurredAt} THEN 1
                ELSE "failedAttempts" + 1
              END
            ) >= ${input.maximumAttempts} THEN ${lockedUntil}
            WHEN "lockedUntil" IS NOT NULL AND "lockedUntil" <= ${input.occurredAt} THEN NULL
            ELSE "lockedUntil"
          END,
          "updatedAt" = ${input.occurredAt}
        WHERE "id" = ${input.credentialId}
          AND "userId" = ${input.userId}
          AND "passwordHash" = ${input.observedPasswordHash}
          AND "passwordChangedAt" = ${input.observedPasswordChangedAt}
      `);
    return updated === 1;
  },

  async resetFailedAuthentications(input) {
    await run({ purpose: "login" }, (client) =>
      client.localCredential.updateMany({
        where: { id: input.credentialId },
        data: { failedAttempts: 0, lockedUntil: null, updatedAt: input.resetAt }
      })
    );
  }
  };
}

let authenticationFallbackHashPromise: Promise<string> | undefined;

export async function createPrismaLocalCredentialService(
  input: Readonly<{
    bootstrapToken?: string;
    maximumFailedAttempts?: number;
    lockDurationMs?: number;
    prismaClient?: PrismaClient;
  }> = {}
): Promise<LocalCredentialService> {
  authenticationFallbackHashPromise ??= hashPassword(
    `fallback-${randomBytes(32).toString("base64url")}`
  );

  const prismaClient = input.prismaClient ?? (await import("@/lib/db/prisma")).prisma;
  return createLocalCredentialService({
    store: createPrismaLocalCredentialStore(prismaClient, {
      enforceRuntimeControl: input.prismaClient === undefined
    }),
    bootstrapToken: input.bootstrapToken,
    authenticationFallbackHash: await authenticationFallbackHashPromise,
    maximumFailedAttempts: input.maximumFailedAttempts,
    lockDurationMs: input.lockDurationMs
  });
}

function createBootstrapTransaction(
  transaction: Prisma.TransactionClient
): FirstOwnerBootstrapTransaction {
  let bootstrapUserId: string | undefined;
  let bootstrapOrgId: string | undefined;
  let bootstrapOrgSlug: string | undefined;

  return {
    countLocalCredentials() {
      return transaction.localCredential.count();
    },

    async createUser(input) {
      await setAuthTransactionContext(transaction, {
        loginEmail: input.normalizedEmail,
        purpose: "bootstrap"
      });
      const user = await transaction.appUser.create({
        data: input,
        select: {
          id: true,
          email: true,
          displayName: true,
          authVersion: true
        }
      });
      bootstrapUserId = user.id;
      await setAuthTransactionContext(transaction, {
        userId: user.id,
        loginEmail: input.normalizedEmail,
        purpose: "bootstrap"
      });
      return user;
    },

    async createOrganization(input) {
      if (!bootstrapUserId) {
        throw new Error("Bootstrap user context is unavailable.");
      }
      await setAuthTransactionContext(transaction, {
        userId: bootstrapUserId,
        orgSlug: input.slug,
        purpose: "bootstrap"
      });
      const organization = await transaction.organization.create({
        data: input,
        select: {
          id: true,
          name: true,
          slug: true,
          timezone: true
        }
      });
      bootstrapOrgId = organization.id;
      bootstrapOrgSlug = organization.slug;
      await setAuthTransactionContext(transaction, {
        orgId: organization.id,
        orgSlug: organization.slug,
        userId: bootstrapUserId,
        purpose: "bootstrap"
      });
      return organization;
    },

    async createLocalCredential(input) {
      await transaction.localCredential.create({ data: input });
    },

    async createOwnerMembership(input) {
      if (
        !bootstrapUserId ||
        !bootstrapOrgId ||
        !bootstrapOrgSlug ||
        input.userId !== bootstrapUserId ||
        input.orgId !== bootstrapOrgId
      ) {
        throw new Error("Bootstrap membership context is invalid.");
      }
      await transaction.membership.create({
        data: {
          orgId: input.orgId,
          userId: input.userId,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE
        }
      });
    },

    async createAuditEvent(input) {
      await transaction.liveReadinessAuditEvent.create({ data: input });
    }
  };
}
