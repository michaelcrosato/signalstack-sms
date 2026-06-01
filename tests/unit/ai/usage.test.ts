import { describe, expect, it } from "vitest";
import { aiDraftDailyCap, aiDraftCapExceeded, DEFAULT_AI_DRAFT_DAILY_CAP } from "@/lib/ai/usage";

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
