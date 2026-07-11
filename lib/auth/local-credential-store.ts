import { randomBytes } from "node:crypto";
import { MembershipRole, MembershipStatus, Prisma, type PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/auth/crypto";
import {
  createLocalCredentialService,
  type FirstOwnerBootstrapTransaction,
  type LocalAuthenticationRecord,
  type LocalCredentialService,
  type LocalCredentialStore
} from "@/lib/auth/local-credentials";
export function createPrismaLocalCredentialStore(prisma: PrismaClient): LocalCredentialStore {
  return {
  transaction(operation, options) {
    return prisma.$transaction(
      (transaction) => operation(createBootstrapTransaction(transaction)),
      { isolationLevel: Prisma.TransactionIsolationLevel[options.isolationLevel] }
    );
  },

  async findAuthenticationRecord(normalizedEmail) {
    const user = await prisma.appUser.findUnique({
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
    });

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
    const updated = await prisma.$executeRaw`
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
    `;
    return updated === 1;
  },

  async resetFailedAuthentications(input) {
    await prisma.localCredential.updateMany({
      where: { id: input.credentialId },
      data: { failedAttempts: 0, lockedUntil: null, updatedAt: input.resetAt }
    });
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
    store: createPrismaLocalCredentialStore(prismaClient),
    bootstrapToken: input.bootstrapToken,
    authenticationFallbackHash: await authenticationFallbackHashPromise,
    maximumFailedAttempts: input.maximumFailedAttempts,
    lockDurationMs: input.lockDurationMs
  });
}

function createBootstrapTransaction(
  transaction: Prisma.TransactionClient
): FirstOwnerBootstrapTransaction {
  return {
    countLocalCredentials() {
      return transaction.localCredential.count();
    },

    createUser(input) {
      return transaction.appUser.create({
        data: input,
        select: {
          id: true,
          email: true,
          displayName: true,
          authVersion: true
        }
      });
    },

    createOrganization(input) {
      return transaction.organization.create({
        data: input,
        select: {
          id: true,
          name: true,
          slug: true,
          timezone: true
        }
      });
    },

    async createLocalCredential(input) {
      await transaction.localCredential.create({ data: input });
    },

    async createOwnerMembership(input) {
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
