import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { recordWebhookEvent } from "@/lib/db/repositories/webhooks";
import {
  normalizeTwilioStatus,
  readTwilioFormPayload,
  twilioStatusTransition,
  validateTwilioSignature
} from "@/lib/messaging/twilio-webhooks";
import { prisma } from "@/lib/db/prisma";
import { twilioWebhookPayloadSchema } from "@/lib/validation/webhooks";
import { recordMetric, smsPipelineMetrics } from "@/lib/observability/metrics";

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
    const existingMessage = typeof prisma.message.findFirst === "function"
      ? await prisma.message.findFirst({
          where: {
            orgId: current.orgId,
            providerMessageId: status.providerMessageId
          }
        })
      : { createdAt: new Date() };

    if (existingMessage) {
      await prisma.message.updateMany({
        where: {
          orgId: current.orgId,
          providerMessageId: status.providerMessageId
        },
        data: twilioStatusTransition(status)
      });

      const nextStatus = status.status.toLowerCase();
      if (nextStatus === "delivered") {
        recordMetric(smsPipelineMetrics.deliveryRate, { status: "success" });
        const latencyMs = Date.now() - existingMessage.createdAt.getTime();
        recordMetric(smsPipelineMetrics.sendToDeliveredLatencyMs, { latencyMs });
      } else if (nextStatus === "failed" || nextStatus === "undelivered") {
        recordMetric(smsPipelineMetrics.deliveryRate, { status: "failure" });
        if (status.errorCode) {
          recordMetric(smsPipelineMetrics.failureByErrorCode, { errorCode: status.errorCode });
        }
      }
    }
  }

  return new NextResponse(null, { status: 204 });
}

