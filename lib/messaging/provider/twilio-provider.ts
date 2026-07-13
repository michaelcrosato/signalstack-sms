import { createHmac, timingSafeEqual } from "node:crypto";
import {
  providerMessageCreateSchema,
  twilioAccountApiResponseSchema,
  twilioAccountSidSchema,
  twilioAuthTokenSchema,
  twilioErrorApiResponseSchema,
  twilioMessageApiResponseSchema,
  twilioMessageSidSchema,
  twilioMessagingServiceListApiResponseSchema,
  twilioPhoneNumberListApiResponseSchema
} from "@/lib/validation/provider";
import { normalizeProviderMessageStatus } from "./status";
import type {
  MessageSendInput,
  MessageSendResult,
  ProviderAccountRecord,
  ProviderAdapter,
  ProviderCredentials,
  ProviderErrorClassification,
  ProviderHealth,
  ProviderMessageCreateInput,
  ProviderMessageCreateResult,
  ProviderMessageRecord,
  ProviderOperation,
  ProviderSignatureValidationInput
} from "./types";

const TWILIO_API_ORIGIN = "https://api.twilio.com";
const TWILIO_MESSAGING_ORIGIN = "https://messaging.twilio.com";
const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 250;
const MAX_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 262_144;
const DISCOVERY_PAGE_SIZE = 100;

export type TwilioProviderDependencies = Readonly<{
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  now?: () => Date;
}>;

export class TwilioProviderRequestError extends Error {
  readonly safeCode: string;
  readonly operation: ProviderOperation;
  readonly httpStatus: number | null;
  readonly providerCode: string | null;
  readonly outcomeUnknown: boolean;

  constructor(input: {
    safeCode: string;
    operation: ProviderOperation;
    httpStatus?: number | null;
    providerCode?: string | null;
    outcomeUnknown?: boolean;
  }) {
    super("Twilio provider operation failed.");
    this.name = "TwilioProviderRequestError";
    this.safeCode = input.safeCode;
    this.operation = input.operation;
    this.httpStatus = input.httpStatus ?? null;
    this.providerCode = input.providerCode ?? null;
    this.outcomeUnknown = input.outcomeUnknown ?? false;
  }
}

export function createTwilioProvider(
  credentials: ProviderCredentials,
  dependencies: TwilioProviderDependencies = {}
): ProviderAdapter {
  const parsedAccountSid = twilioAccountSidSchema.safeParse(credentials.externalAccountId);
  const parsedToken = twilioAuthTokenSchema.safeParse(credentials.token);
  if (!parsedAccountSid.success || !parsedToken.success) {
    throw new TwilioProviderRequestError({
      safeCode: "TWILIO_CREDENTIALS_INVALID",
      operation: "verify_account"
    });
  }

  const accountSid = parsedAccountSid.data;
  const authToken = parsedToken.data;
  const fetchImplementation = dependencies.fetch ?? globalThis.fetch;
  const timeoutMs = normalizeTimeout(dependencies.timeoutMs);
  const now = dependencies.now ?? (() => new Date());

  async function request(
    operation: ProviderOperation,
    url: URL,
    init: Readonly<{ method: "GET" | "POST"; body?: URLSearchParams }>
  ): Promise<unknown> {
    assertTwilioUrl(url);
    let response: Response;
    try {
      response = await fetchImplementation(url, {
        method: init.method,
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`, "utf8").toString("base64")}`,
          ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
        },
        body: init.body,
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch {
      throw providerRequestError({
        safeCode: "TWILIO_NETWORK_ERROR",
        operation,
        outcomeUnknown: operation === "create_message"
      });
    }

    const payload = await readBoundedJson(response, operation);
    if (!response.ok) {
      const parsedError = twilioErrorApiResponseSchema.safeParse(payload);
      const validatedProviderError = parsedError.success && parsedError.data.code !== undefined;
      const providerCode = validatedProviderError
        ? `TWILIO_${parsedError.data.code}`
        : null;
      const responseContainsMessageId = parsedError.success && Boolean(parsedError.data.sid);
      throw providerRequestError({
        safeCode:
          response.status === 401 || response.status === 403
            ? "TWILIO_CREDENTIALS_INVALID"
            : providerCode ?? `TWILIO_HTTP_${response.status}`,
        operation,
        httpStatus: response.status,
        providerCode,
        outcomeUnknown:
          operation === "create_message" &&
          (responseContainsMessageId || response.status >= 500 || !validatedProviderError)
      });
    }

    if (payload === null) {
      throw providerRequestError({
        safeCode: "TWILIO_RESPONSE_INVALID",
        operation,
        httpStatus: response.status,
        outcomeUnknown: operation === "create_message"
      });
    }
    return payload;
  }

  async function createMessage(
    input: ProviderMessageCreateInput
  ): Promise<ProviderMessageCreateResult> {
    const parsed = providerMessageCreateSchema.safeParse(input);
    if (!parsed.success) {
      throw providerRequestError({
        safeCode: "TWILIO_INPUT_INVALID",
        operation: "create_message"
      });
    }

    const body = new URLSearchParams();
    body.set("To", parsed.data.to);
    if (parsed.data.from) {
      body.set("From", parsed.data.from);
    } else {
      body.set("MessagingServiceSid", parsed.data.messagingServiceId!);
    }
    if (parsed.data.body) {
      body.set("Body", parsed.data.body);
    }
    for (const mediaUrl of parsed.data.mediaUrls) {
      body.append("MediaUrl", mediaUrl);
    }
    if (parsed.data.statusCallbackUrl) {
      body.set("StatusCallback", parsed.data.statusCallbackUrl);
    }

    const payload = await request(
      "create_message",
      new URL(`/2010-04-01/Accounts/${accountSid}/Messages.json`, TWILIO_API_ORIGIN),
      { method: "POST", body }
    );
    const message = parseMessageResponse(payload, "create_message");
    if (
      message.account_sid !== accountSid ||
      message.to !== parsed.data.to ||
      (parsed.data.from && message.from !== parsed.data.from) ||
      (parsed.data.messagingServiceId &&
        message.messaging_service_sid !== parsed.data.messagingServiceId)
    ) {
      throw providerRequestError({
        safeCode: "TWILIO_RESPONSE_MISMATCH",
        operation: "create_message",
        outcomeUnknown: true
      });
    }
    return projectMessage(message);
  }

  async function fetchMessage(input: { providerMessageId: string }): Promise<ProviderMessageRecord> {
    const providerMessageId = parseMessageSid(input.providerMessageId, "fetch_message");
    const payload = await request(
      "fetch_message",
      new URL(
        `/2010-04-01/Accounts/${accountSid}/Messages/${providerMessageId}.json`,
        TWILIO_API_ORIGIN
      ),
      { method: "GET" }
    );
    const message = parseMessageResponse(payload, "fetch_message");
    if (message.sid !== providerMessageId || message.account_sid !== accountSid) {
      throw providerRequestError({
        safeCode: "TWILIO_RESPONSE_MISMATCH",
        operation: "fetch_message"
      });
    }
    return Object.freeze({
      ...projectMessage(message),
      createdAt: normalizeProviderDate(message.date_created),
      sentAt: normalizeProviderDate(message.date_sent)
    });
  }

  async function verifyAccount(): Promise<ProviderAccountRecord> {
    const payload = await request(
      "verify_account",
      new URL(`/2010-04-01/Accounts/${accountSid}.json`, TWILIO_API_ORIGIN),
      { method: "GET" }
    );
    const result = twilioAccountApiResponseSchema.safeParse(payload);
    if (!result.success || result.data.sid !== accountSid) {
      throw providerRequestError({
        safeCode: "TWILIO_RESPONSE_MISMATCH",
        operation: "verify_account"
      });
    }
    return Object.freeze({
      externalAccountId: result.data.sid,
      friendlyName: result.data.friendly_name ?? null,
      status: normalizeAccountStatus(result.data.status)
    });
  }

  async function discoverPhoneNumbers() {
    const url = new URL(
      `/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
      TWILIO_API_ORIGIN
    );
    url.searchParams.set("PageSize", String(DISCOVERY_PAGE_SIZE));
    const payload = await request("discover_phone_numbers", url, { method: "GET" });
    const result = twilioPhoneNumberListApiResponseSchema.safeParse(payload);
    if (!result.success || result.data.incoming_phone_numbers.some((number) => number.account_sid !== accountSid)) {
      throw providerRequestError({
        safeCode: "TWILIO_RESPONSE_MISMATCH",
        operation: "discover_phone_numbers"
      });
    }
    return Object.freeze(
      result.data.incoming_phone_numbers.map((number) =>
        Object.freeze({
          externalNumberId: number.sid,
          externalAccountId: number.account_sid,
          phoneNumber: number.phone_number,
          friendlyName: number.friendly_name ?? null,
          capabilities: Object.freeze({
            sms: number.capabilities.sms,
            mms: number.capabilities.mms
          })
        })
      )
    );
  }

  async function discoverMessagingServices() {
    const url = new URL("/v1/Services", TWILIO_MESSAGING_ORIGIN);
    url.searchParams.set("PageSize", String(DISCOVERY_PAGE_SIZE));
    const payload = await request("discover_messaging_services", url, { method: "GET" });
    const result = twilioMessagingServiceListApiResponseSchema.safeParse(payload);
    if (!result.success || result.data.services.some((service) => service.account_sid !== accountSid)) {
      throw providerRequestError({
        safeCode: "TWILIO_RESPONSE_MISMATCH",
        operation: "discover_messaging_services"
      });
    }
    return Object.freeze(
      result.data.services.map((service) =>
        Object.freeze({
          externalServiceId: service.sid,
          externalAccountId: service.account_sid,
          friendlyName: service.friendly_name ?? null
        })
      )
    );
  }

  function classifyError(error: unknown, operation: ProviderOperation): ProviderErrorClassification {
    if (!(error instanceof TwilioProviderRequestError)) {
      return Object.freeze({
        disposition: operation === "create_message" ? "ambiguous" : "terminal",
        retryable: false,
        safeCode: "TWILIO_INTERNAL_ERROR",
        providerCode: null
      });
    }

    if (error.outcomeUnknown) {
      return Object.freeze({
        disposition: "ambiguous",
        retryable: false,
        safeCode: error.safeCode,
        providerCode: error.providerCode
      });
    }
    if (error.httpStatus === 429 || (error.httpStatus !== null && error.httpStatus >= 500)) {
      return Object.freeze({
        disposition: "retryable",
        retryable: true,
        safeCode: error.safeCode,
        providerCode: error.providerCode
      });
    }
    if (
      operation !== "create_message" &&
      (error.safeCode === "TWILIO_NETWORK_ERROR" || error.safeCode === "TWILIO_RESPONSE_INVALID")
    ) {
      return Object.freeze({
        disposition: "retryable",
        retryable: true,
        safeCode: error.safeCode,
        providerCode: error.providerCode
      });
    }
    return Object.freeze({
      disposition: "terminal",
      retryable: false,
      safeCode: error.safeCode,
      providerCode: error.providerCode
    });
  }

  function validateSignature(input: ProviderSignatureValidationInput): boolean {
    if (!validSignatureInput(input)) {
      return false;
    }
    const base = Object.keys(input.params)
      .sort()
      .reduce((value, key) => `${value}${key}${input.params[key]}`, input.url);
    const expected = createHmac("sha1", authToken).update(base, "utf8").digest("base64");
    const expectedBuffer = Buffer.from(expected, "utf8");
    const actualBuffer = Buffer.from(input.signature!, "utf8");
    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
  }

  async function getHealth(): Promise<ProviderHealth> {
    try {
      const account = await verifyAccount();
      const healthy = account.status === "active";
      return Object.freeze({
        healthy,
        checkedAt: now().toISOString(),
        safeCode: healthy ? "PROVIDER_HEALTHY" : "PROVIDER_CREDENTIALS_INVALID"
      });
    } catch (error) {
      const classified = classifyError(error, "health");
      return Object.freeze({
        healthy: false,
        checkedAt: now().toISOString(),
        safeCode:
          classified.safeCode === "TWILIO_CREDENTIALS_INVALID"
            ? "PROVIDER_CREDENTIALS_INVALID"
            : "PROVIDER_UNAVAILABLE"
      });
    }
  }

  async function send(input: MessageSendInput): Promise<MessageSendResult> {
    const result = await createMessage({
      orgId: input.orgId,
      to: input.to,
      from: input.from,
      body: input.body,
      idempotencyKey: input.idempotencyKey
    });
    return {
      providerMessageId: result.providerMessageId,
      status: ["failed", "undelivered", "canceled"].includes(result.status.status)
        ? "blocked"
        : "queued"
    };
  }

  return Object.freeze({
    name: "twilio" as const,
    externalAccountId: accountSid,
    send,
    createMessage,
    fetchMessage,
    normalizeStatus: normalizeProviderMessageStatus,
    classifyError,
    validateSignature,
    verifyAccount,
    discoverPhoneNumbers,
    discoverMessagingServices,
    getHealth
  });
}

function projectMessage(
  message: ReturnType<typeof twilioMessageApiResponseSchema.parse>
): ProviderMessageCreateResult {
  return Object.freeze({
    providerMessageId: message.sid,
    externalAccountId: message.account_sid,
    status: normalizeProviderMessageStatus(message.status),
    to: message.to,
    from: message.from ?? null,
    messagingServiceId: message.messaging_service_sid ?? null,
    providerErrorCode:
      message.error_code === null || message.error_code === undefined
        ? null
        : `TWILIO_${message.error_code}`
  });
}

function parseMessageResponse(
  payload: unknown,
  operation: "create_message" | "fetch_message"
): ReturnType<typeof twilioMessageApiResponseSchema.parse> {
  const result = twilioMessageApiResponseSchema.safeParse(payload);
  if (!result.success) {
    throw providerRequestError({
      safeCode: "TWILIO_RESPONSE_INVALID",
      operation,
      outcomeUnknown: operation === "create_message"
    });
  }
  return result.data;
}

function parseMessageSid(value: string, operation: ProviderOperation): string {
  const result = twilioMessageSidSchema.safeParse(value);
  if (!result.success) {
    throw providerRequestError({ safeCode: "TWILIO_INPUT_INVALID", operation });
  }
  return result.data;
}

function normalizeAccountStatus(value: string): ProviderAccountRecord["status"] {
  const normalized = value.trim().toLowerCase();
  return normalized === "active" || normalized === "suspended" || normalized === "closed"
    ? normalized
    : "unknown";
}

function normalizeProviderDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeTimeout(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(value)));
}

function assertTwilioUrl(url: URL): void {
  const validOrigin = url.origin === TWILIO_API_ORIGIN || url.origin === TWILIO_MESSAGING_ORIGIN;
  if (!validOrigin || url.username || url.password || url.protocol !== "https:") {
    throw new Error("Twilio provider URL is invalid.");
  }
}

async function readBoundedJson(response: Response, operation: ProviderOperation): Promise<unknown | null> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_RESPONSE_BYTES) {
    throw providerRequestError({
      safeCode: "TWILIO_RESPONSE_TOO_LARGE",
      operation,
      httpStatus: response.status,
      outcomeUnknown: operation === "create_message"
    });
  }
  const reader = response.body?.getReader();
  if (!reader) {
    return null;
  }
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      totalBytes += chunk.value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw providerRequestError({
          safeCode: "TWILIO_RESPONSE_TOO_LARGE",
          operation,
          httpStatus: response.status,
          outcomeUnknown: operation === "create_message"
        });
      }
      chunks.push(chunk.value);
    }
  } catch (error) {
    if (error instanceof TwilioProviderRequestError) {
      throw error;
    }
    throw providerRequestError({
      safeCode: "TWILIO_RESPONSE_INVALID",
      operation,
      httpStatus: response.status,
      outcomeUnknown: operation === "create_message"
    });
  } finally {
    reader.releaseLock();
  }
  if (totalBytes === 0) {
    return null;
  }
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  try {
    const value = JSON.parse(bytes.toString("utf8")) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function validSignatureInput(input: ProviderSignatureValidationInput): boolean {
  if (
    typeof input.signature !== "string" ||
    input.signature.length < 1 ||
    input.signature.length > 256 ||
    typeof input.url !== "string" ||
    input.url.length < 1 ||
    input.url.length > 2_048
  ) {
    return false;
  }
  try {
    const url = new URL(input.url);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      return false;
    }
  } catch {
    return false;
  }
  const entries = Object.entries(input.params);
  if (entries.length > 256) {
    return false;
  }
  return entries.every(
    ([key, value]) =>
      key.length > 0 &&
      key.length <= 256 &&
      !hasControlCharacter(key) &&
      typeof value === "string" &&
      Buffer.byteLength(value, "utf8") <= 16_384
  );
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => (character.codePointAt(0) ?? 0) < 32);
}

function providerRequestError(input: ConstructorParameters<typeof TwilioProviderRequestError>[0]) {
  return new TwilioProviderRequestError(input);
}
