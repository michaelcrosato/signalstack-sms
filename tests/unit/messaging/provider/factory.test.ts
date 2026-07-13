import { describe, expect, it, vi } from "vitest";
import { parseProviderCredentialPlaintext } from "@/lib/integrations/provider-accounts/credential-encryption";
import { signDummyProviderRequest } from "@/lib/messaging/provider/dummy-provider";
import { createProviderFactory } from "@/lib/messaging/provider/factory";

describe("provider factory", () => {
  it("returns a deterministic, frozen, no-network dummy adapter", async () => {
    const provider = createProviderFactory().create({ name: "dummy" });
    const input = {
      orgId: "org_1",
      to: "+15555550100",
      from: "+15555550199",
      body: "hello",
      idempotencyKey: "request_1"
    };

    await expect(provider.createMessage(input)).resolves.toEqual({
      providerMessageId: "dummy_request_1",
      externalAccountId: "dummy-account",
      status: { status: "queued", providerStatus: "queued" },
      to: "+15555550100",
      from: "+15555550199",
      messagingServiceId: null,
      providerErrorCode: null
    });
    await expect(provider.createMessage(input)).resolves.toEqual(
      await provider.createMessage(input)
    );
    expect(Object.isFrozen(provider)).toBe(true);
    await expect(provider.getHealth()).resolves.toEqual({
      healthy: true,
      checkedAt: "1970-01-01T00:00:00.000Z",
      safeCode: "PROVIDER_HEALTHY"
    });
  });

  it("provides deterministic signature, discovery, and error behavior", async () => {
    const provider = createProviderFactory().create({ name: "dummy" });
    const fixture = {
      url: "https://example.test/webhook",
      params: { From: "+15555550100", MessageSid: "dummy_1" }
    };
    const signature = signDummyProviderRequest(fixture);

    expect(provider.validateSignature({ ...fixture, signature })).toBe(true);
    expect(provider.validateSignature({ ...fixture, signature: "wrong" })).toBe(false);
    await expect(provider.discoverPhoneNumbers()).resolves.toEqual([
      expect.objectContaining({ phoneNumber: "+15555550199", capabilities: { sms: true, mms: true } })
    ]);
    await expect(provider.discoverMessagingServices()).resolves.toEqual([
      expect.objectContaining({ externalServiceId: "dummy-service" })
    ]);
    expect(provider.classifyError(new Error("ignored"), "fetch_message")).toEqual({
      disposition: "terminal",
      retryable: false,
      safeCode: "DUMMY_PROVIDER_ERROR",
      providerCode: null
    });
    expect(provider.normalizeStatus(" Future_Status ")).toEqual({
      status: "unknown",
      providerStatus: "future_status"
    });
  });

  it("constructs Twilio lazily without making a provider request", () => {
    const fetchMock = vi.fn();
    const provider = createProviderFactory({
      twilio: { fetch: fetchMock as unknown as typeof fetch }
    }).create({
      name: "twilio",
      credentials: {
        externalAccountId: `AC${"a".repeat(32)}`,
        token: parseProviderCredentialPlaintext("b".repeat(32))
      }
    });

    expect(provider.name).toBe("twilio");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
