import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as recordUsageRoute } from "@/app/api/billing/usage/route";
import { POST as preflightCampaignRoute } from "@/app/api/campaigns/[campaignId]/preflight/route";
import { POST as liveTestSmsRoute } from "@/app/api/demo/live-test-sms/route";
import { PATCH as updateComplianceRoute } from "@/app/api/settings/compliance/route";
import { POST as upsertNumberRoute } from "@/app/api/settings/numbers/route";
import { PATCH as updateProviderRoute } from "@/app/api/settings/provider/route";

const mocks = vi.hoisted(() => ({
  getOrCreateComplianceProfile: vi.fn(),
  getOrCreateCurrentOrg: vi.fn(),
  getProviderCredential: vi.fn(),
  getProviderSettings: vi.fn(),
  getUsageSummary: vi.fn(),
  preflightCampaign: vi.fn(),
  recordLiveReadinessAuditEvent: vi.fn(),
  recordUsageEvent: vi.fn(),
  requireApiRole: vi.fn(),
  sendLiveTestSms: vi.fn(),
  updateComplianceProfile: vi.fn(),
  upsertProviderCredentialMetadata: vi.fn(),
  upsertProviderPhoneNumber: vi.fn()
}));

vi.mock("@/lib/auth/api-authorization", () => ({
  requireApiRole: mocks.requireApiRole
}));

vi.mock("@/lib/auth/current-org", () => ({
  getOrCreateCurrentOrg: mocks.getOrCreateCurrentOrg
}));

vi.mock("@/lib/billing/metering", () => ({
  getUsageSummary: mocks.getUsageSummary,
  recordUsageEvent: mocks.recordUsageEvent
}));

vi.mock("@/lib/compliance/gates", () => ({
  complianceProfileIsComplete: vi.fn(),
  evaluateMessagingHardGate: vi.fn()
}));

vi.mock("@/lib/db/repositories/campaigns", () => ({
  preflightCampaign: mocks.preflightCampaign
}));

vi.mock("@/lib/db/repositories/compliance", () => ({
  getOrCreateComplianceProfile: mocks.getOrCreateComplianceProfile,
  updateComplianceProfile: mocks.updateComplianceProfile
}));

vi.mock("@/lib/db/repositories/provider-credentials", () => ({
  deleteProviderCredentialMetadata: vi.fn(),
  getProviderCredential: mocks.getProviderCredential,
  upsertProviderCredentialMetadata: mocks.upsertProviderCredentialMetadata
}));

vi.mock("@/lib/db/repositories/provider-numbers", () => ({
  listProviderPhoneNumbers: vi.fn(),
  upsertProviderPhoneNumber: mocks.upsertProviderPhoneNumber
}));

vi.mock("@/lib/db/repositories/readiness-audit", () => ({
  recordLiveReadinessAuditEvent: mocks.recordLiveReadinessAuditEvent
}));

vi.mock("@/lib/messaging/live-test-sms", () => ({
  getLiveTestSmsStatus: vi.fn(),
  sendLiveTestSms: mocks.sendLiveTestSms
}));

vi.mock("@/lib/messaging/provider/settings", () => ({
  getProviderSettings: mocks.getProviderSettings
}));

function malformedJsonRequest(path: string, method = "POST") {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: "{"
  });
}

describe("settings and operations JSON mutation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateCurrentOrg.mockResolvedValue({
      orgId: "org_demo",
      userId: "user_demo",
      role: "OWNER",
      demoMode: true
    });
    mocks.requireApiRole.mockReturnValue(null);
  });

  it("rejects malformed billing usage JSON without recording local usage", async () => {
    const response = await recordUsageRoute(malformedJsonRequest("/api/billing/usage"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid usage event payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.recordUsageEvent).not.toHaveBeenCalled();
    expect(mocks.getUsageSummary).not.toHaveBeenCalled();
  });

  it("rejects malformed campaign preflight JSON without running local preflight", async () => {
    const response = await preflightCampaignRoute(
      malformedJsonRequest("/api/campaigns/campaign_demo/preflight"),
      { params: Promise.resolve({ campaignId: "campaign_demo" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid preflight payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.preflightCampaign).not.toHaveBeenCalled();
  });

  it("rejects malformed compliance JSON without updating profile or recording readiness audit", async () => {
    const response = await updateComplianceRoute(malformedJsonRequest("/api/settings/compliance", "PATCH"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid compliance profile payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.updateComplianceProfile).not.toHaveBeenCalled();
    expect(mocks.recordLiveReadinessAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects malformed provider number JSON without upserting local metadata", async () => {
    const response = await upsertNumberRoute(malformedJsonRequest("/api/settings/numbers"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid provider number payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.upsertProviderPhoneNumber).not.toHaveBeenCalled();
  });

  it("rejects malformed provider settings JSON without persisting credential metadata", async () => {
    const response = await updateProviderRoute(malformedJsonRequest("/api/settings/provider", "PATCH"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid provider settings payload."
    });
    expect(mocks.upsertProviderCredentialMetadata).not.toHaveBeenCalled();
    expect(mocks.getProviderSettings).not.toHaveBeenCalled();
  });

  it("rejects malformed live-test SMS JSON without attempting the gated send path", async () => {
    const response = await liveTestSmsRoute(malformedJsonRequest("/api/demo/live-test-sms"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid live test SMS payload."
    });
    expect(mocks.sendLiveTestSms).not.toHaveBeenCalled();
  });
});
