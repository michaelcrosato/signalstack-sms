import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  WEBHOOK_EVENT_CLAIM_LEASE_MS,
  markWebhookEventProcessed,
  recordWebhookEvent,
  releaseWebhookEventClaim,
  updateMessageFromTwilioStatus
} from "@/lib/db/repositories/webhooks";

const mocks = vi.hoisted(() => ({
  messageFindFirst: vi.fn(),
  messageUpdateMany: vi.fn(),
  webhookEventCreate: vi.fn(),
  webhookEventFindUnique: vi.fn(),
  webhookEventUpdateMany: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    message: {
      findFirst: mocks.messageFindFirst,
      updateMany: mocks.messageUpdateMany
    },
    webhookEvent: {
      create: mocks.webhookEventCreate,
      findUnique: mocks.webhookEventFindUnique,
      updateMany: mocks.webhookEventUpdateMany
    }
  }
}));

const webhookInput = {
  orgId: "org_demo",
  provider: "twilio",
  eventType: "status",
  idempotencyKey: "twilio:status:SM123:delivered:none",
  rawPayload: {
    MessageSid: "SM123",
    MessageStatus: "delivered"
  }
};

const claimNow = new Date("2026-01-02T00:00:00.000Z");
const claimExpiresAt = new Date(claimNow.getTime() + WEBHOOK_EVENT_CLAIM_LEASE_MS);
const claimOptions = { claimToken: "claim_owner", now: claimNow };

describe("recordWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing tenant-scoped webhook events as duplicates without creating a row", async () => {
    const existingEvent = {
      id: "event_existing",
      ...webhookInput,
      processedAt: new Date("2026-01-01T00:00:00.000Z")
    };
    mocks.webhookEventFindUnique.mockResolvedValue(existingEvent);

    await expect(recordWebhookEvent(webhookInput, claimOptions)).resolves.toEqual({
      event: existingEvent,
      outcome: "processed",
      duplicate: true,
      claimed: false,
      claimToken: null,
      claimExpiresAt: null,
      retryAfterSeconds: null
    });

    expect(mocks.webhookEventFindUnique).toHaveBeenCalledWith({
      where: {
        orgId_idempotencyKey: {
          orgId: "org_demo",
          idempotencyKey: "twilio:status:SM123:delivered:none"
        }
      }
    });
    expect(mocks.webhookEventCreate).not.toHaveBeenCalled();
    expect(mocks.webhookEventUpdateMany).not.toHaveBeenCalled();
  });

  it("atomically claims an existing released event whose downstream work never completed", async () => {
    const unprocessedEvent = {
      id: "event_unprocessed",
      ...webhookInput,
      processedAt: null,
      claimToken: null,
      claimExpiresAt: null
    };
    mocks.webhookEventFindUnique.mockResolvedValue(unprocessedEvent);
    mocks.webhookEventUpdateMany.mockResolvedValue({ count: 1 });

    await expect(recordWebhookEvent(webhookInput, claimOptions)).resolves.toEqual({
      event: {
        ...unprocessedEvent,
        claimToken: "claim_owner",
        claimExpiresAt
      },
      outcome: "claimed",
      duplicate: false,
      claimed: true,
      claimToken: "claim_owner",
      claimExpiresAt,
      retryAfterSeconds: null
    });

    expect(mocks.webhookEventCreate).not.toHaveBeenCalled();
    expect(mocks.webhookEventUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "event_unprocessed",
        orgId: "org_demo",
        processedAt: null,
        OR: [
          { claimToken: null },
          { claimExpiresAt: null },
          { claimExpiresAt: { lte: claimNow } }
        ]
      },
      data: {
        claimToken: "claim_owner",
        claimExpiresAt
      }
    });
  });

  it("does not let a concurrent request steal an active claim", async () => {
    const activeEvent = {
      id: "event_active",
      ...webhookInput,
      processedAt: null,
      claimToken: "other_owner",
      claimExpiresAt: new Date("2026-01-02T00:04:00.000Z")
    };
    mocks.webhookEventFindUnique.mockResolvedValue(activeEvent);
    mocks.webhookEventUpdateMany.mockResolvedValue({ count: 0 });

    await expect(recordWebhookEvent(webhookInput, claimOptions)).resolves.toEqual({
      event: activeEvent,
      outcome: "in_progress",
      duplicate: true,
      claimed: false,
      claimToken: null,
      claimExpiresAt: activeEvent.claimExpiresAt,
      retryAfterSeconds: 240
    });

    expect(mocks.webhookEventCreate).not.toHaveBeenCalled();
  });

  it("recovers an expired claim with a new owner token", async () => {
    const staleEvent = {
      id: "event_stale",
      ...webhookInput,
      processedAt: null,
      claimToken: "stale_owner",
      claimExpiresAt: new Date("2026-01-01T23:59:59.999Z")
    };
    mocks.webhookEventFindUnique.mockResolvedValue(staleEvent);
    mocks.webhookEventUpdateMany.mockResolvedValue({ count: 1 });

    await expect(recordWebhookEvent(webhookInput, claimOptions)).resolves.toMatchObject({
      event: {
        id: "event_stale",
        claimToken: "claim_owner",
        claimExpiresAt
      },
      outcome: "claimed",
      duplicate: false,
      claimed: true,
      claimToken: "claim_owner",
      claimExpiresAt,
      retryAfterSeconds: null
    });
  });

  it("creates a new webhook event when no duplicate exists", async () => {
    const createdEvent = {
      id: "event_created",
      ...webhookInput
    };
    mocks.webhookEventFindUnique.mockResolvedValue(null);
    mocks.webhookEventCreate.mockResolvedValue(createdEvent);

    await expect(recordWebhookEvent(webhookInput, claimOptions)).resolves.toEqual({
      event: createdEvent,
      outcome: "claimed",
      duplicate: false,
      claimed: true,
      claimToken: "claim_owner",
      claimExpiresAt,
      retryAfterSeconds: null
    });

    expect(mocks.webhookEventCreate).toHaveBeenCalledWith({
      data: {
        orgId: "org_demo",
        provider: "twilio",
        eventType: "status",
        idempotencyKey: "twilio:status:SM123:delivered:none",
        rawPayload: {
          MessageSid: "SM123",
          MessageStatus: "delivered"
        },
        processedAt: null,
        claimToken: "claim_owner",
        claimExpiresAt
      }
    });
  });

  it("treats concurrent unique-key create conflicts as duplicate provider retries", async () => {
    const duplicateEvent = {
      id: "event_duplicate",
      ...webhookInput,
      processedAt: null,
      claimToken: "other_owner",
      claimExpiresAt: new Date("2026-01-02T00:04:00.000Z")
    };
    mocks.webhookEventFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(duplicateEvent);
    mocks.webhookEventCreate.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    mocks.webhookEventUpdateMany.mockResolvedValue({ count: 0 });

    await expect(recordWebhookEvent(webhookInput, claimOptions)).resolves.toEqual({
      event: duplicateEvent,
      outcome: "in_progress",
      duplicate: true,
      claimed: false,
      claimToken: null,
      claimExpiresAt: duplicateEvent.claimExpiresAt,
      retryAfterSeconds: 240
    });

    expect(mocks.webhookEventCreate).toHaveBeenCalledTimes(1);
    expect(mocks.webhookEventFindUnique).toHaveBeenCalledTimes(2);
  });

  it("rethrows non-unique persistence errors", async () => {
    const persistenceError = Object.assign(new Error("database unavailable"), { code: "P1001" });
    mocks.webhookEventFindUnique.mockResolvedValue(null);
    mocks.webhookEventCreate.mockRejectedValue(persistenceError);

    await expect(recordWebhookEvent(webhookInput, claimOptions)).rejects.toBe(persistenceError);
  });

  it("rethrows unique constraint errors if a concurrent duplicate is ultimately not found", async () => {
    const uniqueConstraintError = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    mocks.webhookEventFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mocks.webhookEventCreate.mockRejectedValue(uniqueConstraintError);

    await expect(recordWebhookEvent(webhookInput, claimOptions)).rejects.toBe(uniqueConstraintError);
    expect(mocks.webhookEventFindUnique).toHaveBeenCalledTimes(2);
  });
});

describe("webhook event claim completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks only the current tenant's event owned by the supplied claim token", async () => {
    const processedAt = new Date("2026-01-02T00:00:00.000Z");
    mocks.webhookEventUpdateMany.mockResolvedValue({ count: 1 });

    await expect(
      markWebhookEventProcessed("org_demo", "event_demo", "claim_owner", processedAt)
    ).resolves.toEqual({ count: 1 });

    expect(mocks.webhookEventUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "event_demo",
        orgId: "org_demo",
        processedAt: null,
        claimToken: "claim_owner"
      },
      data: {
        processedAt,
        claimToken: null,
        claimExpiresAt: null
      }
    });
  });

  it("releases only the current tenant's event owned by the supplied claim token", async () => {
    mocks.webhookEventUpdateMany.mockResolvedValue({ count: 1 });

    await expect(
      releaseWebhookEventClaim("org_demo", "event_demo", "claim_owner")
    ).resolves.toEqual({ count: 1 });

    expect(mocks.webhookEventUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "event_demo",
        orgId: "org_demo",
        processedAt: null,
        claimToken: "claim_owner"
      },
      data: {
        claimToken: null,
        claimExpiresAt: null
      }
    });
  });
});

describe("updateMessageFromTwilioStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies a delivered transition with an atomic non-regression guard", async () => {
    const now = new Date("2026-01-02T00:00:00.000Z");
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    mocks.messageUpdateMany.mockResolvedValue({ count: 1 });
    mocks.messageFindFirst.mockResolvedValue({ createdAt });

    await expect(
      updateMessageFromTwilioStatus({
        orgId: "org_demo",
        providerMessageId: "SM123",
        status: "delivered",
        now
      })
    ).resolves.toEqual({ matched: true, updated: true, createdAt });

    expect(mocks.messageUpdateMany).toHaveBeenCalledWith({
      where: {
        orgId: "org_demo",
        providerMessageId: "SM123",
        failedAt: null,
        OR: [
          { providerStatus: null },
          {
            providerStatus: {
              in: ["scheduled", "accepted", "queued", "receiving", "sending", "sent", "delivered"]
            }
          },
          {
            providerStatus: {
              notIn: [
                "scheduled",
                "accepted",
                "queued",
                "receiving",
                "sending",
                "sent",
                "delivered",
                "received",
                "read",
                "failed",
                "undelivered",
                "canceled"
              ]
            }
          }
        ]
      },
      data: {
        providerStatus: "delivered",
        providerErrorCode: null,
        deliveredAt: now,
        failedAt: null
      }
    });
    expect(mocks.messageFindFirst).toHaveBeenCalledWith({
      where: { orgId: "org_demo", providerMessageId: "SM123" },
      select: { createdAt: true }
    });
  });

  it("does not let an early sent callback overwrite terminal timestamps", async () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    mocks.messageFindFirst.mockResolvedValue({ createdAt });
    mocks.messageUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      updateMessageFromTwilioStatus({
        orgId: "org_demo",
        providerMessageId: "SM123",
        status: "sent"
      })
    ).resolves.toEqual({ matched: true, updated: false, createdAt });

    const update = mocks.messageUpdateMany.mock.calls[0][0];
    expect(update.where).toMatchObject({
      orgId: "org_demo",
      providerMessageId: "SM123",
      deliveredAt: null,
      failedAt: null
    });
    expect(update.where.OR[1].providerStatus.in).toEqual([
      "scheduled",
      "accepted",
      "queued",
      "receiving",
      "sending",
      "sent"
    ]);
    expect(update.where.OR[1].providerStatus.in).not.toContain("delivered");
    expect(mocks.messageFindFirst).toHaveBeenCalledWith({
      where: { orgId: "org_demo", providerMessageId: "SM123" },
      select: { createdAt: true }
    });
  });

  it("does not mark an early callback handled before its tenant-scoped message exists", async () => {
    mocks.messageFindFirst.mockResolvedValue(null);

    await expect(
      updateMessageFromTwilioStatus({
        orgId: "org_demo",
        providerMessageId: "SM_missing",
        status: "sent"
      })
    ).resolves.toEqual({ matched: false, updated: false, createdAt: null });

    expect(mocks.messageFindFirst).toHaveBeenCalledWith({
      where: { orgId: "org_demo", providerMessageId: "SM_missing" },
      select: { createdAt: true }
    });
    expect(mocks.messageUpdateMany).not.toHaveBeenCalled();
  });

  it("preserves unknown provider statuses only before a terminal transition", async () => {
    mocks.messageUpdateMany.mockResolvedValue({ count: 1 });
    mocks.messageFindFirst.mockResolvedValue({ createdAt: new Date("2026-01-01T00:00:00.000Z") });

    await updateMessageFromTwilioStatus({
      orgId: "org_demo",
      providerMessageId: "SM123",
      status: "provider-accepted-v2"
    });

    const update = mocks.messageUpdateMany.mock.calls[0][0];
    expect(update.where).toMatchObject({ deliveredAt: null, failedAt: null });
    expect(update.where.OR).toEqual([
      { providerStatus: null },
      { providerStatus: { in: ["scheduled", "accepted", "queued", "receiving"] } },
      {
        providerStatus: {
          notIn: [
            "scheduled",
            "accepted",
            "queued",
            "receiving",
            "sending",
            "sent",
            "delivered",
            "received",
            "read",
            "failed",
            "undelivered",
            "canceled"
          ]
        }
      }
    ]);
    expect(update.data).toMatchObject({
      providerStatus: "provider-accepted-v2",
      providerErrorCode: null
    });
  });
});
