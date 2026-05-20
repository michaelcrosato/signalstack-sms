import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { recordWebhookEvent } from "@/lib/db/repositories/webhooks";
import {
  formDataToRecord,
  normalizeTwilioStatus,
  validateTwilioSignature
} from "@/lib/messaging/twilio-webhooks";
import { twilioWebhookPayloadSchema } from "@/lib/validation/webhooks";

export async function POST(request: Request) {
  const rawPayload = formDataToRecord(await request.formData());
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
  await recordWebhookEvent({
    orgId: current.orgId,
    provider: "twilio",
    eventType: "status",
    idempotencyKey: status.idempotencyKey,
    rawPayload
  });

  return new NextResponse(null, { status: 204 });
}
