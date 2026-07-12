import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { LiveReadinessAuditEvent, Message, Prisma } from "@prisma/client";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import { isTerminalDeliveryFailureProviderStatus } from "@/lib/messaging/delivery-status";

export const liveTestSmsConfirmation = "SEND LIVE TEST";

export type LiveTestSmsEnv = Record<string, string | undefined>;

export type LiveTestSmsStatus = {
  enabled: boolean;
  allowedRecipientCount: number;
  allowedRecipientLast4: string[];
  fromNumberConfigured: boolean;
  fromNumberLast4: string | null;
  blockers: string[];
};

type LiveTestSmsConfiguration = LiveTestSmsStatus & {
  allowedRecipients: string[];
  fromNumber: string | null;
  operatorToken: string | null;
};

export type LiveTestSmsSendInput = {
  orgId: string;
  actorUserId: string;
  requestId: string;
  to: string;
  body: string;
  confirmation: string;
  operatorToken: string;
  env?: LiveTestSmsEnv;
};

export type LiveTestSmsSendResult =
  | {
      sent: false;
      blockers: string[];
    }
  | {
      sent: true;
      duplicate: boolean;
      providerMessageId: string;
      providerStatus: string;
      toLast4: string;
      fromLast4: string;
      blockers: [];
    }
  | {
      sent: false;
      duplicate: boolean;
      pending: true;
      providerStatus: string;
      toLast4: string;
      fromLast4: string;
      blockers: [];
    }
  | {
      sent: false;
      duplicate: boolean;
      failed: true;
      providerStatus: string;
      providerErrorCode: string;
      error: string;
      toLast4: string;
      fromLast4: string;
      blockers: [];
    }
  | {
      sent: false;
      duplicate: true;
      conflict: true;
      error: string;
      blockers: [];
    };

type StoredLiveTestSmsMessage = Pick<
  Message,
  "id" | "providerMessageId" | "providerStatus" | "providerErrorCode" | "failedAt"
>;

type StoredReservationAudit = Pick<LiveReadinessAuditEvent, "actorUserId" | "metadata">;

type LiveTestSmsReservationMetadata = {
  requestFingerprintVersion: "hmac-sha256-v2";
  requestFingerprint: string;
  toLast4: string;
  fromLast4: string;
};

class DefinitiveTwilioLiveTestSmsError extends Error {
  constructor(readonly providerErrorCode: string) {
    super("Twilio live test SMS failed.");
  }
}

const LIVE_TEST_SMS_OPERATOR_TOKEN_MIN_LENGTH = 32;
const LIVE_TEST_SMS_OPERATOR_TOKEN_MAX_LENGTH = 256;
const LIVE_TEST_SMS_TIMEOUT_DEFAULT_MS = 5_000;
const LIVE_TEST_SMS_TIMEOUT_MIN_MS = 1_000;
const LIVE_TEST_SMS_TIMEOUT_MAX_MS = 10_000;

export function normalizeNorthAmericanPhone(value: string) {
  const trimmed = value.trim();
  if (/^\+[1-9]\d{4,31}$/.test(trimmed)) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return trimmed;
}

function normalizeTwilioMessageStatus(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized || "queued";
}

export function parseLiveTestSmsAllowlist(env: LiveTestSmsEnv = process.env) {
  return [
    ...new Set(
      (env.LIVE_TEST_SMS_TO_ALLOWLIST ?? "")
        .split(",")
        .map((value) => normalizeNorthAmericanPhone(value))
        .filter((value) => /^\+[1-9]\d{4,31}$/.test(value))
    )
  ];
}

export function getLiveTestSmsStatus(env: LiveTestSmsEnv = process.env): LiveTestSmsStatus {
  const configuration = getLiveTestSmsConfiguration(env);

  return {
    enabled: configuration.enabled,
    allowedRecipientCount: configuration.allowedRecipientCount,
    allowedRecipientLast4: configuration.allowedRecipientLast4,
    fromNumberConfigured: configuration.fromNumberConfigured,
    fromNumberLast4: configuration.fromNumberLast4,
    blockers: configuration.blockers
  };
}

function getLiveTestSmsConfiguration(env: LiveTestSmsEnv): LiveTestSmsConfiguration {
  const allowedRecipients = parseLiveTestSmsAllowlist(env);
  const fromNumber = env.TWILIO_FROM_NUMBER ? normalizeNorthAmericanPhone(env.TWILIO_FROM_NUMBER) : null;
  const fromNumberConfigured = Boolean(fromNumber && /^\+[1-9]\d{4,31}$/.test(fromNumber));
  const operatorToken = getConfiguredOperatorToken(env);
  const blockers: string[] = [];

  if (env.LIVE_TEST_SMS_ENABLED !== "true") {
    blockers.push("LIVE_TEST_SMS_DISABLED");
  }
  if (env.LIVE_MESSAGING_ENABLED !== "true") {
    blockers.push("LIVE_MESSAGING_DISABLED");
  }
  if (env.MESSAGING_PROVIDER !== "twilio") {
    blockers.push("TWILIO_PROVIDER_NOT_SELECTED");
  }
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !fromNumberConfigured) {
    blockers.push("TWILIO_ENV_CREDENTIALS_INCOMPLETE");
  }
  if (allowedRecipients.length === 0) {
    blockers.push("LIVE_TEST_SMS_ALLOWLIST_EMPTY");
  }
  if (!operatorToken) {
    blockers.push("LIVE_TEST_SMS_OPERATOR_TOKEN_INVALID");
  }

  return {
    enabled: blockers.length === 0,
    allowedRecipientCount: allowedRecipients.length,
    allowedRecipientLast4: allowedRecipients.map((recipient) => recipient.slice(-4)),
    fromNumberConfigured,
    fromNumberLast4: fromNumberConfigured && fromNumber ? fromNumber.slice(-4) : null,
    blockers,
    allowedRecipients,
    fromNumber: fromNumberConfigured ? fromNumber : null,
    operatorToken
  };
}

export async function sendLiveTestSms(input: LiveTestSmsSendInput): Promise<LiveTestSmsSendResult> {
  const env = input.env ?? process.env;
  const status = getLiveTestSmsConfiguration(env);
  const to = normalizeNorthAmericanPhone(input.to);
  const body = input.body.trim();
  const idempotencyKey = `live-test-sms:${input.requestId.trim().toLowerCase()}`;

  if (!status.operatorToken) {
    return {
      sent: false,
      blockers: ["LIVE_TEST_SMS_OPERATOR_TOKEN_INVALID"]
    };
  }
  if (!constantTimeSecretEqual(input.operatorToken, status.operatorToken)) {
    return {
      sent: false,
      blockers: ["LIVE_TEST_SMS_OPERATOR_AUTH_FAILED"]
    };
  }

  const requestFingerprint = createRequestFingerprint({
    actorUserId: input.actorUserId,
    to,
    body,
    secret: status.operatorToken
  });
  const messageWhere = {
    orgId_idempotencyKey: {
      orgId: input.orgId,
      idempotencyKey
    }
  };
  const existingResult = await withTenantTransaction({ orgId: input.orgId }, async (tx) => {
    const existingMessage = await tx.message.findUnique({ where: messageWhere });
    return existingMessage
      ? getStoredLiveTestSmsResult(tx, {
          orgId: input.orgId,
          actorUserId: input.actorUserId,
          message: existingMessage,
          requestFingerprint
        })
      : null;
  });
  if (existingResult) {
    return existingResult;
  }

  const blockers = [...status.blockers];

  if (!/^\+[1-9]\d{4,31}$/.test(to)) {
    blockers.push("RECIPIENT_PHONE_INVALID");
  }
  if (!status.allowedRecipients.includes(to)) {
    blockers.push("RECIPIENT_NOT_ALLOWLISTED");
  }
  if (body.length < 1 || body.length > 320) {
    blockers.push("MESSAGE_BODY_INVALID");
  }
  if (input.confirmation.trim() !== liveTestSmsConfirmation) {
    blockers.push("LIVE_TEST_CONFIRMATION_MISMATCH");
  }

  if (blockers.length > 0) {
    return {
      sent: false,
      blockers
    };
  }

  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const from = status.fromNumber;

  if (!accountSid || !authToken || !from) {
    return {
      sent: false,
      blockers: ["TWILIO_ENV_CREDENTIALS_INCOMPLETE"]
    };
  }

  const messageId = randomUUID();
  let reservedMessage: Pick<Message, "id">;
  try {
    reservedMessage = await withTenantTransaction({ orgId: input.orgId }, async (tx) => {
      const message = await tx.message.create({
        data: {
          id: messageId,
          orgId: input.orgId,
          direction: "OUTBOUND",
          body,
          providerStatus: "live_test_reserved",
          idempotencyKey
        },
        select: { id: true }
      });
      await tx.liveReadinessAuditEvent.create({
        data: {
          orgId: input.orgId,
          actorUserId: input.actorUserId,
          action: "LIVE_TEST_SMS_RESERVED",
          subjectType: "Message",
          subjectId: messageId,
          metadata: {
            requestFingerprintVersion: "hmac-sha256-v2",
            requestFingerprint,
            toLast4: to.slice(-4),
            fromLast4: from.slice(-4),
            bodyLength: body.length
          }
        }
      });
      return message;
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const racedResult = await withTenantTransaction({ orgId: input.orgId }, async (tx) => {
      const racedMessage = await tx.message.findUnique({ where: messageWhere });
      return racedMessage
        ? getStoredLiveTestSmsResult(tx, {
            orgId: input.orgId,
            actorUserId: input.actorUserId,
            message: racedMessage,
            requestFingerprint
          })
        : null;
    });
    if (!racedResult) {
      throw error;
    }
    return racedResult;
  }

  let providerResult: Awaited<ReturnType<typeof sendTwilioSms>>;
  try {
    providerResult = await sendTwilioSms({
      accountSid,
      authToken,
      from,
      to,
      body,
      timeoutMs: getLiveTestSmsTimeoutMs(env)
    });
  } catch (error) {
    if (!(error instanceof DefinitiveTwilioLiveTestSmsError)) {
      return pendingResult({ duplicate: false, to, from });
    }

    try {
      await markLiveTestSmsFailed({
        orgId: input.orgId,
        messageId: reservedMessage.id,
        providerStatus: "failed",
        providerErrorCode: error.providerErrorCode
      });
    } catch {
      return pendingResult({ duplicate: false, to, from });
    }

    return failedResult({
      duplicate: false,
      providerStatus: "failed",
      providerErrorCode: error.providerErrorCode,
      to,
      from
    });
  }

  if (isTerminalDeliveryFailureProviderStatus(providerResult.status)) {
    const providerErrorCode = `TWILIO_STATUS_${providerResult.status.toUpperCase()}`;
    try {
      await markLiveTestSmsFailed({
        orgId: input.orgId,
        messageId: reservedMessage.id,
        providerMessageId: providerResult.sid,
        providerStatus: providerResult.status,
        providerErrorCode
      });
    } catch {
      return pendingResult({ duplicate: false, to, from });
    }

    return failedResult({
      duplicate: false,
      providerStatus: providerResult.status,
      providerErrorCode,
      to,
      from
    });
  }

  try {
    await withTenantTransaction({ orgId: input.orgId }, async (tx) => {
      await tx.message.update({
        where: { id: reservedMessage.id, orgId: input.orgId },
        data: {
          providerMessageId: providerResult.sid,
          providerStatus: providerResult.status,
          providerErrorCode: null,
          failedAt: null
        }
      });
      await tx.liveReadinessAuditEvent.create({
        data: {
          orgId: input.orgId,
          actorUserId: input.actorUserId,
          action: "LIVE_TEST_SMS_SENT",
          subjectType: "Message",
          subjectId: reservedMessage.id,
          metadata: {
            provider: "twilio",
            toLast4: to.slice(-4),
            fromLast4: from.slice(-4),
            bodyLength: body.length,
            providerStatus: providerResult.status
          }
        }
      });
    });
  } catch {
    return pendingResult({ duplicate: false, to, from });
  }

  return {
    sent: true,
    duplicate: false,
    providerMessageId: providerResult.sid,
    providerStatus: providerResult.status,
    toLast4: to.slice(-4),
    fromLast4: from.slice(-4),
    blockers: []
  };
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function getConfiguredOperatorToken(env: LiveTestSmsEnv) {
  const token = env.LIVE_TEST_SMS_OPERATOR_TOKEN;
  if (
    !token ||
    token.length < LIVE_TEST_SMS_OPERATOR_TOKEN_MIN_LENGTH ||
    token.length > LIVE_TEST_SMS_OPERATOR_TOKEN_MAX_LENGTH ||
    token.trim() !== token
  ) {
    return null;
  }

  return token;
}

function constantTimeSecretEqual(candidate: string, expected: string) {
  const candidateDigest = createHash("sha256").update(candidate, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

function createRequestFingerprint(input: { actorUserId: string; to: string; body: string; secret: string }) {
  return createHmac("sha256", input.secret)
    .update(JSON.stringify(["live-test-sms:v1", input.actorUserId, input.to, input.body]), "utf8")
    .digest("hex");
}

function getLiveTestSmsTimeoutMs(env: LiveTestSmsEnv) {
  const configured = env.LIVE_TEST_SMS_TIMEOUT_MS?.trim();
  const parsed = Number(configured || LIVE_TEST_SMS_TIMEOUT_DEFAULT_MS);
  if (!Number.isFinite(parsed)) {
    return LIVE_TEST_SMS_TIMEOUT_DEFAULT_MS;
  }

  return Math.min(LIVE_TEST_SMS_TIMEOUT_MAX_MS, Math.max(LIVE_TEST_SMS_TIMEOUT_MIN_MS, Math.trunc(parsed)));
}

async function markLiveTestSmsFailed(input: {
  orgId: string;
  messageId: string;
  providerMessageId?: string;
  providerStatus: string;
  providerErrorCode: string;
}) {
  await withTenantTransaction({ orgId: input.orgId }, (tx) => tx.message.update({
    where: { id: input.messageId, orgId: input.orgId },
    data: {
      ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
      providerStatus: input.providerStatus,
      providerErrorCode: input.providerErrorCode,
      failedAt: new Date()
    }
  }));
}

function pendingResult(input: { duplicate: boolean; to: string; from: string }): LiveTestSmsSendResult {
  return {
    sent: false,
    duplicate: input.duplicate,
    pending: true,
    providerStatus: "live_test_reserved",
    toLast4: input.to.slice(-4),
    fromLast4: input.from.slice(-4),
    blockers: []
  };
}

function failedResult(input: {
  duplicate: boolean;
  providerStatus: string;
  providerErrorCode: string;
  to: string;
  from: string;
}): LiveTestSmsSendResult {
  return {
    sent: false,
    duplicate: input.duplicate,
    failed: true,
    providerStatus: input.providerStatus,
    providerErrorCode: input.providerErrorCode,
    error: "Twilio live test SMS failed.",
    toLast4: input.to.slice(-4),
    fromLast4: input.from.slice(-4),
    blockers: []
  };
}

async function getStoredLiveTestSmsResult(tx: Prisma.TransactionClient, input: {
  orgId: string;
  actorUserId: string;
  message: StoredLiveTestSmsMessage;
  requestFingerprint: string;
}): Promise<LiveTestSmsSendResult> {
  const reservationAudit = await tx.liveReadinessAuditEvent.findFirst({
    where: {
      orgId: input.orgId,
      action: "LIVE_TEST_SMS_RESERVED",
      subjectType: "Message",
      subjectId: input.message.id
    },
    orderBy: { createdAt: "asc" },
    select: {
      actorUserId: true,
      metadata: true
    }
  });
  const reservationMetadata = parseReservationMetadata(reservationAudit);

  if (
    reservationAudit?.actorUserId !== input.actorUserId ||
    !reservationMetadata ||
    !constantTimeSecretEqual(reservationMetadata.requestFingerprint, input.requestFingerprint)
  ) {
    return {
      sent: false,
      duplicate: true,
      conflict: true,
      error: "Idempotency key cannot be reused for this live test SMS request.",
      blockers: []
    };
  }

  return resultFromStoredMessage(input.message, reservationMetadata);
}

function parseReservationMetadata(audit: StoredReservationAudit | null): LiveTestSmsReservationMetadata | null {
  if (!audit?.metadata || typeof audit.metadata !== "object" || Array.isArray(audit.metadata)) {
    return null;
  }

  const metadata = audit.metadata as Prisma.JsonObject;
  const requestFingerprintVersion = metadata.requestFingerprintVersion;
  const requestFingerprint = metadata.requestFingerprint;
  const toLast4 = metadata.toLast4;
  const fromLast4 = metadata.fromLast4;
  if (
    requestFingerprintVersion !== "hmac-sha256-v2" ||
    typeof requestFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(requestFingerprint) ||
    typeof toLast4 !== "string" ||
    !/^\d{4}$/.test(toLast4) ||
    typeof fromLast4 !== "string" ||
    !/^\d{4}$/.test(fromLast4)
  ) {
    return null;
  }

  return { requestFingerprintVersion, requestFingerprint, toLast4, fromLast4 };
}

function resultFromStoredMessage(
  message: StoredLiveTestSmsMessage,
  reservationMetadata: LiveTestSmsReservationMetadata
): LiveTestSmsSendResult {
  const providerStatus = normalizeTwilioMessageStatus(message.providerStatus ?? undefined);
  if (message.failedAt || isTerminalDeliveryFailureProviderStatus(providerStatus)) {
    return {
      sent: false,
      duplicate: true,
      failed: true,
      providerStatus,
      providerErrorCode: message.providerErrorCode ?? `TWILIO_STATUS_${providerStatus.toUpperCase()}`,
      error: "Twilio live test SMS failed.",
      toLast4: reservationMetadata.toLast4,
      fromLast4: reservationMetadata.fromLast4,
      blockers: []
    };
  }

  if (message.providerMessageId) {
    return {
      sent: true,
      duplicate: true,
      providerMessageId: message.providerMessageId,
      providerStatus: message.providerStatus ?? "queued",
      toLast4: reservationMetadata.toLast4,
      fromLast4: reservationMetadata.fromLast4,
      blockers: []
    };
  }

  return {
    sent: false,
    duplicate: true,
    pending: true,
    providerStatus: message.providerStatus ?? "live_test_reserved",
    toLast4: reservationMetadata.toLast4,
    fromLast4: reservationMetadata.fromLast4,
    blockers: []
  };
}

async function sendTwilioSms(input: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
  timeoutMs: number;
}) {
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(input.accountSid)}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${input.accountSid}:${input.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      To: input.to,
      From: input.from,
      Body: input.body
    }),
    signal: AbortSignal.timeout(input.timeoutMs)
  });
  const payload = (await response.json().catch(() => ({}))) as {
    sid?: string;
    status?: string;
    message?: string;
    code?: number;
  };

  if (
    !response.ok &&
    response.status >= 400 &&
    response.status < 500 &&
    !payload.sid &&
    typeof payload.code === "number" &&
    Number.isInteger(payload.code)
  ) {
    throw new DefinitiveTwilioLiveTestSmsError(`TWILIO_${payload.code}`);
  }
  if (!response.ok || !payload.sid) {
    throw new Error("Twilio response outcome is unknown.");
  }

  return {
    sid: payload.sid,
    status: normalizeTwilioMessageStatus(payload.status)
  };
}
