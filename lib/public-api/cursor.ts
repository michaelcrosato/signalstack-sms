import { createHmac, timingSafeEqual } from "node:crypto";

export const PUBLIC_API_CURSOR_VERSION = 1 as const;
export const PUBLIC_API_CURSOR_MAX_LENGTH = 1024;

const cursorDomain = "signalstack-public-api-cursor:v1";
const cursorSegmentPattern = /^[A-Za-z0-9_-]+$/;
const cursorBindingPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const cursorResourcePattern = /^[a-z][a-z0-9-]{0,63}$/;
const cursorIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export type PublicApiCursorBinding = Readonly<{
  orgId: string;
  resource: string;
}>;

export type PublicApiCursorPosition = Readonly<{
  createdAt: string;
  id: string;
}>;

export type PublicApiCursorInput = PublicApiCursorBinding & PublicApiCursorPosition;

type PublicApiCursorWirePayload = Readonly<{
  v: typeof PUBLIC_API_CURSOR_VERSION;
  t: string;
  r: string;
  c: string;
  i: string;
}>;

export class PublicApiCursorError extends Error {
  readonly code = "INVALID_CURSOR" as const;

  constructor() {
    super("The pagination cursor is invalid.");
    this.name = "PublicApiCursorError";
  }
}

function secretBytes(secret: string | Uint8Array) {
  const bytes = typeof secret === "string" ? Buffer.from(secret, "utf8") : Buffer.from(secret);
  if (bytes.byteLength < 32 || bytes.byteLength > 256) {
    throw new RangeError("The cursor secret must contain 32 to 256 bytes.");
  }
  return bytes;
}

function validBinding(binding: PublicApiCursorBinding) {
  return cursorBindingPattern.test(binding.orgId) && cursorResourcePattern.test(binding.resource);
}

function canonicalCreatedAt(value: string) {
  if (value.length < 20 || value.length > 35) {
    return null;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }
  const canonical = parsed.toISOString();
  return value === canonical ? canonical : null;
}

function signatureFor(payloadSegment: string, secret: Buffer) {
  return createHmac("sha256", secret).update(`${cursorDomain}.${payloadSegment}`, "utf8").digest();
}

function parseWirePayload(value: unknown): PublicApiCursorWirePayload | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    Object.keys(candidate).length !== 5 ||
    candidate.v !== PUBLIC_API_CURSOR_VERSION ||
    typeof candidate.t !== "string" ||
    typeof candidate.r !== "string" ||
    typeof candidate.c !== "string" ||
    typeof candidate.i !== "string" ||
    !validBinding({ orgId: candidate.t, resource: candidate.r }) ||
    canonicalCreatedAt(candidate.c) === null ||
    !cursorIdPattern.test(candidate.i)
  ) {
    return null;
  }

  return {
    v: PUBLIC_API_CURSOR_VERSION,
    t: candidate.t,
    r: candidate.r,
    c: candidate.c,
    i: candidate.i
  };
}

export function encodePublicApiCursor(input: PublicApiCursorInput, secret: string | Uint8Array): string {
  const createdAt = canonicalCreatedAt(input.createdAt);
  if (!validBinding(input) || createdAt === null || !cursorIdPattern.test(input.id)) {
    throw new TypeError("Cannot encode an invalid public API cursor position.");
  }

  const wirePayload: PublicApiCursorWirePayload = {
    v: PUBLIC_API_CURSOR_VERSION,
    t: input.orgId,
    r: input.resource,
    c: createdAt,
    i: input.id
  };
  const payloadSegment = Buffer.from(JSON.stringify(wirePayload), "utf8").toString("base64url");
  const signatureSegment = signatureFor(payloadSegment, secretBytes(secret)).toString("base64url");
  const cursor = `${payloadSegment}.${signatureSegment}`;
  if (cursor.length > PUBLIC_API_CURSOR_MAX_LENGTH) {
    throw new TypeError("Cannot encode a public API cursor that exceeds the size limit.");
  }
  return cursor;
}

export function decodePublicApiCursor(
  cursor: string,
  expected: PublicApiCursorBinding,
  secret: string | Uint8Array
): PublicApiCursorPosition {
  if (
    typeof cursor !== "string" ||
    cursor.length === 0 ||
    cursor.length > PUBLIC_API_CURSOR_MAX_LENGTH ||
    !validBinding(expected)
  ) {
    throw new PublicApiCursorError();
  }

  const segments = cursor.split(".");
  if (
    segments.length !== 2 ||
    segments[0].length === 0 ||
    segments[1].length !== 43 ||
    !cursorSegmentPattern.test(segments[0]) ||
    !cursorSegmentPattern.test(segments[1])
  ) {
    throw new PublicApiCursorError();
  }

  const expectedSignature = signatureFor(segments[0], secretBytes(secret));
  let suppliedSignature: Buffer;
  try {
    suppliedSignature = Buffer.from(segments[1], "base64url");
  } catch {
    throw new PublicApiCursorError();
  }
  if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) {
    throw new PublicApiCursorError();
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(segments[0], "base64url").toString("utf8"));
  } catch {
    throw new PublicApiCursorError();
  }

  const payload = parseWirePayload(decoded);
  if (payload === null || payload.t !== expected.orgId || payload.r !== expected.resource) {
    throw new PublicApiCursorError();
  }

  return { createdAt: payload.c, id: payload.i };
}
