import { NextResponse } from "next/server";
import {
  markWebhookEventProcessed,
  recordWebhookEvent,
  releaseWebhookEventClaim,
  updateMessageFromTwilioStatus
} from "@/lib/db/repositories/webhooks";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import {
  assertProviderCallbackBindingActive,
  authenticateTwilioProviderCallback,
  createProviderCallbackFailureResponse
} from "@/lib/integrations/provider-accounts/webhook-routing";
import {
  normalizeTwilioStatus,
  readTwilioFormPayload
} from "@/lib/messaging/twilio-webhooks";
import { isTerminalDeliveryFailureProviderStatus } from "@/lib/messaging/delivery-status";
import { twilioWebhookPayloadSchema } from "@/lib/validation/webhooks";
import { recordMetric, smsPipelineMetrics } from "@/lib/observability/metrics";

export async function POST(request: Request) {
  const rawPayload = await readTwilioFormPayload(request);
  if (!rawPayload) {
    return NextResponse.json({ error: "Invalid Twilio form payload." }, { status: 400 });
  }

  let binding;
  try {
    binding = await authenticateTwilioProviderCallback({
      kind: "status",
      signature: request.headers.get("x-twilio-signature"),
      url: request.url,
      params: rawPayload
    });
  } catch (error) {
    return createProviderCallbackFailureResponse(error);
  }

  const payload = twilioWebhookPayloadSchema.parse(rawPayload);
  const status = normalizeTwilioStatus(payload);
  if (!status) {
    return NextResponse.json({ error: "Invalid Twilio status payload." }, { status: 400 });
  }

  return withTenantTransaction({ orgId: binding.orgId }, async (tx) => {
    try {
      await assertProviderCallbackBindingActive(tx, binding);
    } catch (error) {
      return createProviderCallbackFailureResponse(error);
    }
    const recorded = await recordWebhookEvent({
      orgId: binding.orgId,
      provider: "twilio",
      eventType: "status",
      idempotencyKey: status.idempotencyKey,
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
      const statusUpdate = await updateMessageFromTwilioStatus({
        orgId: binding.orgId,
        providerMessageId: status.providerMessageId,
        status: status.status,
        errorCode: status.errorCode
      });

      if (!statusUpdate.matched) {
        await releaseWebhookEventClaim(binding.orgId, recorded.event.id, recorded.claimToken);
        return new NextResponse(null, {
          status: 409,
          headers: { "Retry-After": "5" }
        });
      }

      if (statusUpdate.updated) {
        const nextStatus = status.status.toLowerCase();
        if (nextStatus === "delivered") {
          recordMetric(smsPipelineMetrics.deliveryRate, { status: "success" });
          if (statusUpdate.createdAt) {
            const latencyMs = Date.now() - statusUpdate.createdAt.getTime();
            recordMetric(smsPipelineMetrics.sendToDeliveredLatencyMs, { latencyMs });
          }
        } else if (isTerminalDeliveryFailureProviderStatus(nextStatus)) {
          recordMetric(smsPipelineMetrics.deliveryRate, { status: "failure" });
          if (status.errorCode) {
            recordMetric(smsPipelineMetrics.failureByErrorCode, { errorCode: status.errorCode });
          }
        }
      }

      const completed = await markWebhookEventProcessed(
        binding.orgId,
        recorded.event.id,
        recorded.claimToken
      );
      if (completed.count !== 1) {
        throw new Error("Webhook event claim was lost before status processing completed.");
      }
    } catch (error) {
      await releaseWebhookEventClaim(binding.orgId, recorded.event.id, recorded.claimToken);
      throw error;
    }

    return new NextResponse(null, { status: 204 });
  });
}

