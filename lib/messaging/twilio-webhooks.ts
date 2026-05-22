import { createHmac, timingSafeEqual } from "node:crypto";
import type { TwilioWebhookPayload } from "@/lib/validation/webhooks";

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
  const payload: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") {
      return null;
    }
    payload[key] = value;
  }
  return payload;
}

export function validateTwilioSignature(input: {
  authToken?: string;
  signature?: string | null;
  url: string;
  params: Record<string, string>;
}) {
  if (!input.authToken || !input.signature) {
    return false;
  }

  const base = Object.keys(input.params)
    .sort()
    .reduce((value, key) => `${value}${key}${input.params[key]}`, input.url);
  const expected = createHmac("sha1", input.authToken).update(base).digest("base64");

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(input.signature);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
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
  if (!providerMessageId || !rawStatus) {
    return null;
  }

  const status = rawStatus.toLowerCase();

  const errorCode = normalizeOptionalProviderValue(payload.ErrorCode);

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
    ...(status === "failed" || status === "undelivered" ? { deliveredAt: null, failedAt: now } : {})
  };
}
