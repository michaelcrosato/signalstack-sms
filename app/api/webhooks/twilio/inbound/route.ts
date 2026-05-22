import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { createDemoInboundMessage } from "@/lib/db/repositories/inbox";
import { recordWebhookEvent } from "@/lib/db/repositories/webhooks";
import {
  formDataToRecord,
  normalizeTwilioInbound,
  validateTwilioSignature
} from "@/lib/messaging/twilio-webhooks";
import { twilioWebhookPayloadSchema } from "@/lib/validation/webhooks";

export async function POST(request: Request) {
  const rawPayload = formDataToRecord(await request.formData());
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
  const { duplicate } = await recordWebhookEvent({
    orgId: current.orgId,
    provider: "twilio",
    eventType: "inbound",
    idempotencyKey: inbound.idempotencyKey,
    rawPayload
  });

  if (!duplicate) {
    await createDemoInboundMessage(current.orgId, {
      phone: inbound.from,
      body: inbound.body,
      providerMessageId: inbound.providerMessageId,
      idempotencyKey: inbound.idempotencyKey
    });
  }

  return new NextResponse(null, { status: 204 });
}
