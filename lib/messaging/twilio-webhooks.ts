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
  deliveredAt?: Date;
  failedAt?: Date;
};

export function formDataToRecord(formData: FormData): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    payload[key] = typeof value === "string" ? value : value.name;
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
  const providerMessageId = payload.MessageSid ?? payload.SmsSid;
  if (!payload.From || !payload.Body || !providerMessageId) {
    return null;
  }

  return {
    from: payload.From,
    to: payload.To,
    body: payload.Body,
    providerMessageId,
    idempotencyKey: `twilio:inbound:${providerMessageId}`
  };
}

export function normalizeTwilioStatus(payload: TwilioWebhookPayload): NormalizedTwilioStatus | null {
  const providerMessageId = payload.MessageSid ?? payload.SmsSid;
  const rawStatus = payload.MessageStatus ?? payload.SmsStatus;
  if (!providerMessageId || !rawStatus) {
    return null;
  }

  const status = rawStatus.trim().toLowerCase();
  if (!status) {
    return null;
  }

  return {
    providerMessageId,
    status,
    errorCode: payload.ErrorCode,
    idempotencyKey: `twilio:status:${providerMessageId}:${status}:${payload.ErrorCode ?? "none"}`
  };
}

export function twilioStatusTransition(input: { status: string; errorCode?: string; now?: Date }): MessageStatusTransition {
  const status = input.status.toLowerCase();
  const now = input.now ?? new Date();

  return {
    providerStatus: status,
    providerErrorCode: input.errorCode ?? null,
    ...(status === "delivered" ? { deliveredAt: now } : {}),
    ...(status === "failed" || status === "undelivered" ? { failedAt: now } : {})
  };
}
