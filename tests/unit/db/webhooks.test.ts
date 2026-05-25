import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordWebhookEvent } from "@/lib/db/repositories/webhooks";

const mocks = vi.hoisted(() => ({
  webhookEventCreate: vi.fn(),
  webhookEventFindUnique: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    webhookEvent: {
      create: mocks.webhookEventCreate,
      findUnique: mocks.webhookEventFindUnique
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

describe("recordWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing tenant-scoped webhook events as duplicates without creating a row", async () => {
    const existingEvent = {
      id: "event_existing",
      ...webhookInput
    };
    mocks.webhookEventFindUnique.mockResolvedValue(existingEvent);

    await expect(recordWebhookEvent(webhookInput)).resolves.toEqual({ event: existingEvent, duplicate: true });

    expect(mocks.webhookEventFindUnique).toHaveBeenCalledWith({
      where: {
        orgId_idempotencyKey: {
          orgId: "org_demo",
          idempotencyKey: "twilio:status:SM123:delivered:none"
        }
      }
    });
    expect(mocks.webhookEventCreate).not.toHaveBeenCalled();
  });

  it("creates a new webhook event when no duplicate exists", async () => {
    const createdEvent = {
      id: "event_created",
      ...webhookInput
    };
    mocks.webhookEventFindUnique.mockResolvedValue(null);
    mocks.webhookEventCreate.mockResolvedValue(createdEvent);

    await expect(recordWebhookEvent(webhookInput)).resolves.toEqual({ event: createdEvent, duplicate: false });

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
        processedAt: expect.any(Date)
      }
    });
  });

  it("treats concurrent unique-key create conflicts as duplicate provider retries", async () => {
    const duplicateEvent = {
      id: "event_duplicate",
      ...webhookInput
    };
    mocks.webhookEventFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(duplicateEvent);
    mocks.webhookEventCreate.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));

    await expect(recordWebhookEvent(webhookInput)).resolves.toEqual({ event: duplicateEvent, duplicate: true });

    expect(mocks.webhookEventCreate).toHaveBeenCalledTimes(1);
    expect(mocks.webhookEventFindUnique).toHaveBeenCalledTimes(2);
  });

  it("rethrows non-unique persistence errors", async () => {
    const persistenceError = Object.assign(new Error("database unavailable"), { code: "P1001" });
    mocks.webhookEventFindUnique.mockResolvedValue(null);
    mocks.webhookEventCreate.mockRejectedValue(persistenceError);

    await expect(recordWebhookEvent(webhookInput)).rejects.toBe(persistenceError);
  });
});
