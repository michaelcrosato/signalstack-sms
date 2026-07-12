import { AuthTokenType, MembershipStatus, Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  createOpaqueToken,
  hashOpaqueToken,
  normalizeEmail,
  type OpaqueToken
} from "@/lib/auth/crypto";

const DEFAULT_TTL_MINUTES = 60;
const SERIALIZABLE_ATTEMPTS = 4;

export type OperatorPasswordResetInput = Readonly<{
  email: string;
  organizationSlug: string;
  expiresInMinutes?: number;
}>;

export type OperatorPasswordResetResult = Readonly<{
  token: string;
  email: string;
  expiresAt: Date;
}>;

type StoreResult =
  | Readonly<{ ok: true; email: string; expiresAt: Date }>
  | Readonly<{ ok: false }>;

export interface OperatorPasswordResetStore {
  issue(input: Readonly<{
    normalizedEmail: string;
    organizationSlug: string;
    tokenHash: string;
    now: Date;
    expiresAt: Date;
  }>): Promise<StoreResult>;
}

export type OperatorPasswordResetDependencies = Readonly<{
  store: OperatorPasswordResetStore;
  now: () => Date;
  createToken: () => OpaqueToken;
}>;

export class OperatorPasswordResetError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "SUBJECT_UNAVAILABLE" | "OPERATION_FAILED") {
    super("Operator password reset link creation failed.");
    this.name = "OperatorPasswordResetError";
  }
}

const inputSchema = z
  .object({
    email: z.string().trim().email().max(320).transform(normalizeEmail),
    organizationSlug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    expiresInMinutes: z.number().int().min(5).max(24 * 60).default(DEFAULT_TTL_MINUTES)
  })
  .strict();

export async function issueOperatorPasswordReset(
  input: OperatorPasswordResetInput,
  dependencies: OperatorPasswordResetDependencies
): Promise<OperatorPasswordResetResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw new OperatorPasswordResetError("INVALID_INPUT");
  }
  const now = dependencies.now();
  const expiresAt = new Date(now.getTime() + parsed.data.expiresInMinutes * 60_000);
  let opaque: OpaqueToken;
  try {
    opaque = dependencies.createToken();
    if (
      !/^ss_reset_[A-Za-z0-9_-]{43}$/.test(opaque.token) ||
      hashOpaqueToken(opaque.token) !== opaque.tokenHash
    ) {
      throw new Error("invalid token");
    }
  } catch {
    throw new OperatorPasswordResetError("OPERATION_FAILED");
  }

  try {
    const result = await dependencies.store.issue({
      normalizedEmail: parsed.data.email,
      organizationSlug: parsed.data.organizationSlug,
      tokenHash: opaque.tokenHash,
      now,
      expiresAt
    });
    if (!result.ok) {
      throw new OperatorPasswordResetError("SUBJECT_UNAVAILABLE");
    }
    return Object.freeze({ token: opaque.token, email: result.email, expiresAt: result.expiresAt });
  } catch (error) {
    if (error instanceof OperatorPasswordResetError) {
      throw error;
    }
    throw new OperatorPasswordResetError("OPERATION_FAILED");
  }
}

export function createPrismaOperatorPasswordResetStore(
  prisma: PrismaClient
): OperatorPasswordResetStore {
  return {
    async issue(input) {
      return runSerializable(prisma, async (transaction) => {
        const organization = await transaction.organization.findUnique({
          where: { slug: input.organizationSlug },
          select: { id: true, demoMode: true }
        });
        if (!organization || organization.demoMode) {
          return { ok: false } as const;
        }
        const membership = await transaction.membership.findFirst({
          where: {
            orgId: organization.id,
            status: MembershipStatus.ACTIVE,
            user: { normalizedEmail: input.normalizedEmail, disabledAt: null }
          },
          select: { userId: true, user: { select: { email: true } } }
        });
        if (!membership) {
          return { ok: false } as const;
        }

        await transaction.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${membership.userId}, 742))::text
        `;
        const subject = await transaction.appUser.findUnique({
          where: { id: membership.userId },
          select: {
            id: true,
            email: true,
            disabledAt: true,
            memberships: { select: { orgId: true, status: true } }
          }
        });
        if (
          !subject ||
          subject.disabledAt ||
          !subject.memberships.some(
            ({ orgId, status }) =>
              orgId === organization.id && status === MembershipStatus.ACTIVE
          )
        ) {
          return { ok: false } as const;
        }

        const prior = await transaction.authToken.updateMany({
          where: {
            type: AuthTokenType.PASSWORD_RESET,
            userId: subject.id,
            consumedAt: null,
            revokedAt: null
          },
          data: { revokedAt: input.now }
        });
        await transaction.authToken.create({
          data: {
            type: AuthTokenType.PASSWORD_RESET,
            tokenHash: input.tokenHash,
            userId: subject.id,
            orgId: null,
            email: null,
            role: null,
            issuedByUserId: null,
            createdAt: input.now,
            expiresAt: input.expiresAt
          },
          select: { id: true }
        });
        const orgIds = [...new Set(subject.memberships.map(({ orgId }) => orgId))];
        await transaction.liveReadinessAuditEvent.createMany({
          data: orgIds.map((orgId) => ({
            orgId,
            actorUserId: null,
            action: "AUTH_PASSWORD_RESET_LINK_ISSUED_BY_OPERATOR",
            subjectType: "AppUser",
            subjectId: subject.id,
            metadata: {
              authentication: "platform_operator",
              expiresAt: input.expiresAt.toISOString(),
              priorTokensRevoked: prior.count
            },
            createdAt: input.now
          }))
        });
        return { ok: true, email: subject.email, expiresAt: input.expiresAt } as const;
      });
    }
  };
}

export async function createPrismaOperatorPasswordResetService(
  prismaClient?: PrismaClient
): Promise<(input: OperatorPasswordResetInput) => Promise<OperatorPasswordResetResult>> {
  const client = prismaClient ?? (await import("@/lib/db/prisma")).prisma;
  const dependencies: OperatorPasswordResetDependencies = {
    store: createPrismaOperatorPasswordResetStore(client),
    now: () => new Date(),
    createToken: () => createOpaqueToken("reset")
  };
  return (input) => issueOperatorPasswordReset(input, dependencies);
}

async function runSerializable<T>(
  prisma: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      if (!isSerializableConflict(error) || attempt === SERIALIZABLE_ATTEMPTS - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 5 * (attempt + 1)));
    }
  }
  throw new Error("unreachable");
}

function isSerializableConflict(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") ||
    (error instanceof Error && /(?:40001|could not serialize)/i.test(error.message))
  );
}
