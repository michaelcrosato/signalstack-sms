import { A2pRegistrationStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { complianceProfileUpdateSchema } from "@/lib/validation/compliance";
import { evaluateMessagingHardGate } from "@/lib/compliance/gates";

describe("10DLC Brand & Campaign Registration Evidence", () => {
  it("validates 10DLC brand, campaign, and evidence metadata in profile schema", () => {
    const validData = {
      businessName: "Acme Corp",
      messagingUseCase: "Customer notifications and order updates",
      optInDescription: "Users sign up via web form at example.com/signup",
      privacyPolicyUrl: "https://example.com/privacy",
      termsOfServiceUrl: "https://example.com/terms",
      a2pRegistrationStatus: A2pRegistrationStatus.APPROVED,
      brandRegistrationId: "BR-10DLC-12345",
      campaignRegistrationId: "CR-10DLC-67890",
      sampleMessages: ["Your order #123 has shipped!", "Reply STOP to unsubscribe."],
      helpKeywordsCopy: "For help, email support@example.com or call 800-555-0199.",
      optOutKeywordsCopy: "Reply STOP to cancel all SMS notifications.",
      evidenceReference: "DOC-EVIDENCE-2026-001",
      verificationStatus: "VERIFIED",
      verificationDetails: { trustScore: 75, vettedAt: "2026-07-01T00:00:00Z" }
    };

    const result = complianceProfileUpdateSchema.safeParse(validData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.brandRegistrationId).toBe("BR-10DLC-12345");
      expect(result.data.campaignRegistrationId).toBe("CR-10DLC-67890");
      expect(result.data.sampleMessages).toHaveLength(2);
      expect(result.data.verificationStatus).toBe("VERIFIED");
    }
  });

  it("passes messaging hard gate when A2P is APPROVED and profile is complete", () => {
    const result = evaluateMessagingHardGate({
      demoMode: false,
      liveMessagingEnabled: true,
      messagingProvider: "twilio",
      complianceProfile: {
        businessName: "Acme Corp",
        messagingUseCase: "Notifications",
        optInDescription: "Web form opt-in",
        privacyPolicyUrl: "https://example.com/privacy",
        termsOfServiceUrl: "https://example.com/terms",
        a2pRegistrationStatus: A2pRegistrationStatus.APPROVED,
        brandRegistrationId: "BR-10DLC-12345",
        campaignRegistrationId: "CR-10DLC-67890",
        evidenceReference: "EV-001",
        verificationStatus: "VERIFIED"
      },
      contact: {
        phone: "+15555550199",
        consentStatus: "OPTED_IN",
        optedOutAt: null,
        archivedAt: null,
        consentCapturedAt: new Date("2026-06-01T12:00:00Z"),
        consentMethod: "web_form",
        consentDisclosure: "I agree to receive SMS alerts."
      }
    });

    expect(result.allowed).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("blocks messaging hard gate when A2P is NOT_STARTED or PENDING", () => {
    const result = evaluateMessagingHardGate({
      demoMode: false,
      liveMessagingEnabled: true,
      messagingProvider: "twilio",
      complianceProfile: {
        businessName: "Acme Corp",
        messagingUseCase: "Notifications",
        optInDescription: "Web form opt-in",
        privacyPolicyUrl: "https://example.com/privacy",
        termsOfServiceUrl: "https://example.com/terms",
        a2pRegistrationStatus: A2pRegistrationStatus.PENDING,
        brandRegistrationId: "BR-10DLC-12345",
        campaignRegistrationId: "CR-10DLC-67890",
        evidenceReference: "EV-001",
        verificationStatus: "PENDING_REVIEW"
      }
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("A2P_NOT_APPROVED");
  });
});
