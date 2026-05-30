import { A2pRegistrationStatus, ConsentStatus } from "@prisma/client";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { evaluateMessagingHardGate } from "@/lib/compliance/gates";
import { upsertContact } from "@/lib/db/repositories/contacts";
import { prisma } from "@/lib/db/prisma";

describe("Double Opt-In (DOI) Workflow Seam", () => {
  const originalEnv = process.env.DOUBLE_OPT_IN_REQUIRED;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env.DOUBLE_OPT_IN_REQUIRED = originalEnv;
  });

  const completeProfile = {
    businessName: "SignalStack Demo Co",
    messagingUseCase: "Marketing updates to opted-in contacts.",
    optInDescription: "Contacts opt in through a demo form.",
    privacyPolicyUrl: "https://example.com/privacy",
    termsOfServiceUrl: "https://example.com/terms",
    a2pRegistrationStatus: A2pRegistrationStatus.APPROVED
  };

  it("blocks PENDING_DOUBLE_OPT_IN contacts via the messaging hard gate", () => {
    const result = evaluateMessagingHardGate({
      demoMode: false,
      liveMessagingEnabled: true,
      messagingProvider: "twilio",
      complianceProfile: completeProfile,
      contact: {
        consentStatus: ConsentStatus.PENDING_DOUBLE_OPT_IN,
        optedOutAt: null,
        archivedAt: null,
        consentCapturedAt: null,
        consentMethod: null,
        consentDisclosure: null
      }
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("PENDING_DOUBLE_OPT_IN");
  });

  it("forces PENDING_DOUBLE_OPT_IN status upon contact creation if configured", async () => {
    process.env.DOUBLE_OPT_IN_REQUIRED = "true";

    const org = await prisma.organization.create({
      data: { slug: `org-doi-${Date.now()}`, name: `Org DOI-${Date.now()}`, demoMode: true }
    });

    const contact = await upsertContact(org.id, {
      phone: `+1555010${Math.floor(1000 + Math.random() * 9000)}`,
      consentStatus: ConsentStatus.OPTED_IN,
      tagNames: [],
      listNames: []
    });

    expect(contact.consentStatus).toBe(ConsentStatus.PENDING_DOUBLE_OPT_IN);

    // Verify a double opt-in outbound message was created in the conversation
    const messages = await prisma.message.findMany({
      where: { contactId: contact.id }
    });

    expect(messages.length).toBe(1);
    expect(messages[0].direction).toBe("OUTBOUND");
    expect(messages[0].body).toContain("Please reply YES to confirm subscription");
  });
});
