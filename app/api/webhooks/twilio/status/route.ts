import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { recordWebhookEvent } from "@/lib/db/repositories/webhooks";
import {
  formDataToRecord,
  normalizeTwilioStatus,
  twilioStatusTransition,
  validateTwilioSignature
} from "@/lib/messaging/twilio-webhooks";
import { prisma } from "@/lib/db/prisma";
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
  const status = normalizeTwilioStatus(payload);
  if (!status) {
    return NextResponse.json({ error: "Invalid Twilio status payload." }, { status: 400 });
  }

  const current = await getOrCreateCurrentOrg();
  const { duplicate } = await recordWebhookEvent({
    orgId: current.orgId,
    provider: "twilio",
    eventType: "status",
    idempotencyKey: status.idempotencyKey,
    rawPayload
  });

  if (!duplicate) {
    await prisma.message.updateMany({
      where: {
        orgId: current.orgId,
        providerMessageId: status.providerMessageId
      },
      data: twilioStatusTransition(status)
    });
  }

  return new NextResponse(null, { status: 204 });
}
