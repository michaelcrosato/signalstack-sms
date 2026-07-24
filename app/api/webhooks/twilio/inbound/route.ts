import { NextResponse } from "next/server";
import { createDemoInboundMessage } from "@/lib/db/repositories/inbox";
import {
  markWebhookEventProcessed,
  recordWebhookEvent,
  releaseWebhookEventClaim
} from "@/lib/db/repositories/webhooks";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import {
  assertProviderCallbackBindingActive,
  authenticateTwilioProviderCallback,
  createProviderCallbackFailureResponse
} from "@/lib/integrations/provider-accounts/webhook-routing";
import {
  normalizeTwilioInbound,
  readTwilioFormPayload
} from "@/lib/messaging/twilio-webhooks";
import { twilioWebhookPayloadSchema } from "@/lib/validation/webhooks";

export async function POST(request: Request) {
  const rawPayload = await readTwilioFormPayload(request);
  if (!rawPayload) {
    return NextResponse.json({ error: "Invalid Twilio form payload." }, { status: 400 });
  }

  let binding;
  try {
    binding = await authenticateTwilioProviderCallback({
      kind: "inbound",
      signature: request.headers.get("x-twilio-signature"),
      url: request.url,
      params: rawPayload
    });
  } catch (error) {
    return createProviderCallbackFailureResponse(error);
  }

  const payload = twilioWebhookPayloadSchema.parse(rawPayload);
  const inbound = normalizeTwilioInbound(payload);
  if (!inbound) {
    return NextResponse.json({ error: "Invalid Twilio inbound payload." }, { status: 400 });
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
        binding.orgId,
        {
          phone: inbound.from,
          body: inbound.body,
          providerMessageId: inbound.providerMessageId,
          idempotencyKey: inbound.idempotencyKey,
          mediaUrls: inbound.mediaUrls
        },
        { analyzeSentiment: false, sendKeywordAutoReply: false }
      );

      const completed = await markWebhookEventProcessed(
        binding.orgId,
        recorded.event.id,
        recorded.claimToken
      );
      if (completed.count !== 1) {
        throw new Error("Webhook event claim was lost before inbound processing completed.");
      }
    } catch (error) {
      await releaseWebhookEventClaim(binding.orgId, recorded.event.id, recorded.claimToken);
      throw error;
    }

    return new NextResponse(null, { status: 204 });
  });
}
