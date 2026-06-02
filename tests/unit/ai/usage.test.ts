import { describe, expect, it, vi, beforeEach } from "vitest";
import { aiDraftDailyCap, aiDraftCapExceeded, DEFAULT_AI_DRAFT_DAILY_CAP, recordFakeAiUsage, recordLiveAiUsage, countAiRequestsSince } from "@/lib/ai/usage";
import { recordUsageEvent } from "@/lib/billing/metering";
import { prisma } from "@/lib/db/prisma";
import { UsageEventType } from "@prisma/client";

vi.mock("@/lib/billing/metering", () => ({
  recordUsageEvent: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    usageEvent: {
      count: vi.fn(),
    },
  },
}));

describe("aiDraftDailyCap", () => {
  it("returns default cap when env var is absent", () => {
    expect(aiDraftDailyCap({})).toBe(DEFAULT_AI_DRAFT_DAILY_CAP);
  });

  it("returns default cap when env var is invalid string", () => {
    expect(aiDraftDailyCap({ AI_DRAFT_DAILY_CAP: "abc" })).toBe(DEFAULT_AI_DRAFT_DAILY_CAP);
  });

  it("returns default cap when env var is zero or negative", () => {
    expect(aiDraftDailyCap({ AI_DRAFT_DAILY_CAP: "0" })).toBe(DEFAULT_AI_DRAFT_DAILY_CAP);
    expect(aiDraftDailyCap({ AI_DRAFT_DAILY_CAP: "-10" })).toBe(DEFAULT_AI_DRAFT_DAILY_CAP);
  });

  it("returns parsed number when env var is a valid positive integer string", () => {
    expect(aiDraftDailyCap({ AI_DRAFT_DAILY_CAP: "50" })).toBe(50);
  });

  it("returns floored number when env var is a valid positive decimal string", () => {
    expect(aiDraftDailyCap({ AI_DRAFT_DAILY_CAP: "50.5" })).toBe(50);
    expect(aiDraftDailyCap({ AI_DRAFT_DAILY_CAP: "50.9" })).toBe(50);
  });
});

describe("aiDraftCapExceeded", () => {
  it("returns true when usedInWindow equals the daily cap", () => {
    expect(aiDraftCapExceeded(50, { AI_DRAFT_DAILY_CAP: "50" })).toBe(true);
  });

  it("returns true when usedInWindow is strictly greater than the daily cap", () => {
    expect(aiDraftCapExceeded(51, { AI_DRAFT_DAILY_CAP: "50" })).toBe(true);
  });

  it("returns false when usedInWindow is less than the daily cap", () => {
    expect(aiDraftCapExceeded(49, { AI_DRAFT_DAILY_CAP: "50" })).toBe(false);
  });
});

describe("recordFakeAiUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls recordUsageEvent with correct parameters", async () => {
    await recordFakeAiUsage("org-1", "fake-endpoint");
    expect(recordUsageEvent).toHaveBeenCalledWith("org-1", {
      type: UsageEventType.AI_REQUEST,
      quantity: 1,
      metadata: {
        provider: "fake",
        endpoint: "fake-endpoint",
      },
    });
  });
});

describe("recordLiveAiUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls recordUsageEvent with correct parameters", async () => {
    await recordLiveAiUsage("org-2", "live-endpoint");
    expect(recordUsageEvent).toHaveBeenCalledWith("org-2", {
      type: UsageEventType.AI_REQUEST,
      quantity: 1,
      metadata: {
        provider: "live",
        endpoint: "live-endpoint",
      },
    });
  });
});

describe("countAiRequestsSince", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls prisma.usageEvent.count with correct parameters and returns result", async () => {
    const sinceDate = new Date("2024-01-01T00:00:00Z");
    vi.mocked(prisma.usageEvent.count).mockResolvedValue(42);

    const result = await countAiRequestsSince("org-3", sinceDate);

    expect(prisma.usageEvent.count).toHaveBeenCalledWith({
      where: {
        orgId: "org-3",
        type: UsageEventType.AI_REQUEST,
        createdAt: { gte: sinceDate },
      },
    });
    expect(result).toBe(42);
  });
});
