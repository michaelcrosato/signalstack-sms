import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as recordUsageRoute } from "@/app/api/billing/usage/route";
import { POST as preflightCampaignRoute } from "@/app/api/campaigns/[campaignId]/preflight/route";
import { POST as liveTestSmsRoute } from "@/app/api/demo/live-test-sms/route";
import { PATCH as updateComplianceRoute } from "@/app/api/settings/compliance/route";
import {
  GET as listNumbersRoute,
  POST as upsertNumberRoute
} from "@/app/api/settings/numbers/route";
import {
  DELETE as deleteProviderRoute,
  GET as readProviderRoute,
  PATCH as updateProviderRoute
} from "@/app/api/settings/provider/route";

const mocks = vi.hoisted(() => ({
  complianceProfileIsComplete: vi.fn(),
  evaluateMessagingHardGate: vi.fn(),
  getOrCreateComplianceProfile: vi.fn(),
  getComplianceProfile: vi.fn(),
  getOrCreateCurrentOrg: vi.fn(),
  getProviderCredential: vi.fn(),
  getProviderSettings: vi.fn(),
  getUsageSummary: vi.fn(),
  listOwnedProviderPhoneNumbers: vi.fn(),
  listProviderPhoneNumbers: vi.fn(),
  listProviderAccounts: vi.fn(),
  preflightCampaign: vi.fn(),
  recordLiveReadinessAuditEvent: vi.fn(),
  recordUsageEvent: vi.fn(),
  requireApiRole: vi.fn(),
  sendLiveTestSms: vi.fn(),
  revokeProviderAccount: vi.fn(),
  deleteProviderCredentialMetadata: vi.fn(),
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
  complianceProfileIsComplete: mocks.complianceProfileIsComplete,
  evaluateMessagingHardGate: mocks.evaluateMessagingHardGate
}));

vi.mock("@/lib/db/repositories/campaigns", () => ({
  preflightCampaign: mocks.preflightCampaign
}));

vi.mock("@/lib/db/repositories/compliance", () => ({
  getComplianceProfile: mocks.getComplianceProfile,
  getOrCreateComplianceProfile: mocks.getOrCreateComplianceProfile,
  updateComplianceProfile: mocks.updateComplianceProfile
}));

vi.mock("@/lib/db/repositories/provider-credentials", () => ({
  deleteProviderCredentialMetadata: mocks.deleteProviderCredentialMetadata,
  getProviderCredential: mocks.getProviderCredential,
  upsertProviderCredentialMetadata: mocks.upsertProviderCredentialMetadata
}));

vi.mock("@/lib/db/repositories/provider-numbers", () => ({
  listProviderPhoneNumbers: mocks.listProviderPhoneNumbers,
  upsertProviderPhoneNumber: mocks.upsertProviderPhoneNumber
}));

vi.mock("@/lib/integrations/provider-accounts/service", () => ({
  listOwnedProviderPhoneNumbers: mocks.listOwnedProviderPhoneNumbers,
  listProviderAccounts: mocks.listProviderAccounts,
  revokeProviderAccount: mocks.revokeProviderAccount
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
    headers: sameOriginJsonHeaders(),
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
    mocks.listProviderAccounts.mockResolvedValue([]);
    mocks.listOwnedProviderPhoneNumbers.mockResolvedValue([]);
    mocks.complianceProfileIsComplete.mockReturnValue(false);
    mocks.evaluateMessagingHardGate.mockReturnValue({
      allowed: false,
      reasons: ["Live messaging is disabled."]
    });
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

  it("denies compliance profile updates before parsing request bodies", async () => {
    const denial = Response.json({ error: "Forbidden" }, { status: 403 });
    mocks.requireApiRole.mockReturnValue(denial);

    const response = await updateComplianceRoute(malformedJsonRequest("/api/settings/compliance", "PATCH"));

    expect(response.status).toBe(403);
    expect(mocks.updateComplianceProfile).not.toHaveBeenCalled();
    expect(mocks.recordLiveReadinessAuditEvent).not.toHaveBeenCalled();
    expect(mocks.evaluateMessagingHardGate).not.toHaveBeenCalled();
  });

  it("updates only local compliance metadata and readiness audit for valid admin requests", async () => {
    const profile = {
      id: "compliance_demo",
      orgId: "org_demo",
      businessName: "SignalStack Demo",
      messagingUseCase: "Customer updates",
      optInDescription: "Website opt-in form",
      privacyPolicyUrl: "https://example.com/privacy",
      termsOfServiceUrl: "https://example.com/terms",
      a2pRegistrationStatus: "PENDING"
    };
    mocks.updateComplianceProfile.mockResolvedValue(profile);
    mocks.complianceProfileIsComplete.mockReturnValue(true);
    mocks.evaluateMessagingHardGate.mockReturnValue({
      allowed: false,
      reasons: ["Live messaging is disabled."]
    });

    const response = await updateComplianceRoute(
      new Request("http://localhost/api/settings/compliance", {
        method: "PATCH",
        headers: sameOriginJsonHeaders(),
        body: JSON.stringify({
          businessName: "SignalStack Demo",
          messagingUseCase: "Customer updates",
          optInDescription: "Website opt-in form",
          privacyPolicyUrl: "https://example.com/privacy",
          termsOfServiceUrl: "https://example.com/terms",
          a2pRegistrationStatus: "PENDING"
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      profile,
      checklist: {
        complete: true,
        liveMessagingAllowed: false,
        blockers: ["Live messaging is disabled."]
      }
    });
    expect(mocks.updateComplianceProfile).toHaveBeenCalledWith("org_demo", {
      businessName: "SignalStack Demo",
      messagingUseCase: "Customer updates",
      optInDescription: "Website opt-in form",
      privacyPolicyUrl: "https://example.com/privacy",
      termsOfServiceUrl: "https://example.com/terms",
      a2pRegistrationStatus: "PENDING"
    });
    expect(mocks.recordLiveReadinessAuditEvent).toHaveBeenCalledWith("org_demo", {
      actorUserId: "user_demo",
      action: "COMPLIANCE_PROFILE_UPDATED",
      subjectType: "ComplianceProfile",
      subjectId: "compliance_demo",
      metadata: {
        a2pRegistrationStatus: "PENDING",
        complete: true
      }
    });
    expect(mocks.evaluateMessagingHardGate).toHaveBeenCalledWith(
      expect.objectContaining({
        demoMode: true,
        liveMessagingEnabled: false,
        messagingProvider: "dummy",
        complianceProfile: profile
      })
    );
    expect(mocks.upsertProviderPhoneNumber).not.toHaveBeenCalled();
    expect(mocks.upsertProviderCredentialMetadata).not.toHaveBeenCalled();
    expect(mocks.sendLiveTestSms).not.toHaveBeenCalled();
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

  it("denies provider number metadata upserts before parsing request bodies", async () => {
    const denial = Response.json({ error: "Forbidden" }, { status: 403 });
    mocks.requireApiRole.mockReturnValue(denial);

    const response = await upsertNumberRoute(malformedJsonRequest("/api/settings/numbers"));

    expect(response.status).toBe(403);
    expect(mocks.upsertProviderPhoneNumber).not.toHaveBeenCalled();
  });

  it("upserts only local provider number metadata for valid admin requests", async () => {
    const timestamp = new Date("2026-07-12T00:00:00.000Z");
    const number = {
      id: "number_demo",
      orgId: "org_demo",
      phoneNumber: "+15555550199",
      phoneNumberHash: null,
      label: "Demo line",
      provider: "dummy",
      providerAccountId: null,
      providerMessagingServiceId: null,
      externalNumberId: null,
      externalNumberIdLast4: null,
      status: "DEMO",
      capabilities: ["sms"],
      isDefault: true,
      verifiedAt: null,
      lastCheckedAt: null,
      disabledAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    mocks.upsertProviderPhoneNumber.mockResolvedValue(number);

    const response = await upsertNumberRoute(
      new Request("http://localhost/api/settings/numbers", {
        method: "POST",
        headers: sameOriginJsonHeaders(),
        body: JSON.stringify({
          phoneNumber: "+15555550199",
          label: "Demo line",
          isDefault: true
        })
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      number: {
        id: "number_demo",
        providerAccountId: null,
        providerMessagingServiceId: null,
        provider: "dummy",
        phoneNumber: "+15555550199",
        externalNumberIdLast4: null,
        label: "Demo line",
        status: "DEMO",
        capabilities: ["sms"],
        isDefault: true,
        verifiedAt: null,
        lastCheckedAt: null,
        disabledAt: null,
        createdAt: timestamp.toISOString(),
        updatedAt: timestamp.toISOString()
      }
    });
    expect(mocks.upsertProviderPhoneNumber).toHaveBeenCalledWith(
      "org_demo",
      {
        phoneNumber: "+15555550199",
        label: "Demo line",
        provider: "dummy",
        capabilities: ["sms"],
        isDefault: true
      },
      { actorUserId: "user_demo" }
    );
    expect(mocks.getProviderSettings).not.toHaveBeenCalled();
    expect(mocks.upsertProviderCredentialMetadata).not.toHaveBeenCalled();
    expect(mocks.sendLiveTestSms).not.toHaveBeenCalled();
  });

  it("returns 409 only for a concurrent provider-number uniqueness conflict", async () => {
    mocks.upsertProviderPhoneNumber.mockRejectedValue({ code: "P2002" });

    const response = await upsertNumberRoute(
      new Request("http://localhost/api/settings/numbers", {
        method: "POST",
        headers: sameOriginJsonHeaders(),
        body: JSON.stringify({ phoneNumber: "+15555550199", isDefault: true })
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Provider number metadata conflicted with another update."
    });
  });

  it("does not misreport an unexpected provider-number failure as a conflict", async () => {
    mocks.upsertProviderPhoneNumber.mockRejectedValue(new Error("database unavailable"));

    const response = await upsertNumberRoute(
      new Request("http://localhost/api/settings/numbers", {
        method: "POST",
        headers: sameOriginJsonHeaders(),
        body: JSON.stringify({ phoneNumber: "+15555550199", isDefault: true })
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Provider number metadata update failed."
    });
  });

  it("retires the metadata compatibility endpoint before parsing request bodies", async () => {
    const response = await updateProviderRoute(malformedJsonRequest("/api/settings/provider", "PATCH"));

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: "Use the verified provider accounts endpoint.",
      code: "PROVIDER_METADATA_ENDPOINT_RETIRED"
    });
    expect(mocks.upsertProviderCredentialMetadata).not.toHaveBeenCalled();
    expect(mocks.getProviderSettings).not.toHaveBeenCalled();
  });

  it("denies provider metadata updates before parsing request bodies", async () => {
    const denial = Response.json({ error: "Forbidden" }, { status: 403 });
    mocks.requireApiRole.mockReturnValue(denial);

    const response = await updateProviderRoute(malformedJsonRequest("/api/settings/provider", "PATCH"));

    expect(response.status).toBe(403);
    expect(mocks.upsertProviderCredentialMetadata).not.toHaveBeenCalled();
    expect(mocks.getOrCreateComplianceProfile).not.toHaveBeenCalled();
    expect(mocks.getProviderSettings).not.toHaveBeenCalled();
  });

  it("does not persist secrets submitted to the retired metadata endpoint", async () => {
    const response = await updateProviderRoute(
      new Request("http://localhost/api/settings/provider", {
        method: "PATCH",
        headers: sameOriginJsonHeaders(),
        body: JSON.stringify({
          provider: "twilio",
          twilio: {
            accountSid: "AC123456789",
            authToken: "auth-token-demo",
            fromNumber: "+15555550199"
          }
        })
      })
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: "Use the verified provider accounts endpoint.",
      code: "PROVIDER_METADATA_ENDPOINT_RETIRED"
    });
    expect(mocks.upsertProviderCredentialMetadata).not.toHaveBeenCalled();
    expect(mocks.getProviderSettings).not.toHaveBeenCalled();
    expect(mocks.upsertProviderPhoneNumber).not.toHaveBeenCalled();
    expect(mocks.deleteProviderCredentialMetadata).not.toHaveBeenCalled();
    expect(mocks.sendLiveTestSms).not.toHaveBeenCalled();
  });

  it("denies provider metadata deletion before clearing local credentials", async () => {
    const denial = Response.json({ error: "Forbidden" }, { status: 403 });
    mocks.requireApiRole.mockReturnValue(denial);

    const response = await deleteProviderRoute(providerDeleteRequest());

    expect(response.status).toBe(403);
    expect(mocks.deleteProviderCredentialMetadata).not.toHaveBeenCalled();
    expect(mocks.getOrCreateComplianceProfile).not.toHaveBeenCalled();
    expect(mocks.getProviderSettings).not.toHaveBeenCalled();
  });

  it("revokes the default verified account without deleting lifecycle evidence", async () => {
    const account = {
      id: "provider_account_demo",
      isDefault: true,
      revokedAt: null
    };
    const revoked = { ...account, isDefault: false, revokedAt: "2026-07-12T00:00:00.000Z" };
    mocks.listProviderAccounts.mockResolvedValue([account]);
    mocks.revokeProviderAccount.mockResolvedValue(revoked);

    const response = await deleteProviderRoute(providerDeleteRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ account: revoked });
    expect(mocks.revokeProviderAccount).toHaveBeenCalledWith({
      orgId: "org_demo",
      providerAccountId: "provider_account_demo",
      actor: { userId: "user_demo" }
    });
    expect(mocks.deleteProviderCredentialMetadata).not.toHaveBeenCalled();
    expect(mocks.getProviderSettings).not.toHaveBeenCalled();
    expect(mocks.upsertProviderCredentialMetadata).not.toHaveBeenCalled();
  });

  it("rejects malformed live-test SMS JSON without attempting the gated send path", async () => {
    const response = await liveTestSmsRoute(malformedJsonRequest("/api/demo/live-test-sms"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid live test SMS payload."
    });
    expect(mocks.sendLiveTestSms).not.toHaveBeenCalled();
  });

  it("returns only ADMIN-safe provider number DTOs without routing hashes", async () => {
    const timestamp = new Date("2026-07-12T00:00:00.000Z");
    mocks.listProviderPhoneNumbers.mockResolvedValue([
      {
        id: "number_live",
        orgId: "org_demo",
        phoneNumber: "+15555550199",
        phoneNumberHash: `pvlookup_v1_${"A".repeat(43)}`,
        label: "Support",
        provider: "twilio",
        providerAccountId: "provider_account_1",
        providerMessagingServiceId: null,
        externalNumberId: `PN${"f".repeat(32)}`,
        externalNumberIdLast4: "ffff",
        status: "VERIFIED",
        capabilities: ["sms", "mms"],
        isDefault: true,
        verifiedAt: timestamp,
        lastCheckedAt: timestamp,
        disabledAt: null,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ]);

    const response = await listNumbersRoute();
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(serialized).not.toContain("pvlookup_v1_");
    expect(serialized).not.toContain(`PN${"f".repeat(32)}`);
    expect(serialized).not.toContain("org_demo");
    expect(serialized).toContain('"externalNumberIdLast4":"ffff"');
  });

  it("denies provider-number inventory before reading raw rows", async () => {
    mocks.requireApiRole.mockReturnValue(Response.json({ error: "Forbidden" }, { status: 403 }));

    const response = await listNumbersRoute();

    expect(response.status).toBe(403);
    expect(mocks.listProviderPhoneNumbers).not.toHaveBeenCalled();
  });

  it("reads aggregate provider state without creating compliance metadata", async () => {
    mocks.getComplianceProfile.mockResolvedValue(null);
    mocks.getProviderCredential.mockResolvedValue(null);
    mocks.getProviderSettings.mockReturnValue({ provider: "dummy" });

    const response = await readProviderRoute();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    await expect(response.json()).resolves.toEqual({
      providerSettings: { provider: "dummy" },
      accounts: [],
      numbers: []
    });
    expect(mocks.getComplianceProfile).toHaveBeenCalledWith("org_demo");
    expect(mocks.getOrCreateComplianceProfile).not.toHaveBeenCalled();
  });
});

function providerDeleteRequest() {
  return new Request("http://localhost/api/settings/provider", {
    method: "DELETE",
    headers: { Origin: "http://localhost", Host: "localhost" }
  });
}

function sameOriginJsonHeaders() {
  return { "Content-Type": "application/json", Origin: "http://localhost", Host: "localhost" };
}
