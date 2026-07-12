import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNING_DOMAIN = "signalstack/customer-webhook-signature/v1\0";
const DEFAULT_TOLERANCE_SECONDS = 300;
const MAX_BODY_BYTES = 1024 * 1024;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,190}$/;
const SIGNATURE_PATTERN = /^v1=([a-f0-9]{64})$/;
const SECRET_PATTERN = /^whsec_([A-Za-z0-9_-]{43})$/;
const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/;

const requiredHeaders = [
  "content-type",
  "x-signalstack-event-id",
  "x-signalstack-event-type",
  "x-signalstack-delivery-id",
  "x-signalstack-timestamp",
  "x-signalstack-secret-version",
  "x-signalstack-signature"
] as const;

export type CustomerWebhookEvent = Readonly<{
  apiVersion: string;
  id: string;
  type: string;
  occurredAt: string;
  data: unknown;
}>;

export type VerifiedCustomerWebhook = Readonly<{
  eventId: string;
  eventType: string;
  deliveryId: string;
  secretVersion: number;
  event: CustomerWebhookEvent;
}>;

export class CustomerWebhookVerificationError extends Error {
  constructor(message = "Customer webhook verification failed.") {
    super(message);
    this.name = "CustomerWebhookVerificationError";
  }
}

/**
 * Verify exact request bytes before JSON parsing. `rawHeaders` must come from Node's IncomingMessage so
 * duplicate security headers can be rejected before a framework folds them together.
 */
export function verifyCustomerWebhookRequest(input: Readonly<{
  rawHeaders: readonly string[];
  rawBody: Buffer | Uint8Array;
  secretsByVersion: ReadonlyMap<number, string>;
  nowSeconds?: number;
  toleranceSeconds?: number;
}>): VerifiedCustomerWebhook {
  const headers = readRequiredSingleHeaders(input.rawHeaders);
  if (headers["content-type"].split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new CustomerWebhookVerificationError();
  }

  const rawBody = Buffer.from(input.rawBody);
  if (rawBody.length > MAX_BODY_BYTES) throw new CustomerWebhookVerificationError();
  const timestampText = headers["x-signalstack-timestamp"];
  const timestamp = parseCanonicalPositiveInteger(timestampText, true);
  const secretVersion = parseCanonicalPositiveInteger(headers["x-signalstack-secret-version"], false);
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const toleranceSeconds = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const timestampValid =
    Number.isSafeInteger(nowSeconds) &&
    nowSeconds >= 0 &&
    Number.isSafeInteger(toleranceSeconds) &&
    toleranceSeconds >= 0 &&
    toleranceSeconds <= 3_600 &&
    Math.abs(nowSeconds - timestamp) <= toleranceSeconds;

  const secretText = input.secretsByVersion.get(secretVersion) ?? "";
  const secret = parseSigningSecret(secretText);
  const expected = secret
    ? createHmac("sha256", secret)
        .update(SIGNING_DOMAIN, "utf8")
        .update(timestampText, "ascii")
        .update(".", "ascii")
        .update(rawBody)
        .digest()
    : Buffer.alloc(32);
  const signatureMatch = SIGNATURE_PATTERN.exec(headers["x-signalstack-signature"]);
  const candidate = signatureMatch ? Buffer.from(signatureMatch[1], "hex") : Buffer.alloc(32);
  const signatureValid = timingSafeEqual(expected, candidate);
  if (!timestampValid || !secret || !signatureMatch || !signatureValid) {
    throw new CustomerWebhookVerificationError();
  }

  const eventId = headers["x-signalstack-event-id"];
  const eventType = headers["x-signalstack-event-type"];
  const deliveryId = headers["x-signalstack-delivery-id"];
  if (
    !IDENTIFIER_PATTERN.test(eventId) ||
    !IDENTIFIER_PATTERN.test(deliveryId) ||
    !EVENT_TYPE_PATTERN.test(eventType)
  ) {
    throw new CustomerWebhookVerificationError();
  }

  // Parsing is intentionally after constant-time signature verification over the untouched body bytes.
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString("utf8")) as unknown;
  } catch {
    throw new CustomerWebhookVerificationError();
  }
  if (!isCustomerWebhookEvent(parsed) || parsed.id !== eventId || parsed.type !== eventType) {
    throw new CustomerWebhookVerificationError();
  }

  return Object.freeze({ eventId, eventType, deliveryId, secretVersion, event: parsed });
}

export function headersRecordToRawHeaders(
  headers: Readonly<Record<string, string>>
): readonly string[] {
  return Object.freeze(Object.entries(headers).flatMap(([name, value]) => [name, value]));
}

/** Example-only memory dedupe. Production receivers need a durable unique event-ID claim before effects. */
export class InMemoryEventDeduplicator {
  readonly #seen = new Set<string>();

  claim(eventId: string): boolean {
    if (!IDENTIFIER_PATTERN.test(eventId)) throw new TypeError("Event ID is invalid.");
    if (this.#seen.has(eventId)) return false;
    this.#seen.add(eventId);
    return true;
  }
}

export function parseWebhookSecretsEnvironment(environment: NodeJS.ProcessEnv): ReadonlyMap<number, string> {
  const encoded = environment.SIGNALSTACK_WEBHOOK_SECRETS_JSON;
  if (encoded) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(encoded) as unknown;
    } catch {
      throw new Error("SIGNALSTACK_WEBHOOK_SECRETS_JSON must be a JSON object.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("SIGNALSTACK_WEBHOOK_SECRETS_JSON must be a JSON object.");
    }
    const result = new Map<number, string>();
    for (const [versionText, secret] of Object.entries(parsed)) {
      const version = parseCanonicalPositiveInteger(versionText, false);
      if (typeof secret !== "string" || !parseSigningSecret(secret)) {
        throw new Error("SIGNALSTACK_WEBHOOK_SECRETS_JSON contains an invalid signing secret.");
      }
      result.set(version, secret);
    }
    if (result.size < 1) throw new Error("At least one webhook signing secret is required.");
    return result;
  }

  const secret = environment.SIGNALSTACK_WEBHOOK_SECRET;
  const versionText = environment.SIGNALSTACK_WEBHOOK_SECRET_VERSION ?? "1";
  if (!secret || !parseSigningSecret(secret)) throw new Error("SIGNALSTACK_WEBHOOK_SECRET is required.");
  return new Map([[parseCanonicalPositiveInteger(versionText, false), secret]]);
}

function readRequiredSingleHeaders(rawHeaders: readonly string[]): Record<(typeof requiredHeaders)[number], string> {
  if (rawHeaders.length % 2 !== 0) throw new CustomerWebhookVerificationError();
  const values = new Map<string, string[]>();
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index]?.toLowerCase();
    const value = rawHeaders[index + 1];
    if (!name || value === undefined) throw new CustomerWebhookVerificationError();
    const existing = values.get(name) ?? [];
    existing.push(value);
    values.set(name, existing);
  }
  const result = {} as Record<(typeof requiredHeaders)[number], string>;
  for (const name of requiredHeaders) {
    const matches = values.get(name);
    if (!matches || matches.length !== 1 || hasControlCharacter(matches[0])) {
      throw new CustomerWebhookVerificationError();
    }
    result[name] = matches[0];
  }
  return result;
}

function parseSigningSecret(value: string): Buffer | null {
  const match = SECRET_PATTERN.exec(value);
  if (!match) return null;
  const decoded = Buffer.from(match[1], "base64url");
  return decoded.length === 32 && decoded.toString("base64url") === match[1] ? decoded : null;
}

function parseCanonicalPositiveInteger(value: string, allowZero: boolean): number {
  if (!/^(0|[1-9]\d{0,11})$/.test(value)) throw new CustomerWebhookVerificationError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
    throw new CustomerWebhookVerificationError();
  }
  return parsed;
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}

function isCustomerWebhookEvent(value: unknown): value is CustomerWebhookEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.apiVersion === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(event.apiVersion) &&
    typeof event.id === "string" &&
    typeof event.type === "string" &&
    typeof event.occurredAt === "string" &&
    Number.isFinite(Date.parse(event.occurredAt)) &&
    Object.hasOwn(event, "data")
  );
}
