import { A2pRegistrationStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { getProductCompliance, productComplianceBlockerCopy, productComplianceFields } from "@/lib/product/compliance";

vi.mock("@/lib/db/repositories/compliance", () => ({
  getOrCreateComplianceProfile: vi.fn(async () => ({
    id: "profile_1",
    orgId: "org_1",
    businessName: "SignalStack Demo Co",
    messagingUseCase: "Appointment reminders",
    optInDescription: "Customers opt in on the web form.",
    privacyPolicyUrl: "https://example.test/privacy",
    termsOfServiceUrl: "https://example.test/terms",
    a2pRegistrationStatus: A2pRegistrationStatus.NOT_STARTED,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z")
  }))
}));

describe("getProductCompliance", () => {
  it("builds owner-facing compliance readiness without allowing live messaging by default", async () => {
    const result = await getProductCompliance({
      orgId: "org_1",
      demoMode: true,
      liveMessagingEnabled: false,
      messagingProvider: "dummy"
    });

    expect(result.summary).toMatchObject({
      complete: true,
      completeFields: 5,
      requiredFields: 5,
      a2pRegistrationStatus: A2pRegistrationStatus.NOT_STARTED,
      liveMessagingAllowed: false,
      blockerCount: 4,
      demoMode: true,
      liveMessagingEnabled: false,
      messagingProvider: "dummy"
    });
    expect(result.fields.map((field) => [field.label, field.status])).toEqual([
      ["Business name", "present"],
      ["Messaging use case", "present"],
      ["Opt-in description", "present"],
      ["Privacy policy URL", "present"],
      ["Terms of service URL", "present"]
    ]);
    expect(result.blockers.map((blocker) => blocker.reason)).toEqual([
      "LIVE_MESSAGING_DISABLED",
      "DEMO_MODE_ENABLED",
      "DUMMY_PROVIDER_SELECTED",
      "A2P_NOT_APPROVED"
    ]);
  });

  it("keeps checklist field metadata deeply frozen for the compliance workspace", () => {
    expect(Object.isFrozen(productComplianceFields)).toBe(true);
    expect(productComplianceFields.every((field) => Object.isFrozen(field))).toBe(true);
    expect(productComplianceFields.map((field) => field.key)).toEqual([
      "businessName",
      "messagingUseCase",
      "optInDescription",
      "privacyPolicyUrl",
      "termsOfServiceUrl"
    ]);
    expect(() =>
      (productComplianceFields as unknown as Array<{ key: string; label: string; guidance: string }>).push({
        key: "unsafe",
        label: "Unsafe",
        guidance: "unsafe"
      })
    ).toThrow(TypeError);
    expect(() => {
      (productComplianceFields[0] as { label: string }).label = "Unsafe";
    }).toThrow(TypeError);
  });

  it("freezes hard-gate blocker copy before rendering", () => {
    expect(Object.isFrozen(productComplianceBlockerCopy)).toBe(true);
    expect(productComplianceBlockerCopy.LIVE_MESSAGING_DISABLED).toBe("Live messaging flag is disabled.");
    expect(productComplianceBlockerCopy.DEMO_MODE_ENABLED).toBe("Demo mode is enabled for this organization.");
    expect(Object.keys(productComplianceBlockerCopy)).toEqual([
      "LIVE_MESSAGING_DISABLED",
      "DEMO_MODE_ENABLED",
      "DUMMY_PROVIDER_SELECTED",
      "COMPLIANCE_PROFILE_INCOMPLETE",
      "A2P_NOT_APPROVED",
      "CONTACT_ARCHIVED",
      "CONSENT_NOT_OPTED_IN",
      "CONTACT_OPTED_OUT"
    ]);

    expect(() => {
      (productComplianceBlockerCopy as Record<string, string>).LIVE_MESSAGING_DISABLED = "Unsafe";
    }).toThrow(TypeError);
  });
});
