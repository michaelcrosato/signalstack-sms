import { createHash, createHmac } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { readApiKeyPepper } from "@/lib/public-api/api-key-crypto";
import {
  decryptIdempotencyResponse,
  encryptIdempotencyResponse
} from "@/lib/public-api/idempotency-encryption";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1_000;
const MAX_CANONICAL_REQUEST_BYTES = 1_048_576;
const MAX_STORED_RESPONSE_BYTES = 131_072;

export class PublicApiIdempotencyError extends Error {
  readonly code:
    | "IDEMPOTENCY_KEY_REQUIRED"
    | "IDEMPOTENCY_KEY_INVALID"
    | "IDEMPOTENCY_CONFLICT"
    | "PAYLOAD_TOO_LARGE";

  constructor(
    code: PublicApiIdempotencyError["code"],
    message: string
  ) {
    super(message);
    this.name = "PublicApiIdempotencyError";
    this.code = code;
  }
}

export type IdempotentMutationResponse = Readonly<{
  status: number;
  body: Prisma.InputJsonValue;
  headers?: Readonly<Record<string, string>>;
}>;

export type IdempotentMutationResult = Readonly<{
  replayed: boolean;
  status: number;
  body: Prisma.JsonValue | Prisma.InputJsonValue;
  headers: Readonly<Record<string, string>>;
}>;

export type IdempotentMutationContext = Readonly<{
  orgId: string;
  credentialId: string;
  idempotencyKey: string | null;
  method: string;
  canonicalRoute: string;
  requestBody: unknown;
}>;

/**
 * Execute and persist a public write in the caller's tenant transaction. The advisory lock,
 * mutation, and completed response snapshot share one commit boundary, so a crash cannot leave an
 * authoritative "in progress" record behind or commit a resource without its replay result.
 */
export async function executeIdempotentMutation(
  tx: Prisma.TransactionClient,
  context: IdempotentMutationContext,
  mutation: () => Promise<IdempotentMutationResponse>,
  environment: Readonly<Record<string, string | undefined>> = process.env
): Promise<IdempotentMutationResult> {
  const normalized = normalizeIdempotencyContext(context, environment);
  const advisoryKey = advisoryLockKey(
    `${normalized.orgId}\0${normalized.credentialId}\0${normalized.keyHash}`
  );

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryKey})`;

  const existing = await tx.apiIdempotencyRecord.findUnique({
    where: {
      orgId_credentialId_key: {
        orgId: normalized.orgId,
        credentialId: normalized.credentialId,
        key: normalized.keyHash
      }
    }
  });

  const now = new Date();
  if (existing && existing.expiresAt.getTime() > now.getTime()) {
    if (
      existing.method !== normalized.method ||
      existing.canonicalRoute !== normalized.canonicalRoute ||
      existing.requestHash !== normalized.requestHash
    ) {
      throw new PublicApiIdempotencyError(
        "IDEMPOTENCY_CONFLICT",
        "The idempotency key was already used for a different request."
      );
    }

    return Object.freeze({
      replayed: true,
      status: existing.responseStatus,
      body: decryptIdempotencyResponse(existing.responseBody, normalized, environment),
      headers: Object.freeze(jsonHeaders(existing.responseHeaders))
    });
  }

  if (existing) {
    await tx.apiIdempotencyRecord.delete({ where: { id: existing.id } });
  }

  const response = await mutation();
  const serializedResponse = JSON.stringify(response.body);
  if (Buffer.byteLength(serializedResponse, "utf8") > MAX_STORED_RESPONSE_BYTES) {
    throw new PublicApiIdempotencyError(
      "PAYLOAD_TOO_LARGE",
      "The response is too large for idempotent replay."
    );
  }

  const responseHeaders = normalizeStoredHeaders(response.headers);
  await tx.apiIdempotencyRecord.create({
    data: {
      orgId: normalized.orgId,
      credentialId: normalized.credentialId,
      key: normalized.keyHash,
      method: normalized.method,
      canonicalRoute: normalized.canonicalRoute,
      requestHash: normalized.requestHash,
      responseStatus: response.status,
      responseBody: encryptIdempotencyResponse(response.body, normalized, environment),
      responseHeaders,
      expiresAt: new Date(now.getTime() + IDEMPOTENCY_RETENTION_MS)
    }
  });

  return Object.freeze({
    replayed: false,
    status: response.status,
    body: response.body,
    headers: Object.freeze(responseHeaders)
  });
}

export function requireIdempotencyKey(value: string | null): string {
  if (!value) {
    throw new PublicApiIdempotencyError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "An Idempotency-Key header is required for this request."
    );
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new PublicApiIdempotencyError(
      "IDEMPOTENCY_KEY_INVALID",
      "The Idempotency-Key header is invalid."
    );
  }
  return value;
}

export function canonicalizePublicApiJson(value: unknown): string {
  const canonical = canonicalJsonValue(value, new Set());
  const serialized = JSON.stringify(canonical);
  if (Buffer.byteLength(serialized, "utf8") > MAX_CANONICAL_REQUEST_BYTES) {
    throw new PublicApiIdempotencyError("PAYLOAD_TOO_LARGE", "The request payload is too large.");
  }
  return serialized;
}

export function hashIdempotentRequest(
  method: string,
  canonicalRoute: string,
  requestBody: unknown,
  pepper: string
): string {
  const canonicalBody = canonicalizePublicApiJson(requestBody);
  return createHmac("sha256", pepper)
    .update("signalstack/public-api-idempotency-request/v1\0", "utf8")
    .update(method.toUpperCase(), "utf8")
    .update("\0", "utf8")
    .update(canonicalRoute, "utf8")
    .update("\0", "utf8")
    .update(canonicalBody, "utf8")
    .digest("base64url");
}

export function hashIdempotencyKey(key: string, pepper: string): string {
  requireIdempotencyKey(key);
  return createHmac("sha256", pepper)
    .update("signalstack/public-api-idempotency-key/v1\0", "utf8")
    .update(key, "utf8")
    .digest("base64url");
}

function normalizeIdempotencyContext(
  context: IdempotentMutationContext,
  environment: Readonly<Record<string, string | undefined>>
) {
  const idempotencyKey = requireIdempotencyKey(context.idempotencyKey);
  const method = context.method.toUpperCase();
  if (!/^(POST|PUT|PATCH|DELETE)$/.test(method)) {
    throw new Error("Idempotent public API method is invalid.");
  }
  if (!/^\/api\/v1\/[A-Za-z0-9_/:.-]+$/.test(context.canonicalRoute)) {
    throw new Error("Idempotent public API route is invalid.");
  }
  if (!isBoundedIdentifier(context.orgId) || !isBoundedIdentifier(context.credentialId)) {
    throw new Error("Idempotent public API identity is invalid.");
  }

  const pepper = readApiKeyPepper(environment);
  return Object.freeze({
    orgId: context.orgId,
    credentialId: context.credentialId,
    method,
    canonicalRoute: context.canonicalRoute,
    keyHash: hashIdempotencyKey(idempotencyKey, pepper),
    requestHash: hashIdempotentRequest(method, context.canonicalRoute, context.requestBody, pepper)
  });
}

function canonicalJsonValue(value: unknown, ancestors: Set<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Public API JSON cannot contain a non-finite number.");
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new Error("Public API JSON cannot contain a cycle.");
    }
    ancestors.add(value);
    const result = value.map((entry) => canonicalJsonValue(entry, ancestors));
    ancestors.delete(value);
    return result;
  }
  if (typeof value === "object") {
    if (ancestors.has(value as object)) {
      throw new Error("Public API JSON cannot contain a cycle.");
    }
    ancestors.add(value as object);
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) {
        result[key] = canonicalJsonValue(entry, ancestors);
      }
    }
    ancestors.delete(value as object);
    return result;
  }
  throw new Error("Public API request body is not JSON-compatible.");
}

function normalizeStoredHeaders(headers: Readonly<Record<string, string>> | undefined) {
  const allowed = new Set(["location"]);
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    const lowerName = name.toLowerCase();
    if (allowed.has(lowerName) && value.length <= 2_048 && !/[\r\n]/.test(value)) {
      normalized[lowerName] = value;
    }
  }
  return normalized;
}

function jsonHeaders(value: Prisma.JsonValue): Record<string, string> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }
  return normalizeStoredHeaders(
    Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    )
  );
}

function advisoryLockKey(value: string): bigint {
  return createHash("sha256").update(value, "utf8").digest().readBigInt64BE(0);
}

function isBoundedIdentifier(value: string): boolean {
  return value.length >= 1 && value.length <= 191 && value.trim() === value;
}
