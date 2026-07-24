import { describe, expect, it, vi, beforeEach } from "vitest";
import { runRetentionPruneWorker } from "@/lib/compliance/retention-worker";

const mocks = vi.hoisted(() => ({
  messageUpdateMany: vi.fn(),
  attemptUpdateMany: vi.fn(),
  webhookUpdateMany: vi.fn(),
  customerWebhookUpdateMany: vi.fn()
}));

vi.mock("@/lib/db/tenant-context", () => ({
  withTenantTransaction: vi.fn((_ctx, callback) =>
    callback({
      message: {
        updateMany: mocks.messageUpdateMany
      },
      messageAttempt: {
        updateMany: mocks.attemptUpdateMany
      },
      webhookEvent: {
        updateMany: mocks.webhookUpdateMany
      },
      customerWebhookEvent: {
        updateMany: mocks.customerWebhookUpdateMany
      }
    })
  )
}));

describe("Data Retention Pruning Worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("purges expired message bodies and raw payloads while preserving immutable ledgers", async () => {
    mocks.messageUpdateMany.mockResolvedValueOnce({ count: 15 });
    mocks.attemptUpdateMany.mockResolvedValueOnce({ count: 20 });
    mocks.webhookUpdateMany.mockResolvedValueOnce({ count: 5 });
    mocks.customerWebhookUpdateMany.mockResolvedValueOnce({ count: 8 });

    const fixedNow = new Date("2026-07-23T12:00:00Z");

    const result = await runRetentionPruneWorker({
      messageRetentionDays: 30,
      rawPayloadRetentionDays: 30,
      now: fixedNow
    });

    expect(result.messagesPurged).toBe(15);
    expect(result.attemptsPurged).toBe(20);
    expect(result.webhookPayloadsPurged).toBe(5);
    expect(result.customerWebhookEventsPurged).toBe(8);

    // Verify Message update replaces body with [RETENTION_PURGED] and clears mediaUrls
    expect(mocks.messageUpdateMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: new Date("2026-06-23T12:00:00.000Z") },
        body: { not: "[RETENTION_PURGED]" }
      },
      data: {
        body: "[RETENTION_PURGED]",
        mediaUrls: []
      }
    });

    // Verify WebhookEvent update clears rawPayload
    expect(mocks.webhookUpdateMany).toHaveBeenCalledWith({
      where: {
        receivedAt: { lt: new Date("2026-06-23T12:00:00.000Z") }
      },
      data: {
        rawPayload: { purged: true }
      }
    });
  });

  it("scopes retention purging to a single organization when orgId is provided", async () => {
    mocks.messageUpdateMany.mockResolvedValueOnce({ count: 3 });
    mocks.attemptUpdateMany.mockResolvedValueOnce({ count: 3 });
    mocks.webhookUpdateMany.mockResolvedValueOnce({ count: 1 });
    mocks.customerWebhookUpdateMany.mockResolvedValueOnce({ count: 2 });

    const fixedNow = new Date("2026-07-23T12:00:00Z");

    const result = await runRetentionPruneWorker({
      orgId: "org_target",
      messageRetentionDays: 14,
      rawPayloadRetentionDays: 7,
      now: fixedNow
    });

    expect(result.messagesPurged).toBe(3);
    expect(mocks.messageUpdateMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: new Date("2026-07-09T12:00:00.000Z") },
        body: { not: "[RETENTION_PURGED]" },
        orgId: "org_target"
      },
      data: {
        body: "[RETENTION_PURGED]",
        mediaUrls: []
      }
    });
  });
});
