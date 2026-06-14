import { describe, expect, it, vi } from "vitest";
import {
  assertFakeAiProvider,
  fakeCampaignCopyVariants,
  fakeConversationSummary,
  fakeLeadQualification,
  fakeReplySuggestion
} from "@/lib/ai/fake-ai-provider";

const messages = [
  { direction: "INBOUND", body: "Can you send pricing?" },
  { direction: "OUTBOUND", body: "Happy to help." }
];

describe("fake AI provider", () => {
  it("returns deterministic campaign copy variants", () => {
    expect(fakeCampaignCopyVariants({ prompt: "spring sale", businessName: "Demo Co" })).toEqual({
      provider: "fake",
      variants: [
        "Demo Co: Demo-safe campaign copy for: spring sale Reply STOP to opt out.",
        "Demo Co update: spring sale This demo-safe draft is friendly. Reply STOP to opt out."
      ]
    });
  });

  it("returns deterministic reply suggestions and summaries", () => {
    expect(fakeReplySuggestion({ messages, goal: "share pricing" }).suggestion).toContain("share pricing");
    expect(fakeConversationSummary(messages)).toEqual({
      provider: "fake",
      summary: "Demo summary: 2 messages, 1 inbound. Latest: Happy to help."
    });
  });

  it("qualifies pricing conversations as hot leads", () => {
    expect(fakeLeadQualification(messages)).toMatchObject({
      provider: "fake",
      score: 82,
      stage: "HOT"
    });
  });

  it("blocks non-fake AI providers in this milestone", () => {
    vi.stubEnv("AI_PROVIDER", "live");
    expect(() => assertFakeAiProvider()).toThrow("Live AI providers are not enabled in this milestone.");
    vi.unstubAllEnvs();
  });
});
