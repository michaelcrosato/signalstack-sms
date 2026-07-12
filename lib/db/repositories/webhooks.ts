import { randomUUID } from "node:crypto";
import type { Prisma, WebhookEvent } from "@prisma/client";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import { twilioStatusTransition, twilioStatusUpdateGuard } from "@/lib/messaging/twilio-webhooks";

export const WEBHOOK_EVENT_CLAIM_LEASE_MS = 5 * 60 * 1000;

function retryAfterSeconds(event: WebhookEvent, now: Date) {
  if (!(event.claimExpiresAt instanceof Date)) {
    return Math.ceil(WEBHOOK_EVENT_CLAIM_LEASE_MS / 1000);
  }

  return Math.max(1, Math.ceil((event.claimExpiresAt.getTime() - now.getTime()) / 1000));
}

async function claimExistingWebhookEvent(
  event: WebhookEvent,
  input: { orgId: string },
  claim: { token: string; expiresAt: Date; now: Date }
) {
  if (event.processedAt !== null) {
    return {
      event,
      outcome: "processed",
      duplicate: true,
      claimed: false,
      claimToken: null,
      claimExpiresAt: null,
      retryAfterSeconds: null
    } as const;
  }

  const claimed = await withTenantTransaction({ orgId: input.orgId }, (tx) =>
    tx.webhookEvent.updateMany({
      where: {
        id: event.id,
        orgId: input.orgId,
        processedAt: null,
        OR: [
          { claimToken: null },
          { claimExpiresAt: null },
          { claimExpiresAt: { lte: claim.now } }
        ]
      },
      data: {
        claimToken: claim.token,
        claimExpiresAt: claim.expiresAt
      }
    })
  );

  if (claimed.count !== 1) {
    return {
      event,
      outcome: "in_progress",
      duplicate: true,
      claimed: false,
      claimToken: null,
      claimExpiresAt: event.claimExpiresAt,
      retryAfterSeconds: retryAfterSeconds(event, claim.now)
    } as const;
  }

  return {
    event: {
      ...event,
      claimToken: claim.token,
      claimExpiresAt: claim.expiresAt
    },
    outcome: "claimed",
    duplicate: false,
    claimed: true,
    claimToken: claim.token,
    claimExpiresAt: claim.expiresAt,
    retryAfterSeconds: null
  } as const;
}

export async function recordWebhookEvent(
  input: {
    orgId: string;
    provider: string;
    eventType: string;
    idempotencyKey: string;
    rawPayload: Record<string, string>;
  },
  options: { claimToken?: string; now?: Date } = {}
) {
  const now = options.now ?? new Date();
  const claimToken = options.claimToken ?? randomUUID();
  const claimExpiresAt = new Date(now.getTime() + WEBHOOK_EVENT_CLAIM_LEASE_MS);
  const claim = { token: claimToken, expiresAt: claimExpiresAt, now };
  const where = { orgId_idempotencyKey: { orgId: input.orgId, idempotencyKey: input.idempotencyKey } };
  const existing = await withTenantTransaction({ orgId: input.orgId }, (tx) =>
    tx.webhookEvent.findUnique({ where })
  );
  if (existing) {
    return claimExistingWebhookEvent(existing, input, claim);
  }

  const insert = await withTenantTransaction({ orgId: input.orgId }, (tx) =>
    tx.webhookEvent.createMany({
      data: [{
        orgId: input.orgId,
        provider: input.provider,
        eventType: input.eventType,
        idempotencyKey: input.idempotencyKey,
        rawPayload: input.rawPayload as Prisma.InputJsonObject,
        processedAt: null,
        claimToken,
        claimExpiresAt
      }],
      skipDuplicates: true
    })
  );
  const event = await withTenantTransaction({ orgId: input.orgId }, (tx) =>
    tx.webhookEvent.findUnique({ where })
  );
  if (!event) {
    throw new Error("Webhook event insert did not produce a readable tenant row.");
  }
  if (insert.count === 1) {
    return {
      event,
      outcome: "claimed",
      duplicate: false,
      claimed: true,
      claimToken,
      claimExpiresAt,
      retryAfterSeconds: null
    } as const;
  }
  return claimExistingWebhookEvent(event, input, claim);
}

export async function markWebhookEventProcessed(
  orgId: string,
  eventId: string,
  claimToken: string,
  processedAt = new Date()
) {
  return withTenantTransaction({ orgId }, (tx) => tx.webhookEvent.updateMany({
    where: {
      id: eventId,
      orgId,
      processedAt: null,
      claimToken
    },
    data: {
      processedAt,
      claimToken: null,
      claimExpiresAt: null
    }
  }));
}

export async function releaseWebhookEventClaim(orgId: string, eventId: string, claimToken: string) {
  return withTenantTransaction({ orgId }, (tx) => tx.webhookEvent.updateMany({
    where: {
      id: eventId,
      orgId,
      processedAt: null,
      claimToken
    },
    data: {
      claimToken: null,
      claimExpiresAt: null
    }
  }));
}

export async function updateMessageFromTwilioStatus(input: {
  orgId: string;
  providerMessageId: string;
  status: string;
  errorCode?: string;
  now?: Date;
}) {
  return withTenantTransaction({ orgId: input.orgId }, async (tx) => {
    const message = await tx.message.findFirst({
      where: {
        orgId: input.orgId,
        providerMessageId: input.providerMessageId
      },
      select: { createdAt: true }
    });

    if (!message) {
      return { matched: false, updated: false, createdAt: null };
    }

    const update = await tx.message.updateMany({
      where: {
        orgId: input.orgId,
        providerMessageId: input.providerMessageId,
        ...twilioStatusUpdateGuard(input.status)
      },
      data: twilioStatusTransition(input)
    });

    if (update.count === 0) {
      return { matched: true, updated: false, createdAt: message.createdAt };
    }

    return { matched: true, updated: true, createdAt: message.createdAt };
  });
}
