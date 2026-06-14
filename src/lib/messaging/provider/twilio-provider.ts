import { evaluateMessagingHardGate } from "@/lib/compliance/gates";
import { prisma } from "@/lib/db/prisma";
import { normalizeNorthAmericanPhone } from "@/lib/messaging/live-test-sms";
import type { MessagingProvider, MessageSendInput, MessageSendResult } from "./types";

export const twilioProvider: MessagingProvider = {
  name: "twilio",
  async send(input: MessageSendInput): Promise<MessageSendResult> {
    const org = await prisma.organization.findUnique({
      where: { id: input.orgId },
      include: { complianceProfile: true }
    });

    const liveMessagingEnabled = process.env.LIVE_MESSAGING_ENABLED === "true";
    const demoMode = org ? org.demoMode : true;

    // Evaluate messaging hard gate
    const gate = evaluateMessagingHardGate({
      demoMode,
      liveMessagingEnabled,
      messagingProvider: "twilio",
      complianceProfile: org?.complianceProfile
    });

    if (!gate.allowed) {
      return {
        providerMessageId: `blocked_${input.idempotencyKey}`,
        status: "blocked"
      };
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER || input.from;

    if (!accountSid || !authToken || !from) {
      throw new Error("TWILIO_ENV_CREDENTIALS_INCOMPLETE");
    }

    const toNormalized = normalizeNorthAmericanPhone(input.to);
    const fromNormalized = normalizeNorthAmericanPhone(from);

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          To: toNormalized,
          From: fromNormalized,
          Body: input.body
        })
      }
    );

    const payload = (await response.json().catch(() => ({}))) as {
      sid?: string;
      status?: string;
      message?: string;
      code?: number;
    };

    if (!response.ok || !payload.sid) {
      throw new Error(
        `Twilio send failed: ${payload.code ?? response.status} ${payload.message ?? response.statusText}`
      );
    }

    const normalizedStatus = payload.status?.trim().toLowerCase() === "accepted" ? "accepted" : "queued";

    return {
      providerMessageId: payload.sid,
      status: normalizedStatus as "queued" | "blocked" // We treat accepted/queued as queued for type compatibility
    };
  }
};
