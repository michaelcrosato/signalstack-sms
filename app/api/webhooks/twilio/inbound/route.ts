import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { createDemoInboundMessage } from "@/lib/db/repositories/inbox";
import {
  markWebhookEventProcessed,
  recordWebhookEvent,
  releaseWebhookEventClaim
} from "@/lib/db/repositories/webhooks";
import {
  normalizeTwilioInbound,
  readTwilioFormPayload,
  validateTwilioSignature
} from "@/lib/messaging/twilio-webhooks";
import { twilioWebhookPayloadSchema } from "@/lib/validation/webhooks";

export async function POST(request: Request) {
  const rawPayload = await readTwilioFormPayload(request);
  if (!rawPayload) {
    return NextResponse.json({ error: "Invalid Twilio form payload." }, { status: 400 });
  }

  const signatureValid = validateTwilioSignature({
    authToken: process.env.TWILIO_AUTH_TOKEN,
    signature: request.headers.get("x-twilio-signature"),
    url: request.url,
    params: rawPayload
  });
  if (!signatureValid) {
    return NextResponse.json({ error: "Invalid Twilio signature." }, { status: 403 });
  }

  const payload = twilioWebhookPayloadSchema.parse(rawPayload);
  const inbound = normalizeTwilioInbound(payload);
  if (!inbound) {
    return NextResponse.json({ error: "Invalid Twilio inbound payload." }, { status: 400 });
  }

  const current = await getOrCreateCurrentOrg();
  const recorded = await recordWebhookEvent({
    orgId: current.orgId,
    provider: "twilio",
    eventType: "inbound",
    idempotencyKey: inbound.idempotencyKey,
    rawPayload
  });

  if (!recorded.claimed) {
    if (recorded.outcome === "in_progress") {
      return new NextResponse(null, {
        status: 409,
        headers: { "Retry-After": String(recorded.retryAfterSeconds) }
      });
    }

    return new NextResponse(null, { status: 204 });
  }

  try {
    await createDemoInboundMessage(
      current.orgId,
      {
        phone: inbound.from,
        body: inbound.body,
        providerMessageId: inbound.providerMessageId,
        idempotencyKey: inbound.idempotencyKey
      },
      { analyzeSentiment: false, sendKeywordAutoReply: false }
    );

    const completed = await markWebhookEventProcessed(
      current.orgId,
      recorded.event.id,
      recorded.claimToken
    );
    if (completed.count !== 1) {
      throw new Error("Webhook event claim was lost before inbound processing completed.");
    }
  } catch (error) {
    await releaseWebhookEventClaim(current.orgId, recorded.event.id, recorded.claimToken);
    throw error;
  }

  return new NextResponse(null, { status: 204 });
}
