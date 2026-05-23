import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as campaignCopyRoute } from "@/app/api/ai/campaign-copy/route";
import { POST as conversationSummaryRoute } from "@/app/api/ai/conversation-summary/route";
import { POST as leadQualificationRoute } from "@/app/api/ai/lead-qualification/route";
import { POST as replySuggestionRoute } from "@/app/api/ai/reply-suggestion/route";

const mocks = vi.hoisted(() => ({
  assertFakeAiProvider: vi.fn(),
  fakeCampaignCopyVariants: vi.fn(),
  fakeConversationSummary: vi.fn(),
  fakeLeadQualification: vi.fn(),
  fakeReplySuggestion: vi.fn(),
  getOrCreateCurrentOrg: vi.fn(),
  recordFakeAiUsage: vi.fn(),
  requireApiRole: vi.fn(),
  resolveAiMessages: vi.fn()
}));

vi.mock("@/lib/ai/conversation-context", () => ({
  resolveAiMessages: mocks.resolveAiMessages
}));

vi.mock("@/lib/ai/fake-ai-provider", () => ({
  assertFakeAiProvider: mocks.assertFakeAiProvider,
  fakeCampaignCopyVariants: mocks.fakeCampaignCopyVariants,
  fakeConversationSummary: mocks.fakeConversationSummary,
  fakeLeadQualification: mocks.fakeLeadQualification,
  fakeReplySuggestion: mocks.fakeReplySuggestion
}));

vi.mock("@/lib/ai/usage", () => ({
  recordFakeAiUsage: mocks.recordFakeAiUsage
}));

vi.mock("@/lib/auth/api-authorization", () => ({
  requireApiRole: mocks.requireApiRole
}));

vi.mock("@/lib/auth/current-org", () => ({
  getOrCreateCurrentOrg: mocks.getOrCreateCurrentOrg
}));

function malformedJsonRequest(path: string) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{"
  });
}

describe("AI JSON mutation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateCurrentOrg.mockResolvedValue({ orgId: "org_demo", userId: "user_demo", role: "OWNER" });
    mocks.requireApiRole.mockReturnValue(null);
  });

  it("rejects malformed campaign-copy JSON without running fake AI or metering usage", async () => {
    const response = await campaignCopyRoute(malformedJsonRequest("/api/ai/campaign-copy"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid campaign copy payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.assertFakeAiProvider).not.toHaveBeenCalled();
    expect(mocks.fakeCampaignCopyVariants).not.toHaveBeenCalled();
    expect(mocks.recordFakeAiUsage).not.toHaveBeenCalled();
  });

  it("rejects malformed reply-suggestion JSON without resolving messages, running fake AI, or metering usage", async () => {
    const response = await replySuggestionRoute(malformedJsonRequest("/api/ai/reply-suggestion"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid reply suggestion payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.assertFakeAiProvider).not.toHaveBeenCalled();
    expect(mocks.resolveAiMessages).not.toHaveBeenCalled();
    expect(mocks.fakeReplySuggestion).not.toHaveBeenCalled();
    expect(mocks.recordFakeAiUsage).not.toHaveBeenCalled();
  });

  it("rejects malformed conversation-summary JSON without resolving messages, running fake AI, or metering usage", async () => {
    const response = await conversationSummaryRoute(malformedJsonRequest("/api/ai/conversation-summary"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid conversation summary payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.assertFakeAiProvider).not.toHaveBeenCalled();
    expect(mocks.resolveAiMessages).not.toHaveBeenCalled();
    expect(mocks.fakeConversationSummary).not.toHaveBeenCalled();
    expect(mocks.recordFakeAiUsage).not.toHaveBeenCalled();
  });

  it("rejects malformed lead-qualification JSON without resolving messages, running fake AI, or metering usage", async () => {
    const response = await leadQualificationRoute(malformedJsonRequest("/api/ai/lead-qualification"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid lead qualification payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.assertFakeAiProvider).not.toHaveBeenCalled();
    expect(mocks.resolveAiMessages).not.toHaveBeenCalled();
    expect(mocks.fakeLeadQualification).not.toHaveBeenCalled();
    expect(mocks.recordFakeAiUsage).not.toHaveBeenCalled();
  });
});
