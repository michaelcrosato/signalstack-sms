import { describe, expect, it } from "vitest";
import {
  toSafeProviderAccount,
  toSafeProviderDiscovery,
  toSafeProviderMessagingService,
  toSafeProviderPhoneNumber
} from "@/lib/integrations/provider-accounts/safe-dtos";

const now = new Date("2026-07-12T00:00:00.000Z");
const candidate = `pvcandidate_v1_${"A".repeat(43)}`;

describe("provider account safe DTOs", () => {
  it("projects only redacted account and active-version metadata into a frozen DTO", () => {
    const result = toSafeProviderAccount({
      id: "provider_account_1",
      provider: "twilio",
      externalAccountIdLast4: "abcd",
      status: "VERIFIED",
      isDefault: true,
      accountStatus: "active",
      accountType: null,
      verifiedAt: now,
      lastCheckedAt: now,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
      credentialSecrets: [
        { version: 1, fingerprint: `pvfp_${"B".repeat(22)}`, retiredAt: null }
      ],
      _count: { phoneNumbers: 2, messagingServices: 1 },
      externalAccountId: `AC${"a".repeat(32)}`,
      ciphertext: "raw_ciphertext_must_not_escape",
      authToken: "raw_token_must_not_escape"
    } as Parameters<typeof toSafeProviderAccount>[0] & Record<string, unknown>);

    expect(result).toEqual({
      id: "provider_account_1",
      provider: "twilio",
      externalAccountIdLast4: "abcd",
      status: "VERIFIED",
      isDefault: true,
      accountStatus: "active",
      accountType: null,
      verifiedAt: now.toISOString(),
      lastCheckedAt: now.toISOString(),
      revokedAt: null,
      activeCredentialVersion: 1,
      credentialFingerprint: `pvfp_${"B".repeat(22)}`,
      phoneNumberCount: 2,
      messagingServiceCount: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("raw_token");
    expect(JSON.stringify(result)).not.toContain("raw_ciphertext");
    expect(JSON.stringify(result)).not.toContain(`AC${"a".repeat(32)}`);
  });

  it("rejects invalid redaction, timestamp, and count evidence", () => {
    const base = {
      id: "provider_account_1",
      provider: "twilio",
      externalAccountIdLast4: "abcd",
      status: "VERIFIED",
      isDefault: false,
      accountStatus: "active",
      accountType: null,
      verifiedAt: now,
      lastCheckedAt: now,
      revokedAt: null,
      createdAt: now,
      updatedAt: now
    };
    expect(() => toSafeProviderAccount({ ...base, externalAccountIdLast4: "bad" })).toThrow(
      "Provider identifier metadata is invalid."
    );
    expect(() => toSafeProviderAccount({ ...base, verifiedAt: "not-a-date" })).toThrow(
      "Provider timestamp is invalid."
    );
    expect(() => toSafeProviderAccount({ ...base, _count: { phoneNumbers: -1, messagingServices: 0 } })).toThrow(
      "Provider account count is invalid."
    );
    expect(() =>
      toSafeProviderAccount({
        ...base,
        credentialSecrets: [{ version: 1, fingerprint: "raw-secret-shaped-value", retiredAt: null }]
      })
    ).toThrow("Provider credential metadata is invalid.");
  });
});

describe("owned provider resource safe DTOs", () => {
  it("normalizes capabilities and timestamps without exposing external IDs", () => {
    const phone = toSafeProviderPhoneNumber({
      id: "number_1",
      providerAccountId: "provider_account_1",
      providerMessagingServiceId: null,
      provider: "twilio",
      phoneNumber: "+15555550199",
      externalNumberIdLast4: "ffff",
      label: "Support",
      status: "VERIFIED",
      capabilities: ["sms", "mms"],
      isDefault: true,
      verifiedAt: now,
      lastCheckedAt: now,
      disabledAt: null,
      createdAt: now,
      updatedAt: now
    });
    const service = toSafeProviderMessagingService({
      id: "service_1",
      providerAccountId: "provider_account_1",
      provider: "twilio",
      externalServiceIdLast4: "1111",
      status: "VERIFIED",
      capabilities: ["sms", "mms"],
      isDefault: false,
      verifiedAt: now,
      lastCheckedAt: now,
      disabledAt: null,
      createdAt: now,
      updatedAt: now
    });

    expect(phone.capabilities).toEqual(["mms", "sms"]);
    expect(service.capabilities).toEqual(["mms", "sms"]);
    expect(Object.isFrozen(phone)).toBe(true);
    expect(Object.isFrozen(phone.capabilities)).toBe(true);
    expect(Object.isFrozen(service)).toBe(true);
    expect(Object.isFrozen(service.capabilities)).toBe(true);
    expect(JSON.stringify(phone)).not.toContain(`PN${"f".repeat(32)}`);
    expect(JSON.stringify(service)).not.toContain(`MG${"1".repeat(32)}`);
  });

  it("rejects empty, duplicate, unknown, and non-array capabilities", () => {
    const base = {
      id: "number_1",
      providerAccountId: "provider_account_1",
      providerMessagingServiceId: null,
      provider: "twilio",
      phoneNumber: "+15555550199",
      externalNumberIdLast4: "ffff",
      label: null,
      status: "VERIFIED",
      isDefault: false,
      verifiedAt: now,
      lastCheckedAt: now,
      disabledAt: null,
      createdAt: now,
      updatedAt: now
    };
    for (const capabilities of [[], ["sms", "sms"], ["voice"], { sms: true }]) {
      expect(() => toSafeProviderPhoneNumber({ ...base, capabilities })).toThrow(
        "Provider capabilities are invalid."
      );
    }
  });
});

describe("provider discovery safe DTO", () => {
  it("uses opaque candidates and last-four provider IDs while retaining the selectable E.164 number", () => {
    const result = toSafeProviderDiscovery({
      credentialVersion: 3,
      phoneNumbers: [
        {
          candidateId: candidate,
          record: {
            externalNumberId: `PN${"f".repeat(32)}`,
            externalAccountId: `AC${"a".repeat(32)}`,
            phoneNumber: "+15555550199",
            friendlyName: "Support",
            capabilities: { sms: true, mms: false }
          }
        }
      ],
      messagingServices: [
        {
          candidateId: `pvcandidate_v1_${"C".repeat(43)}`,
          record: {
            externalServiceId: `MG${"1".repeat(32)}`,
            externalAccountId: `AC${"a".repeat(32)}`,
            friendlyName: "Outbound"
          }
        }
      ]
    });

    expect(result).toEqual({
      credentialVersion: 3,
      phoneNumbers: [
        {
          candidateId: candidate,
          externalNumberIdLast4: "ffff",
          phoneNumber: "+15555550199",
          capabilities: ["sms"]
        }
      ],
      messagingServices: [
        {
          candidateId: `pvcandidate_v1_${"C".repeat(43)}`,
          externalServiceIdLast4: "1111"
        }
      ]
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.phoneNumbers)).toBe(true);
    expect(Object.isFrozen(result.phoneNumbers[0])).toBe(true);
    expect(JSON.stringify(result)).not.toContain(`PN${"f".repeat(32)}`);
    expect(JSON.stringify(result)).not.toContain(`MG${"1".repeat(32)}`);
    expect(JSON.stringify(result)).not.toContain(`AC${"a".repeat(32)}`);
  });

  it("rejects stale versions, invalid candidate hashes, and unbounded result arrays", () => {
    expect(() =>
      toSafeProviderDiscovery({ credentialVersion: 0, phoneNumbers: [], messagingServices: [] })
    ).toThrow("Provider discovery credential version is invalid.");
    expect(() =>
      toSafeProviderDiscovery({
        credentialVersion: 1,
        phoneNumbers: [
          {
            candidateId: "raw-provider-id",
            record: {
              externalNumberId: `PN${"f".repeat(32)}`,
              externalAccountId: `AC${"a".repeat(32)}`,
              phoneNumber: "+15555550199",
              friendlyName: null,
              capabilities: { sms: true, mms: false }
            }
          }
        ],
        messagingServices: []
      })
    ).toThrow("Provider discovery candidate is invalid.");
    expect(() =>
      toSafeProviderDiscovery({
        credentialVersion: 1,
        phoneNumbers: Array.from({ length: 101 }, () => ({
          candidateId: candidate,
          record: {
            externalNumberId: `PN${"f".repeat(32)}`,
            externalAccountId: `AC${"a".repeat(32)}`,
            phoneNumber: "+15555550199",
            friendlyName: null,
            capabilities: { sms: true, mms: false }
          }
        })),
        messagingServices: []
      })
    ).toThrow("Provider discovery result is not bounded.");
  });
});
