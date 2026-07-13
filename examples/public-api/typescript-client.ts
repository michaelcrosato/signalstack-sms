import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

type JsonObject = Record<string, unknown>;

type PublicApiMeta = Readonly<{
  requestId: string;
  limit?: number;
  hasMore?: boolean;
  nextCursor?: string | null;
}>;

type PublicApiSuccessEnvelope<T> = Readonly<{
  ok: true;
  data: T;
  meta: PublicApiMeta;
}>;

type PublicApiErrorEnvelope = Readonly<{
  ok: false;
  error: Readonly<{ code: string; message: string; details?: unknown }>;
  meta: Readonly<{ requestId: string }>;
}>;

type PublicApiEnvelope<T> = PublicApiSuccessEnvelope<T> | PublicApiErrorEnvelope;

export type PublicApiResult<T> = Readonly<{
  data: T;
  meta: PublicApiMeta;
  status: number;
  replayed: boolean;
}>;

export type DirectMessageLifecycle = Readonly<{
  id: string;
  status: string;
  applicationStatus:
    | "ACCEPTED"
    | "SCHEDULED"
    | "PROCESSING"
    | "SENT"
    | "DELIVERED"
    | "FAILED"
    | "CANCELLED"
    | "AMBIGUOUS";
  transport: "dummy" | "twilio";
  attemptCount: number;
  latestAttemptStatus: string | null;
  latestAttemptNumber: number | null;
  requiresReview: boolean;
  mode: "dummy" | "provider";
}>;

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class SignalStackApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string | null,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "SignalStackApiError";
  }
}

/**
 * Dependency-free Node 22+ client for SignalStack's stable v1 envelope, cursor, and idempotency contract.
 * The API key is kept in memory and is never placed in a URL or written to output.
 */
export class SignalStackClient {
  readonly baseUrl: string;
  #apiKey: string;
  readonly #fetch: FetchImplementation;

  constructor(input: Readonly<{ baseUrl: string; apiKey: string; fetch?: FetchImplementation }>) {
    this.baseUrl = normalizeBaseUrl(input.baseUrl);
    this.#apiKey = requireApiKey(input.apiKey);
    this.#fetch = input.fetch ?? fetch;
  }

  async request<T>(
    path: string,
    options: Readonly<{
      method?: "GET" | "POST" | "PATCH" | "DELETE";
      body?: JsonObject;
      idempotencyKey?: string;
      requestId?: string;
    }> = {}
  ): Promise<PublicApiResult<T>> {
    const method = options.method ?? "GET";
    const headers = new Headers({
      Accept: "application/json",
      Authorization: `Bearer ${this.#apiKey}`
    });
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
    if (options.requestId) headers.set("X-Request-Id", options.requestId);

    const response = await this.#fetch(this.url(path), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const envelope = await parseEnvelope<T>(response);
    if (!envelope.ok) {
      throw new SignalStackApiError(
        response.status,
        envelope.error.code,
        envelope.error.message,
        envelope.meta.requestId,
        envelope.error.details
      );
    }
    return Object.freeze({
      data: envelope.data,
      meta: envelope.meta,
      status: response.status,
      replayed: response.headers.get("idempotency-replayed") === "true"
    });
  }

  /** Iterates an entire collection without decoding or modifying SignalStack's opaque cursor. */
  async *iterateCollection<T>(
    path: string,
    collectionField: string,
    limit = 50
  ): AsyncGenerator<T, void, undefined> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new RangeError("Collection limit must be between 1 and 100.");
    }
    let cursor: string | null = null;
    const seenCursors = new Set<string>();
    do {
      const query = new URLSearchParams({ limit: String(limit) });
      if (cursor) query.set("cursor", cursor);
      const result = await this.request<JsonObject>(`${path}?${query.toString()}`);
      const rows = result.data[collectionField];
      if (!Array.isArray(rows)) throw new TypeError(`Envelope data.${collectionField} must be an array.`);
      for (const row of rows) yield row as T;

      const nextCursor = result.meta.nextCursor;
      const hasMore = result.meta.hasMore === true;
      if (!hasMore) return;
      if (typeof nextCursor !== "string" || nextCursor.length === 0 || seenCursors.has(nextCursor)) {
        throw new TypeError("Paginated response contains an invalid or repeated nextCursor.");
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    } while (cursor);
  }

  async createContact(body: JsonObject, idempotencyKey: string) {
    return this.request<{ id: string }>("/api/v1/contacts", {
      method: "POST",
      body,
      idempotencyKey
    });
  }

  async submitMessage(body: JsonObject, idempotencyKey: string) {
    return this.request<{ message: DirectMessageLifecycle }>("/api/v1/messages", {
      method: "POST",
      body,
      idempotencyKey
    });
  }

  async cancelMessage(messageId: string, idempotencyKey: string) {
    return this.request<{ message: DirectMessageLifecycle }>(
      `/api/v1/messages/${encodeURIComponent(messageId)}/cancel`,
      { method: "POST", idempotencyKey }
    );
  }

  async getMessageStatus(messageId: string) {
    return this.request<{
      deliveryStatus: { messageId: string; status: string; mode: string };
    }>(`/api/v1/messages/${encodeURIComponent(messageId)}/status`);
  }

  async rotateCurrentKey(idempotencyKey: string) {
    const result = await this.request<{ token: string; credential: { id: string; prefix: string } }>(
      "/api/v1/api-keys/current/rotate",
      { method: "POST", idempotencyKey }
    );
    this.#apiKey = requireApiKey(result.data.token);
    return result;
  }

  async revokeCurrentKey(idempotencyKey: string) {
    return this.request<{ credential: { id: string; revokedAt: string | null } }>(
      "/api/v1/api-keys/current",
      { method: "DELETE", idempotencyKey }
    );
  }

  private url(path: string): string {
    if (!path.startsWith("/api/v1/") || path.startsWith("//")) {
      throw new TypeError("Client paths must be relative /api/v1/ paths.");
    }
    return `${this.baseUrl}${path}`;
  }
}

export async function runExampleFlow(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const apiKey = requireEnvironment(environment, "SIGNALSTACK_API_KEY");
  const baseUrl = environment.SIGNALSTACK_BASE_URL ?? "http://127.0.0.1:3000";
  const client = new SignalStackClient({ baseUrl, apiKey });
  const runId = randomUUID();
  const contactBody = {
    phone: environment.SIGNALSTACK_EXAMPLE_PHONE ?? `+1555${Date.now().toString().slice(-7)}`,
    displayName: "M3 local integration example",
    consentStatus: "OPTED_IN",
    optInSource: "documented_local_example",
    consentCapturedAt: new Date().toISOString(),
    consentMethod: "documented_test_fixture",
    consentDisclosure: "Local dummy-provider integration example; no carrier message is sent."
  };
  const contact = await client.createContact(contactBody, `contact:${runId}`);
  const messageBody = {
    contactId: contact.data.id,
    body: "SignalStack dummy integration message. No carrier call is made."
  };
  const messageKey = `message:${runId}`;
  const firstMessage = await client.submitMessage(messageBody, messageKey);
  const retriedMessage = await client.submitMessage(messageBody, messageKey);
  if (firstMessage.data.message.id !== retriedMessage.data.message.id) {
    throw new Error("Idempotent message retry returned a different message ID.");
  }
  if (
    firstMessage.data.message.transport !== "dummy" ||
    firstMessage.data.message.applicationStatus !== "SENT" ||
    firstMessage.data.message.attemptCount !== 1 ||
    firstMessage.data.message.latestAttemptStatus !== "SUCCEEDED" ||
    firstMessage.data.message.requiresReview
  ) {
    throw new Error("Example must run against the deterministic dummy lifecycle.");
  }
  const status = await client.getMessageStatus(firstMessage.data.message.id);

  // Exercise cursor iteration while leaving the cursor opaque.
  for await (const row of client.iterateCollection<{ id: string }>("/api/v1/contacts", "contacts", 25)) {
    if (row.id === contact.data.id) break;
  }

  const previousKey = apiKey;
  const rotated = await client.rotateCurrentKey(`rotate:${runId}`);
  await expectInvalidKey(new SignalStackClient({ baseUrl, apiKey: previousKey }));
  await client.revokeCurrentKey(`revoke:${runId}`);
  await expectInvalidKey(new SignalStackClient({ baseUrl, apiKey: rotated.data.token }));

  console.log(
    JSON.stringify({
      contactId: contact.data.id,
      messageId: firstMessage.data.message.id,
      messageMode: firstMessage.data.message.mode,
      applicationStatus: firstMessage.data.message.applicationStatus,
      transport: firstMessage.data.message.transport,
      attemptCount: firstMessage.data.message.attemptCount,
      requiresReview: firstMessage.data.message.requiresReview,
      deliveryStatus: status.data.deliveryStatus.status,
      idempotencyReplayed: retriedMessage.replayed,
      priorKeyDeniedAfterRotation: true,
      rotatedKeyDeniedAfterRevocation: true
    })
  );
}

async function expectInvalidKey(client: SignalStackClient): Promise<void> {
  try {
    await client.request("/api/v1/api-keys/current");
  } catch (error) {
    if (error instanceof SignalStackApiError && error.status === 401 && error.code === "INVALID_API_KEY") return;
    throw error;
  }
  throw new Error("Expected the API key to be denied.");
}

async function parseEnvelope<T>(response: Response): Promise<PublicApiEnvelope<T>> {
  const text = await response.text();
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new SignalStackApiError(response.status, "INVALID_RESPONSE", "Response was not JSON.", null);
  }
  if (!isObject(value) || typeof value.ok !== "boolean" || !isObject(value.meta)) {
    throw new SignalStackApiError(response.status, "INVALID_RESPONSE", "Response envelope was invalid.", null);
  }
  const requestId = typeof value.meta.requestId === "string" ? value.meta.requestId : null;
  if (response.headers.get("x-request-id") !== requestId) {
    throw new SignalStackApiError(response.status, "INVALID_RESPONSE", "Request ID evidence was inconsistent.", requestId);
  }
  if (value.ok === true && "data" in value) return value as PublicApiSuccessEnvelope<T>;
  if (value.ok === false && isObject(value.error) && typeof value.error.code === "string" && typeof value.error.message === "string") {
    return value as PublicApiErrorEnvelope;
  }
  throw new SignalStackApiError(response.status, "INVALID_RESPONSE", "Response envelope was invalid.", requestId);
}

function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  if (!(["http:", "https:"] as const).includes(parsed.protocol as "http:" | "https:")) {
    throw new TypeError("SIGNALSTACK_BASE_URL must use http or https.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new TypeError("SIGNALSTACK_BASE_URL cannot contain credentials, query, or fragment.");
  }
  return parsed.toString().replace(/\/$/, "");
}

function requireApiKey(value: string): string {
  if (!/^ss_api_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new TypeError("SIGNALSTACK_API_KEY is missing or malformed.");
  }
  return value;
}

function requireEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  runExampleFlow().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "SignalStack example failed.");
    process.exitCode = 1;
  });
}
