import { createHmac, timingSafeEqual } from "node:crypto";
import { parseCustomerWebhookSigningSecret } from "@/lib/integrations/customer-webhooks/signing-secrets";

const SIGNATURE_VERSION = "v1" as const;
const SIGNATURE_BYTES = 32;
const DEFAULT_TOLERANCE_SECONDS = 300;
const MAX_TOLERANCE_SECONDS = 3_600;
const MAX_SIGNED_BODY_BYTES = 4 * 1024 * 1024;
const MAX_TIMESTAMP_SECONDS = 999_999_999_999;

export const CUSTOMER_WEBHOOK_SIGNATURE_HEADER = "x-signalstack-signature";
export const CUSTOMER_WEBHOOK_TIMESTAMP_HEADER = "x-signalstack-timestamp";

export type CustomerWebhookSignatureInput = Readonly<{
  secret: string;
  timestampSeconds: number;
  rawBody: Buffer | Uint8Array;
}>;

export type CustomerWebhookVerificationInput = Readonly<{
  secret: string;
  timestampHeader: string;
  signatureHeader: string;
  rawBody: Buffer | Uint8Array;
  nowSeconds?: number;
  toleranceSeconds?: number;
}>;

/**
 * Signs the exact bytes sent on the wire. JSON parsing or re-serialization must never happen before this call.
 */
export function signCustomerWebhookPayload(input: CustomerWebhookSignatureInput): string {
  const secret = parseCustomerWebhookSigningSecret(input.secret);
  const timestamp = encodeTimestamp(input.timestampSeconds);
  const rawBody = requireRawBody(input.rawBody);
  const digest = computeDigest(secret, timestamp, rawBody);
  return `${SIGNATURE_VERSION}=${digest.toString("hex")}`;
}

/**
 * Constant-time receiver verification with a fail-closed timestamp window. The optional clock exists for
 * deterministic consumers and tests; production callers should normally use the default wall clock.
 */
export function verifyCustomerWebhookSignature(input: CustomerWebhookVerificationInput): boolean {
  let secret: Buffer;
  let rawBody: Buffer;
  try {
    secret = parseCustomerWebhookSigningSecret(input.secret);
    rawBody = requireRawBody(input.rawBody);
  } catch {
    return false;
  }

  const timestamp = parseTimestamp(input.timestampHeader);
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const toleranceSeconds = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const timestampIsValid =
    timestamp !== null &&
    Number.isSafeInteger(nowSeconds) &&
    nowSeconds >= 0 &&
    Number.isSafeInteger(toleranceSeconds) &&
    toleranceSeconds >= 0 &&
    toleranceSeconds <= MAX_TOLERANCE_SECONDS &&
    Math.abs(nowSeconds - timestamp) <= toleranceSeconds;

  const timestampText = timestamp === null ? "0" : input.timestampHeader;
  const expected = computeDigest(secret, timestampText, rawBody);
  const parsedSignature = parseSignatureHeader(input.signatureHeader);
  const candidate = parsedSignature ?? Buffer.alloc(SIGNATURE_BYTES);
  const signatureMatches = timingSafeEqual(expected, candidate);

  return timestampIsValid && parsedSignature !== null && signatureMatches;
}

export function customerWebhookTimestampSeconds(date: Date = new Date()): number {
  const milliseconds = date.getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new Error("Customer webhook request timestamp is invalid.");
  }
  return Math.floor(milliseconds / 1_000);
}

function computeDigest(secret: Buffer, timestamp: string, rawBody: Buffer): Buffer {
  return createHmac("sha256", secret)
    .update("signalstack/customer-webhook-signature/v1\0", "utf8")
    .update(timestamp, "ascii")
    .update(".", "ascii")
    .update(rawBody)
    .digest();
}

function encodeTimestamp(timestampSeconds: number): string {
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    timestampSeconds < 0 ||
    timestampSeconds > MAX_TIMESTAMP_SECONDS
  ) {
    throw new Error("Customer webhook request timestamp is invalid.");
  }
  return timestampSeconds.toString(10);
}

function parseTimestamp(value: string): number | null {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,11})$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= MAX_TIMESTAMP_SECONDS ? parsed : null;
}

function parseSignatureHeader(value: string): Buffer | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^v1=([a-f0-9]{64})$/.exec(value);
  return match ? Buffer.from(match[1], "hex") : null;
}

function requireRawBody(value: Buffer | Uint8Array): Buffer {
  if (!(Buffer.isBuffer(value) || value instanceof Uint8Array)) {
    throw new Error("Customer webhook body must be raw bytes.");
  }
  const body = Buffer.from(value);
  if (body.length > MAX_SIGNED_BODY_BYTES) {
    throw new Error("Customer webhook body exceeds the signing limit.");
  }
  return body;
}
