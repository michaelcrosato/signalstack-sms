import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { liveTestSmsConfirmation } from "@/lib/messaging/live-test-sms-constants";

export { liveTestSmsConfirmation };

export type LiveTestSmsEnv = Record<string, string | undefined>;

export type LiveTestSmsStatus = {
  enabled: boolean;
  allowedRecipients: string[];
  fromNumber: string | null;
  blockers: string[];
};

export type LiveTestSmsSendInput = {
  orgId: string;
  actorUserId: string;
  to: string;
  body: string;
  confirmation: string;
  env?: LiveTestSmsEnv;
};

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
  return (env.LIVE_TEST_SMS_TO_ALLOWLIST ?? "")
    .split(",")
    .map((value) => normalizeNorthAmericanPhone(value))
    .filter((value) => /^\+[1-9]\d{4,31}$/.test(value));
}

export function getLiveTestSmsStatus(env: LiveTestSmsEnv = process.env): LiveTestSmsStatus {
  const allowedRecipients = parseLiveTestSmsAllowlist(env);
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
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
    blockers.push("TWILIO_ENV_CREDENTIALS_INCOMPLETE");
  }
  if (allowedRecipients.length === 0) {
    blockers.push("LIVE_TEST_SMS_ALLOWLIST_EMPTY");
  }

  return {
    enabled: blockers.length === 0,
    allowedRecipients,
    fromNumber: env.TWILIO_FROM_NUMBER ? normalizeNorthAmericanPhone(env.TWILIO_FROM_NUMBER) : null,
    blockers
  };
}

export async function sendLiveTestSms(input: LiveTestSmsSendInput) {
  const env = input.env ?? process.env;
  const status = getLiveTestSmsStatus(env);
  const to = normalizeNorthAmericanPhone(input.to);
  const body = input.body.trim();
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

  const providerResult = await sendTwilioSms({
    accountSid,
    authToken,
    from,
    to,
    body
  });
  const idempotencyKey = `live-test-sms:${input.orgId}:${randomUUID()}`;

  await prisma.$transaction([
    prisma.message.create({
      data: {
        orgId: input.orgId,
        direction: "OUTBOUND",
        body,
        providerMessageId: providerResult.sid,
        providerStatus: providerResult.status,
        idempotencyKey
      }
    }),
    prisma.liveReadinessAuditEvent.create({
      data: {
        orgId: input.orgId,
        actorUserId: input.actorUserId,
        action: "LIVE_TEST_SMS_SENT",
        subjectType: "Message",
        subjectId: providerResult.sid,
        metadata: {
          provider: "twilio",
          toLast4: to.slice(-4),
          fromLast4: from.slice(-4),
          bodyLength: body.length,
          providerStatus: providerResult.status
        }
      }
    })
  ]);

  return {
    sent: true,
    providerMessageId: providerResult.sid,
    providerStatus: providerResult.status,
    toLast4: to.slice(-4),
    fromLast4: from.slice(-4),
    blockers: []
  };
}

async function sendTwilioSms(input: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
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
    })
  });
  const payload = (await response.json().catch(() => ({}))) as {
    sid?: string;
    status?: string;
    message?: string;
    code?: number;
  };

  if (!response.ok || !payload.sid) {
    throw new Error(`Twilio live test SMS failed: ${payload.code ?? response.status} ${payload.message ?? response.statusText}`);
  }

  return {
    sid: payload.sid,
    status: normalizeTwilioMessageStatus(payload.status)
  };
}
