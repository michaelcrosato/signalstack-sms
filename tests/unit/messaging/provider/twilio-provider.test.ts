import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMessagingProvider } from "@/lib/messaging/provider";
import { twilioProvider } from "@/lib/messaging/provider/twilio-provider";
import { A2pRegistrationStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  orgFindUnique: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    organization: {
      findUnique: mocks.orgFindUnique
    }
  }
}));

describe("twilio messaging provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.stubEnv("LIVE_MESSAGING_ENABLED", "false");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    vi.stubEnv("TWILIO_FROM_NUMBER", "");
  });

  it("resolves twilio provider from getMessagingProvider", () => {
    const provider = getMessagingProvider("twilio");
    expect(provider.name).toBe("twilio");
    expect(provider).toBe(twilioProvider);
  });

  it("blocks sends when live messaging is disabled or organization is in demo mode", async () => {
    mocks.orgFindUnique.mockResolvedValue({
      id: "org_1",
      demoMode: true,
      complianceProfile: {
        businessName: "SignalStack Co",
        messagingUseCase: "Marketing",
        optInDescription: "Web form",
        privacyPolicyUrl: "https://example.com/privacy",
        termsOfServiceUrl: "https://example.com/terms",
        a2pRegistrationStatus: A2pRegistrationStatus.APPROVED
      }
    });

    vi.stubEnv("LIVE_MESSAGING_ENABLED", "false");

    const result = await twilioProvider.send({
      to: "+15555550199",
      from: "+15555550100",
      body: "Test",
      orgId: "org_1",
      idempotencyKey: "test_key"
    });

    expect(result.status).toBe("blocked");
    expect(result.providerMessageId).toContain("blocked_test_key");
  });

  it("throws error when all gates pass but environment credentials are missing", async () => {
    mocks.orgFindUnique.mockResolvedValue({
      id: "org_1",
      demoMode: false,
      complianceProfile: {
        businessName: "SignalStack Co",
        messagingUseCase: "Marketing",
        optInDescription: "Web form",
        privacyPolicyUrl: "https://example.com/privacy",
        termsOfServiceUrl: "https://example.com/terms",
        a2pRegistrationStatus: A2pRegistrationStatus.APPROVED
      }
    });

    vi.stubEnv("LIVE_MESSAGING_ENABLED", "true");

    await expect(
      twilioProvider.send({
        to: "+15555550199",
        from: "+15555550100",
        body: "Test",
        orgId: "org_1",
        idempotencyKey: "test_key"
      })
    ).rejects.toThrow("TWILIO_ENV_CREDENTIALS_INCOMPLETE");
  });

  it("makes a POST request to Twilio API and normalization works when gates pass", async () => {
    mocks.orgFindUnique.mockResolvedValue({
      id: "org_1",
      demoMode: false,
      complianceProfile: {
        businessName: "SignalStack Co",
        messagingUseCase: "Marketing",
        optInDescription: "Web form",
        privacyPolicyUrl: "https://example.com/privacy",
        termsOfServiceUrl: "https://example.com/terms",
        a2pRegistrationStatus: A2pRegistrationStatus.APPROVED
      }
    });

    vi.stubEnv("LIVE_MESSAGING_ENABLED", "true");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "auth_token_value");
    vi.stubEnv("TWILIO_FROM_NUMBER", "+15555550100");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      statusText: "Created",
      json: async () => ({
        sid: "SM_twilio_test_sid",
        status: "queued"
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await twilioProvider.send({
      to: "555-555-0199",
      from: "555-555-0100",
      body: "Hello world",
      orgId: "org_1",
      idempotencyKey: "test_key_123"
    });

    expect(result).toEqual({
      providerMessageId: "SM_twilio_test_sid",
      status: "queued"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.twilio.com/2010-04-01/Accounts/AC_test/Messages.json",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: expect.any(String),
          "Content-Type": "application/x-www-form-urlencoded"
        }),
        body: expect.any(URLSearchParams)
      })
    );
  });
});
