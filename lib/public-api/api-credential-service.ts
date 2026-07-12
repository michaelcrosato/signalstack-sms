import type { ApiCredential, Prisma } from "@prisma/client";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import { generateApiKey, readApiKeyPepper } from "@/lib/public-api/api-key-crypto";
import { normalizeApiScopes, type ApiScope } from "@/lib/public-api/scopes";

const DEFAULT_API_RATE_LIMIT_PER_MINUTE = 60;
const MIN_API_RATE_LIMIT_PER_MINUTE = 1;
const MAX_API_RATE_LIMIT_PER_MINUTE = 10_000;
const MAX_GENERATION_ATTEMPTS = 3;

export type SafeApiCredential = Readonly<{
  id: string;
  name: string;
  prefix: string;
  scopes: readonly ApiScope[];
  rateLimitPerMinute: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type RevealedApiCredential = Readonly<{
  credential: SafeApiCredential;
  token: string;
}>;

export type ApiCredentialActor =
  | Readonly<{ kind: "user"; userId: string }>
  | Readonly<{ kind: "api_credential"; credentialId: string }>
  | Readonly<{ kind: "system" }>;

export class ApiCredentialServiceError extends Error {
  readonly code:
    | "INVALID_API_CREDENTIAL"
    | "API_CREDENTIAL_NOT_FOUND"
    | "API_CREDENTIAL_REVOKED"
    | "API_CREDENTIAL_ROTATION_CONFLICT";

  constructor(code: ApiCredentialServiceError["code"], message: string) {
    super(message);
    this.name = "ApiCredentialServiceError";
    this.code = code;
  }
}

export async function listApiCredentials(
  orgId: string,
  tx?: Prisma.TransactionClient
): Promise<readonly SafeApiCredential[]> {
  return runCredentialOperation(orgId, tx, async (client) => {
    const credentials = await client.apiCredential.findMany({
      where: { orgId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });
    return Object.freeze(credentials.map(toSafeApiCredential));
  });
}

export async function getApiCredential(
  orgId: string,
  credentialId: string,
  tx?: Prisma.TransactionClient
): Promise<SafeApiCredential | null> {
  assertIdentifier(credentialId, "credential");
  return runCredentialOperation(orgId, tx, async (client) => {
    const credential = await client.apiCredential.findFirst({
      where: { orgId, id: credentialId }
    });
    return credential ? toSafeApiCredential(credential) : null;
  });
}

export async function createApiCredential(
  input: Readonly<{
    orgId: string;
    name: string;
    scopes: readonly string[];
    rateLimitPerMinute?: number;
    expiresAt?: Date | null;
    actor: ApiCredentialActor;
  }>,
  tx?: Prisma.TransactionClient,
  environment: Readonly<Record<string, string | undefined>> = process.env
): Promise<RevealedApiCredential> {
  const normalized = normalizeCredentialInput(input);
  const pepper = readApiKeyPepper(environment);

  return runCredentialOperation(input.orgId, tx, async (client) => {
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
      const generated = generateApiKey(pepper);
      try {
        const credential = await client.apiCredential.create({
          data: {
            orgId: normalized.orgId,
            name: normalized.name,
            prefix: generated.prefix,
            secretHash: generated.secretHash,
            scopes: normalized.scopes,
            rateLimitPerMinute: normalized.rateLimitPerMinute,
            expiresAt: normalized.expiresAt
          }
        });
        await createIntegrationAuditEvent(client, {
          orgId: normalized.orgId,
          actor: normalized.actor,
          action: "api_credential.created",
          subjectType: "api_credential",
          subjectId: credential.id,
          metadata: {
            prefix: credential.prefix,
            scopes: normalized.scopes,
            expiresAt: credential.expiresAt?.toISOString() ?? null,
            rateLimitPerMinute: credential.rateLimitPerMinute
          }
        });
        return Object.freeze({
          credential: toSafeApiCredential(credential),
          token: generated.token
        });
      } catch (error) {
        if (isUniqueConflict(error) && attempt + 1 < MAX_GENERATION_ATTEMPTS) {
          continue;
        }
        throw error;
      }
    }
    throw new Error("Unable to allocate a unique API credential.");
  });
}

export async function rotateApiCredential(
  input: Readonly<{
    orgId: string;
    credentialId: string;
    expectedPrefix?: string;
    actor: ApiCredentialActor;
  }>,
  tx?: Prisma.TransactionClient,
  environment: Readonly<Record<string, string | undefined>> = process.env
): Promise<RevealedApiCredential> {
  assertIdentifier(input.orgId, "organization");
  assertIdentifier(input.credentialId, "credential");
  if (input.expectedPrefix !== undefined && !/^ss_api_[A-Za-z0-9_-]{12}$/.test(input.expectedPrefix)) {
    throw new ApiCredentialServiceError("INVALID_API_CREDENTIAL", "API credential prefix is invalid.");
  }
  assertCredentialActor(input.actor);
  const pepper = readApiKeyPepper(environment);

  return runCredentialOperation(input.orgId, tx, async (client) => {
    await lockCredential(client, input.orgId, input.credentialId);
    const existing = await client.apiCredential.findFirst({
      where: { orgId: input.orgId, id: input.credentialId }
    });
    if (!existing) {
      throw new ApiCredentialServiceError("API_CREDENTIAL_NOT_FOUND", "API credential not found.");
    }
    if (existing.revokedAt) {
      throw new ApiCredentialServiceError("API_CREDENTIAL_REVOKED", "A revoked API credential cannot be rotated.");
    }
    if (input.expectedPrefix !== undefined && existing.prefix !== input.expectedPrefix) {
      throw new ApiCredentialServiceError(
        "API_CREDENTIAL_ROTATION_CONFLICT",
        "The API credential changed before rotation completed."
      );
    }

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
      const generated = generateApiKey(pepper);
      try {
        const credential = await client.apiCredential.update({
          where: { id: existing.id },
          data: {
            prefix: generated.prefix,
            secretHash: generated.secretHash,
            lastUsedAt: null,
            lastUsedIpHash: null,
            rateWindowStartedAt: null,
            rateRequestCount: 0
          }
        });
        await createIntegrationAuditEvent(client, {
          orgId: input.orgId,
          actor: input.actor,
          action: "api_credential.rotated",
          subjectType: "api_credential",
          subjectId: credential.id,
          metadata: { previousPrefix: existing.prefix, prefix: credential.prefix }
        });
        return Object.freeze({
          credential: toSafeApiCredential(credential),
          token: generated.token
        });
      } catch (error) {
        if (isUniqueConflict(error) && attempt + 1 < MAX_GENERATION_ATTEMPTS) {
          continue;
        }
        throw error;
      }
    }
    throw new Error("Unable to allocate a unique rotated API credential.");
  });
}

export async function revokeApiCredential(
  input: Readonly<{
    orgId: string;
    credentialId: string;
    actor: ApiCredentialActor;
  }>,
  tx?: Prisma.TransactionClient
): Promise<SafeApiCredential> {
  assertIdentifier(input.orgId, "organization");
  assertIdentifier(input.credentialId, "credential");
  assertCredentialActor(input.actor);

  return runCredentialOperation(input.orgId, tx, async (client) => {
    await lockCredential(client, input.orgId, input.credentialId);
    const existing = await client.apiCredential.findFirst({
      where: { orgId: input.orgId, id: input.credentialId }
    });
    if (!existing) {
      throw new ApiCredentialServiceError("API_CREDENTIAL_NOT_FOUND", "API credential not found.");
    }

    const credential = existing.revokedAt
      ? existing
      : await client.apiCredential.update({
          where: { id: existing.id },
          data: { revokedAt: new Date() }
        });
    if (!existing.revokedAt) {
      await createIntegrationAuditEvent(client, {
        orgId: input.orgId,
        actor: input.actor,
        action: "api_credential.revoked",
        subjectType: "api_credential",
        subjectId: credential.id,
        metadata: { prefix: credential.prefix }
      });
    }
    return toSafeApiCredential(credential);
  });
}

export function toSafeApiCredential(credential: ApiCredential): SafeApiCredential {
  const scopes = normalizeApiScopes(credential.scopes);
  return Object.freeze({
    id: credential.id,
    name: credential.name,
    prefix: credential.prefix,
    scopes: Object.freeze(scopes),
    rateLimitPerMinute: credential.rateLimitPerMinute,
    expiresAt: credential.expiresAt?.toISOString() ?? null,
    lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
    revokedAt: credential.revokedAt?.toISOString() ?? null,
    createdAt: credential.createdAt.toISOString(),
    updatedAt: credential.updatedAt.toISOString()
  });
}

async function runCredentialOperation<T>(
  orgId: string,
  tx: Prisma.TransactionClient | undefined,
  operation: (client: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  assertIdentifier(orgId, "organization");
  return tx ? operation(tx) : withTenantTransaction({ orgId }, operation);
}

function normalizeCredentialInput(input: Readonly<{
  orgId: string;
  name: string;
  scopes: readonly string[];
  rateLimitPerMinute?: number;
  expiresAt?: Date | null;
  actor: ApiCredentialActor;
}>) {
  assertIdentifier(input.orgId, "organization");
  assertCredentialActor(input.actor);
  const name = input.name.trim();
  if (name.length < 1 || name.length > 120 || hasControlCharacter(name)) {
    throw new ApiCredentialServiceError("INVALID_API_CREDENTIAL", "API credential name is invalid.");
  }
  const scopes = normalizeApiScopes(input.scopes);
  if (scopes.length < 1) {
    throw new ApiCredentialServiceError(
      "INVALID_API_CREDENTIAL",
      "At least one valid API credential scope is required."
    );
  }
  const rateLimitPerMinute = input.rateLimitPerMinute ?? DEFAULT_API_RATE_LIMIT_PER_MINUTE;
  if (
    !Number.isInteger(rateLimitPerMinute) ||
    rateLimitPerMinute < MIN_API_RATE_LIMIT_PER_MINUTE ||
    rateLimitPerMinute > MAX_API_RATE_LIMIT_PER_MINUTE
  ) {
    throw new ApiCredentialServiceError("INVALID_API_CREDENTIAL", "API credential rate limit is invalid.");
  }
  const expiresAt = input.expiresAt ?? null;
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) {
    throw new ApiCredentialServiceError("INVALID_API_CREDENTIAL", "API credential expiry must be in the future.");
  }
  return Object.freeze({
    orgId: input.orgId,
    name,
    scopes,
    rateLimitPerMinute,
    expiresAt,
    actor: input.actor
  });
}

async function lockCredential(
  tx: Prisma.TransactionClient,
  orgId: string,
  credentialId: string
): Promise<void> {
  await tx.$queryRaw`
    SELECT id
    FROM "ApiCredential"
    WHERE "orgId" = ${orgId} AND id = ${credentialId}
    FOR UPDATE
  `;
}

async function createIntegrationAuditEvent(
  tx: Prisma.TransactionClient,
  input: Readonly<{
    orgId: string;
    actor: ApiCredentialActor;
    action: string;
    subjectType: string;
    subjectId?: string;
    metadata?: Prisma.InputJsonValue;
  }>
): Promise<void> {
  await tx.integrationAuditEvent.create({
    data: {
      orgId: input.orgId,
      actorUserId: input.actor.kind === "user" ? input.actor.userId : null,
      apiCredentialId:
        input.actor.kind === "api_credential" ? input.actor.credentialId : null,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      metadata: input.metadata
    }
  });
}

function assertCredentialActor(actor: ApiCredentialActor): void {
  if (actor.kind === "user") {
    assertIdentifier(actor.userId, "actor user");
  } else if (actor.kind === "api_credential") {
    assertIdentifier(actor.credentialId, "actor credential");
  }
}

function assertIdentifier(value: string, name: string): void {
  if (value.length < 1 || value.length > 191 || value.trim() !== value || hasControlCharacter(value)) {
    throw new ApiCredentialServiceError("INVALID_API_CREDENTIAL", `API credential ${name} is invalid.`);
  }
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => (character.codePointAt(0) ?? 0) < 32);
}

function isUniqueConflict(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
