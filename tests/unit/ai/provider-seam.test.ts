import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateAiHardGate, liveAiIsBlocked, readAiHardGateInput } from "@/lib/ai/ai-gate";
import { fakeAiProvider, liveAiProvider, resolveAiProvider } from "@/lib/ai/provider";
import { aiDraftCapExceeded, aiDraftDailyCap, DEFAULT_AI_DRAFT_DAILY_CAP } from "@/lib/ai/usage";
import {
  fakeLeadQualification,
  fakeReplySuggestion,
  fakeCampaignCopyVariants,
  fakeConversationSummary
} from "@/lib/ai/fake-ai-provider";

const liveEnv = {
  AI_PROVIDER: "live",
  LIVE_AI_ENABLED: "true",
  AI_API_KEY: "test-key",
  AI_COST_ACK: "true"
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("AI hard gate", () => {
  it("allows live only when all four conditions hold", () => {
    expect(evaluateAiHardGate(readAiHardGateInput(liveEnv))).toEqual({ allowed: true, reasons: [] });
  });

  it("blocks by default (fake provider)", () => {
    const result = evaluateAiHardGate(readAiHardGateInput({ AI_PROVIDER: "fake" }));
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("AI_PROVIDER_NOT_LIVE");
  });

  it("blocks live when the API key is missing", () => {
    const result = evaluateAiHardGate(readAiHardGateInput({ ...liveEnv, AI_API_KEY: "" }));
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("MISSING_API_KEY");
  });

  it("blocks live when cost is not acknowledged", () => {
    const result = evaluateAiHardGate(readAiHardGateInput({ ...liveEnv, AI_COST_ACK: "false" }));
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("COST_NOT_ACKNOWLEDGED");
  });

  it("treats an empty environment as blocked", () => {
    expect(liveAiIsBlocked({})).toBe(true);
  });
});

describe("resolveAiProvider", () => {
  it("returns the fake provider by default", () => {
    expect(resolveAiProvider({}).name).toBe("fake");
    expect(resolveAiProvider({ AI_PROVIDER: "fake" }).name).toBe("fake");
  });

  it("returns the live provider only when the gate fully allows", () => {
    expect(resolveAiProvider(liveEnv).name).toBe("live");
  });

  it("falls back to fake when live is half-configured", () => {
    expect(resolveAiProvider({ ...liveEnv, AI_API_KEY: "" }).name).toBe("fake");
  });
});

describe("fakeAiProvider.generateReplyDraft", () => {
  it("matches the deterministic fake suggestion byte-for-byte", async () => {
    const input = { messages: [{ direction: "INBOUND", body: "Can you send pricing?" }], goal: "share pricing" };
    await expect(fakeAiProvider.generateReplyDraft(input)).resolves.toEqual(fakeReplySuggestion(input));
  });
});

describe("liveAiProvider.generateReplyDraft", () => {
  it("returns a live draft and strips phone PII from the outgoing prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: "Sure — here are our prices. Reply STOP to opt out." }] })
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AI_API_KEY", "test-key");

    const draft = await liveAiProvider.generateReplyDraft({
      messages: [{ direction: "INBOUND", body: "Call me at +1 415 555 0199 about pricing" }],
      goal: "share pricing"
    });

    expect(draft).toEqual({ provider: "live", suggestion: "Sure — here are our prices. Reply STOP to opt out." });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.body).toContain("[redacted]");
    expect(init.body).not.toContain("0199");
    expect(init.body).not.toContain("415 555");
  });

  it("throws on a non-ok live response (never silently proceeds)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    vi.stubEnv("AI_API_KEY", "test-key");

    await expect(
      liveAiProvider.generateReplyDraft({ messages: [{ direction: "INBOUND", body: "hi" }] })
    ).rejects.toThrow(/status 500/);
  });
});

describe("qualifyLead seam", () => {
  it("fake provider returns the deterministic qualification byte-for-byte", async () => {
    const messages = [{ direction: "INBOUND", body: "Can you send pricing?" }];
    await expect(fakeAiProvider.qualifyLead({ messages })).resolves.toEqual(fakeLeadQualification(messages));
  });

  it("live provider parses model JSON and strips phone PII from the outgoing prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: '{"score": 82, "stage": "HOT", "reasons": ["asked pricing"]}' }] })
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AI_API_KEY", "test-key");

    const result = await liveAiProvider.qualifyLead({
      messages: [{ direction: "INBOUND", body: "Quote for +1 415 555 0199 please" }]
    });

    expect(result).toEqual({ provider: "live", score: 82, stage: "HOT", reasons: ["asked pricing"] });
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(init.body).toContain("[redacted]");
    expect(init.body).not.toContain("0199");
  });

  it("live provider throws on an unparseable qualification", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: [{ text: "not json" }] }) }));
    vi.stubEnv("AI_API_KEY", "test-key");
    await expect(
      liveAiProvider.qualifyLead({ messages: [{ direction: "INBOUND", body: "hi" }] })
    ).rejects.toThrow(/unparseable/);
  });
});

describe("aiDraftCapExceeded", () => {
  it("uses the default cap and blocks at or above it", () => {
    expect(aiDraftDailyCap({})).toBe(DEFAULT_AI_DRAFT_DAILY_CAP);
    expect(aiDraftCapExceeded(DEFAULT_AI_DRAFT_DAILY_CAP - 1, {})).toBe(false);
    expect(aiDraftCapExceeded(DEFAULT_AI_DRAFT_DAILY_CAP, {})).toBe(true);
  });

  it("honors an AI_DRAFT_DAILY_CAP override", () => {
    expect(aiDraftDailyCap({ AI_DRAFT_DAILY_CAP: "5" })).toBe(5);
    expect(aiDraftCapExceeded(4, { AI_DRAFT_DAILY_CAP: "5" })).toBe(false);
    expect(aiDraftCapExceeded(5, { AI_DRAFT_DAILY_CAP: "5" })).toBe(true);
  });
});

describe("generateCampaignCopy seam", () => {
  it("fake provider returns the deterministic variants byte-for-byte", async () => {
    const input = { prompt: "spring sale", businessName: "Demo Co", tone: "casual" };
    await expect(fakeAiProvider.generateCampaignCopy(input)).resolves.toEqual(fakeCampaignCopyVariants(input));
  });

  it("live provider parses model JSON and strips phone PII from the outgoing prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: '{"variants": ["Variant 1", "Variant 2"]}' }] })
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AI_API_KEY", "test-key");

    const result = await liveAiProvider.generateCampaignCopy({
      prompt: "Call +1 415 555 0199 for a discount!",
      businessName: "Acme",
      tone: "bold"
    });

    expect(result).toEqual({ provider: "live", variants: ["Variant 1", "Variant 2"] });
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(init.body).toContain("[redacted]");
    expect(init.body).not.toContain("0199");
  });

  it("live provider throws on an unparseable response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: [{ text: "not json" }] }) }));
    vi.stubEnv("AI_API_KEY", "test-key");
    await expect(
      liveAiProvider.generateCampaignCopy({ prompt: "hi" })
    ).rejects.toThrow(/unparseable/);
  });
});

describe("summarizeConversation seam", () => {
  it("fake provider returns the deterministic summary byte-for-byte", async () => {
    const messages = [{ direction: "INBOUND", body: "Hello" }];
    await expect(fakeAiProvider.summarizeConversation({ messages })).resolves.toEqual(fakeConversationSummary(messages));
  });

  it("live provider parses model JSON and strips phone PII from the outgoing prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: '{"summary": "Conversation summary here"}' }] })
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AI_API_KEY", "test-key");

    const result = await liveAiProvider.summarizeConversation({
      messages: [{ direction: "INBOUND", body: "My number is 415 555 0199" }]
    });

    expect(result).toEqual({ provider: "live", summary: "Conversation summary here" });
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(init.body).toContain("[redacted]");
    expect(init.body).not.toContain("0199");
  });

  it("live provider throws on an unparseable response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: [{ text: "not json" }] }) }));
    vi.stubEnv("AI_API_KEY", "test-key");
    await expect(
      liveAiProvider.summarizeConversation({ messages: [] })
    ).rejects.toThrow(/unparseable/);
  });
});
