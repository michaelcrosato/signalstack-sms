import { createHmac, timingSafeEqual } from "node:crypto";
import {
  isTerminalDeliveryFailureProviderStatus,
  terminalDeliveryFailureProviderStatuses
} from "@/lib/messaging/delivery-status";
import type { TwilioWebhookPayload } from "@/lib/validation/webhooks";
import { recordMetric, smsPipelineMetrics } from "@/lib/observability/metrics";

export type NormalizedTwilioInbound = {
  from: string;
  to?: string;
  body: string;
  providerMessageId: string;
  idempotencyKey: string;
};

export type NormalizedTwilioStatus = {
  providerMessageId: string;
  status: string;
  errorCode?: string;
  idempotencyKey: string;
};

export type MessageStatusTransition = {
  providerStatus: string;
  providerErrorCode: string | null;
  deliveredAt?: Date | null;
  failedAt?: Date | null;
};

export type MessageStatusUpdateGuard = {
  deliveredAt?: null;
  failedAt?: null;
  OR: Array<
    | { providerStatus: null }
    | { providerStatus: { in: string[] } }
    | { providerStatus: { notIn: string[] } }
  >;
};

const twilioProgressiveStatusGroups: readonly (readonly string[])[] = [
  ["scheduled", "accepted"],
  ["queued", "receiving"],
  ["sending"],
  ["sent"],
  ["delivered", "received"],
  ["read"]
] as const;
const twilioKnownStatuses = [
  ...twilioProgressiveStatusGroups.flat(),
  ...terminalDeliveryFailureProviderStatuses
];
const twilioTerminalStatuses = new Set<string>([
  "delivered",
  "received",
  "read",
  ...terminalDeliveryFailureProviderStatuses
]);
const twilioEarlyStatuses = twilioProgressiveStatusGroups.slice(0, 2).flat();
const MAX_TWILIO_FORM_BYTES = 64 * 1024;
const MAX_TWILIO_FORM_FIELDS = 256;
const MAX_TWILIO_FORM_KEY_BYTES = 256;
const MAX_TWILIO_FORM_VALUE_BYTES = 16 * 1024;

function normalizeRequiredProviderValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function firstRequiredProviderValue(...values: Array<string | undefined>) {
  for (const value of values) {
    const normalized = normalizeRequiredProviderValue(value);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

function normalizeOptionalProviderValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function formDataToRecord(formData: FormData): Record<string, string> | null {
  const payload: Record<string, string> = Object.create(null) as Record<string, string>;
  let fieldCount = 0;
  for (const [key, value] of formData.entries()) {
    fieldCount += 1;
    if (
      fieldCount > MAX_TWILIO_FORM_FIELDS ||
      typeof value !== "string" ||
      !validFormEntry(key, value)
    ) {
      return null;
    }
    if (Object.hasOwn(payload, key)) {
      return null;
    }
    payload[key] = value;
  }
  return payload;
}

export async function readTwilioFormPayload(request: Request): Promise<Record<string, string> | null> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    return null;
  }
  const contentLength = request.headers.get("content-length");
  if (
    contentLength &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_TWILIO_FORM_BYTES)
  ) {
    return null;
  }

  try {
    const body = await readBoundedRequestBody(request, MAX_TWILIO_FORM_BYTES);
    if (body === null) return null;
    return parseUrlEncodedForm(body);
  } catch {
    return null;
  }
}

function parseUrlEncodedForm(body: Uint8Array): Record<string, string> | null {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(body);
  const pairs = source.length === 0 ? [] : source.split("&");
  if (pairs.length > MAX_TWILIO_FORM_FIELDS) return null;
  const payload: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const pair of pairs) {
    const separator = pair.indexOf("=");
    const encodedKey = separator === -1 ? pair : pair.slice(0, separator);
    const encodedValue = separator === -1 ? "" : pair.slice(separator + 1);
    const key = decodeFormComponent(encodedKey);
    const value = decodeFormComponent(encodedValue);
    if (key === null || value === null || !validFormEntry(key, value) || Object.hasOwn(payload, key)) {
      return null;
    }
    payload[key] = value;
  }
  return payload;
}

function decodeFormComponent(value: string): string | null {
  try {
    return decodeURIComponent(value.replaceAll("+", " "));
  } catch {
    return null;
  }
}

function validFormEntry(key: string, value: string): boolean {
  return (
    Buffer.byteLength(key, "utf8") > 0 &&
    Buffer.byteLength(key, "utf8") <= MAX_TWILIO_FORM_KEY_BYTES &&
    Buffer.byteLength(value, "utf8") <= MAX_TWILIO_FORM_VALUE_BYTES
  );
}

async function readBoundedRequestBody(
  request: Request,
  maximumBytes: number
): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function validateTwilioSignature(input: {
  authToken?: string;
  signature?: string | null;
  url: string;
  params: Record<string, string>;
}) {
  if (!input.authToken || !input.signature) {
    recordMetric(smsPipelineMetrics.webhookVerificationFailureRate, {
      status: "fail",
      reason: "missing"
    });
    return false;
  }

  const base = Object.keys(input.params)
    .sort()
    .reduce((value, key) => `${value}${key}${input.params[key]}`, input.url);
  const expected = createHmac("sha1", input.authToken).update(base).digest("base64");

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(input.signature);
  
  const isValid = expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
  
  if (isValid) {
    recordMetric(smsPipelineMetrics.webhookVerificationFailureRate, {
      status: "pass"
    });
  } else {
    recordMetric(smsPipelineMetrics.webhookVerificationFailureRate, {
      status: "fail",
      reason: "mismatch"
    });
  }

  return isValid;
}


export function normalizeTwilioInbound(payload: TwilioWebhookPayload): NormalizedTwilioInbound | null {
  const providerMessageId = firstRequiredProviderValue(payload.MessageSid, payload.SmsSid);
  const from = normalizeRequiredProviderValue(payload.From);
  const to = normalizeOptionalProviderValue(payload.To);
  const rawBody = payload.Body;
  const body = normalizeRequiredProviderValue(rawBody);
  if (!from || !rawBody || !body || !providerMessageId) {
    return null;
  }

  return {
    from,
    to,
    body: rawBody,
    providerMessageId,
    idempotencyKey: `twilio:inbound:${providerMessageId}`
  };
}

export function normalizeTwilioStatus(payload: TwilioWebhookPayload): NormalizedTwilioStatus | null {
  const providerMessageId = firstRequiredProviderValue(payload.MessageSid, payload.SmsSid);
  const rawStatus = firstRequiredProviderValue(payload.MessageStatus, payload.SmsStatus);
  if (
    !providerMessageId ||
    providerMessageId.length > 191 ||
    !rawStatus ||
    rawStatus.length > 64
  ) {
    return null;
  }

  const status = rawStatus.toLowerCase();

  const errorCode = normalizeOptionalProviderValue(payload.ErrorCode);
  if (errorCode && errorCode.length > 128) return null;

  return {
    providerMessageId,
    status,
    errorCode,
    idempotencyKey: `twilio:status:${providerMessageId}:${status}:${errorCode ?? "none"}`
  };
}

export function twilioStatusTransition(input: { status: string; errorCode?: string; now?: Date }): MessageStatusTransition {
  const status = input.status.trim().toLowerCase();
  const errorCode = normalizeOptionalProviderValue(input.errorCode);
  const now = input.now ?? new Date();

  return {
    providerStatus: status,
    providerErrorCode: errorCode ?? null,
    ...(status === "delivered" ? { deliveredAt: now, failedAt: null } : {}),
    ...(isTerminalDeliveryFailureProviderStatus(status) ? { deliveredAt: null, failedAt: now } : {})
  };
}

/**
 * Builds an atomic Prisma update guard for an out-of-order Twilio callback.
 *
 * Known statuses may advance from an earlier known status or from a provider status that this
 * version does not yet recognize. Unknown statuses are retained only while the message is still
 * in an early, non-terminal state. Terminal success and failure timestamps also guard against an
 * unknown status accidentally reopening a completed delivery.
 */
export function twilioStatusUpdateGuard(nextStatusInput: string): MessageStatusUpdateGuard {
  const nextStatus = nextStatusInput.trim().toLowerCase();
  const progressiveGroupIndex = twilioProgressiveStatusGroups.findIndex((statuses) =>
    statuses.includes(nextStatus)
  );
  const isFailure = isTerminalDeliveryFailureProviderStatus(nextStatus);

  let allowedKnownStatuses: string[];
  if (isFailure) {
    allowedKnownStatuses = [
      ...twilioProgressiveStatusGroups.slice(0, 4).flat(),
      nextStatus
    ];
  } else if (progressiveGroupIndex >= 0) {
    allowedKnownStatuses = [
      ...twilioProgressiveStatusGroups.slice(0, progressiveGroupIndex + 1).flat()
    ];

    if (twilioTerminalStatuses.has(nextStatus)) {
      allowedKnownStatuses = allowedKnownStatuses.filter(
        (status) =>
          !twilioTerminalStatuses.has(status) ||
          status === nextStatus ||
          (nextStatus === "read" && (status === "delivered" || status === "received"))
      );
    }
  } else {
    allowedKnownStatuses = [...twilioEarlyStatuses];
  }

  return {
    ...(isFailure ? { deliveredAt: null } : {}),
    ...(!isFailure && twilioTerminalStatuses.has(nextStatus) ? { failedAt: null } : {}),
    ...(!twilioTerminalStatuses.has(nextStatus) ? { deliveredAt: null, failedAt: null } : {}),
    OR: [
      { providerStatus: null },
      { providerStatus: { in: allowedKnownStatuses } },
      { providerStatus: { notIn: [...twilioKnownStatuses] } }
    ]
  };
}
