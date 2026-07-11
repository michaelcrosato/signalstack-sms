import {
  MembershipRole,
  MembershipStatus,
  Prisma,
  type PrismaClient
} from "@prisma/client";
import { createPrismaLocalCredentialService } from "@/lib/auth/local-credential-store";
import {
  createOperatorAdminService,
  type OperatorAdminService,
  type OperatorAdminStore,
  type OperatorAdminTransaction
} from "@/lib/auth/operator-admin-service";
export function createPrismaOperatorAdminStore(prisma: PrismaClient): OperatorAdminStore {
  return {
    transaction(operation, options) {
      return prisma.$transaction(
        (transaction) => operation(createOperatorAdminTransaction(transaction)),
        { isolationLevel: Prisma.TransactionIsolationLevel[options.isolationLevel] }
      );
    }
  };
}

export async function createPrismaOperatorAdminService(
  input: Readonly<{ bootstrapToken?: string; prismaClient?: PrismaClient }> = {}
): Promise<OperatorAdminService> {
  const prismaClient = input.prismaClient ?? (await import("@/lib/db/prisma")).prisma;
  return createOperatorAdminService({
    firstOwnerService: await createPrismaLocalCredentialService({
      bootstrapToken: input.bootstrapToken,
      prismaClient
    }),
    store: createPrismaOperatorAdminStore(prismaClient)
  });
}

function createOperatorAdminTransaction(
  transaction: Prisma.TransactionClient
): OperatorAdminTransaction {
  return {
    findOrganizationByExactSlug(slug) {
      return transaction.organization.findUnique({
        where: { slug },
        select: { id: true, slug: true, demoMode: true }
      });
    },

    async findIdentityByNormalizedEmail(normalizedEmail) {
      const user = await transaction.appUser.findUnique({
        where: { normalizedEmail },
        select: {
          id: true,
          disabledAt: true,
          localCredential: { select: { id: true } }
        }
      });
      return user
        ? {
            id: user.id,
            disabledAt: user.disabledAt,
            hasLocalCredential: Boolean(user.localCredential)
          }
        : null;
    },

    createEnabledUser(input) {
      return transaction.appUser.create({
        data: input,
        select: { id: true, email: true }
      });
    },

    async createLocalCredential(input) {
      await transaction.localCredential.create({ data: input });
    },

    async createActiveOwnerMembership(input) {
      await transaction.membership.create({
        data: {
          orgId: input.orgId,
          userId: input.userId,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE
        }
      });
    },

    revokePendingInvitesForEmail(input) {
      return transaction.$executeRaw`
        UPDATE "AuthToken"
        SET "revokedAt" = GREATEST(${input.revokedAt}, "createdAt")
        WHERE "type" = 'INVITE'::"AuthTokenType"
          AND "orgId" = ${input.orgId}
          AND "email" = ${input.normalizedEmail}
          AND "consumedAt" IS NULL
          AND "revokedAt" IS NULL
          AND "expiresAt" > ${input.revokedAt}
      `;
    },

    async createSecretFreeAuditEvent(input) {
      await transaction.liveReadinessAuditEvent.create({ data: input });
    }
  };
}
