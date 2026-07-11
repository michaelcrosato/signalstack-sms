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
    if (Object.hasOwn(payload, key)) {
      return null;
    }
    payload[key] = value;
  }
  return payload;
}

export async function readTwilioFormPayload(request: Request): Promise<Record<string, string> | null> {
  try {
    return formDataToRecord(await request.formData());
  } catch {
    return null;
  }
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
