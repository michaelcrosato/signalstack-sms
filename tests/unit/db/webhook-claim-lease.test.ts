import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  markWebhookEventProcessed,
  recordWebhookEvent,
  releaseWebhookEventClaim
} from "@/lib/db/repositories/webhooks";

describe("webhook event claim lease database invariant", () => {
  const slug = `webhook-claim-${randomUUID()}`;
  let orgId: string | undefined;

  afterAll(async () => {
    if (orgId) {
      await prisma.organization.delete({ where: { id: orgId } });
    }
  });

  it("serializes concurrent claims, releases for retry, and recovers stale leases", async () => {
    const org = await prisma.organization.create({ data: { name: "Webhook Claim Test", slug } });
    orgId = org.id;
    const now = new Date("2026-07-10T22:45:00.000Z");
    const input = {
      orgId,
      provider: "twilio",
      eventType: "inbound",
      idempotencyKey: `twilio:inbound:${randomUUID()}`,
      rawPayload: { MessageSid: "SM_WEBHOOK_CLAIM" }
    };

    const attempts = await Promise.all([
      recordWebhookEvent(input, { claimToken: "owner_a", now }),
      recordWebhookEvent(input, { claimToken: "owner_b", now })
    ]);
    const winner = attempts.find((attempt) => attempt.claimed);
    const loser = attempts.find((attempt) => !attempt.claimed);

    expect(winner).toBeDefined();
    expect(loser).toMatchObject({ claimed: false, duplicate: true });
    expect(attempts.filter((attempt) => attempt.claimed)).toHaveLength(1);
    if (!winner?.claimed) {
      throw new Error("Expected exactly one webhook claim winner.");
    }

    const wrongOwnerCompletion = await markWebhookEventProcessed(
      orgId,
      winner.event.id,
      "not_the_owner",
      now
    );
    expect(wrongOwnerCompletion.count).toBe(0);

    const released = await releaseWebhookEventClaim(orgId, winner.event.id, winner.claimToken);
    expect(released.count).toBe(1);

    const retry = await recordWebhookEvent(input, {
      claimToken: "retry_owner",
      now: new Date(now.getTime() + 1_000)
    });
    expect(retry).toMatchObject({ claimed: true, duplicate: false, claimToken: "retry_owner" });
    if (!retry.claimed) {
      throw new Error("Expected the released webhook event to be retryable immediately.");
    }

    const completed = await markWebhookEventProcessed(orgId, retry.event.id, retry.claimToken, now);
    expect(completed.count).toBe(1);

    const staleInput = {
      ...input,
      idempotencyKey: `twilio:inbound:${randomUUID()}`,
      rawPayload: { MessageSid: "SM_WEBHOOK_STALE" }
    };
    const stale = await prisma.webhookEvent.create({
      data: {
        ...staleInput,
        claimToken: "abandoned_owner",
        claimExpiresAt: new Date(now.getTime() - 1)
      }
    });
    const recovered = await recordWebhookEvent(staleInput, { claimToken: "recovery_owner", now });

    expect(recovered).toMatchObject({
      event: { id: stale.id },
      claimed: true,
      duplicate: false,
      claimToken: "recovery_owner"
    });
  });
});
