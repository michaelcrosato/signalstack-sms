import { A2pRegistrationStatus, ConsentStatus, type AuditEvent, type ConsentEvent } from "@prisma/client";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  addSuppressionEntry,
  removeSuppressionEntry,
  isPhoneSuppressed,
  getSuppressionReason,
  normalizePhone,
  listSuppressionEntries
} from "@/lib/db/repositories/suppression";
import { evaluateMessagingHardGate } from "@/lib/compliance/gates";
import {
  serializeConsentEventsCsv,
  serializeAuditEventsCsv
} from "@/lib/compliance/consent-audit-export";

const mocks = vi.hoisted(() => ({
  suppressionUpsert: vi.fn(),
  suppressionDeleteMany: vi.fn(),
  suppressionCount: vi.fn(),
  suppressionFindFirst: vi.fn(),
  suppressionFindMany: vi.fn(),
  withTenantTransaction: vi.fn()
}));

vi.mock("@/lib/db/tenant-context", () => ({
  withTenantTransaction: vi.fn((ctx, callback) => {
    mocks.withTenantTransaction(ctx);
    return callback({
      suppressionEntry: {
        upsert: mocks.suppressionUpsert,
        deleteMany: mocks.suppressionDeleteMany,
        count: mocks.suppressionCount,
        findFirst: mocks.suppressionFindFirst,
        findMany: mocks.suppressionFindMany
      }
    });
  })
}));

describe("M8 Challenger Empirical Verification: Suppression Lists, Hard Gates & Export Sanitization", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* =========================================================================
   * 1. Org-Scoped vs Global Suppression Checks
   * ========================================================================= */
  describe("1. Org-Scoped vs Global Suppression Checks", () => {
    describe("Phone Normalization", () => {
      it("normalizes 10-digit US phones to E.164 (+1xxxxxxxxxx)", () => {
        expect(normalizePhone("4155550199")).toBe("+14155550199");
      });

      it("normalizes 11-digit US phones starting with 1 to E.164 (+1xxxxxxxxxx)", () => {
        expect(normalizePhone("14155550199")).toBe("+14155550199");
      });

      it("preserves already valid E.164 phones", () => {
        expect(normalizePhone("+14155550199")).toBe("+14155550199");
        expect(normalizePhone("+447911123456")).toBe("+447911123456");
      });

      it("strips formatting characters like parens, dashes, spaces", () => {
        expect(normalizePhone("+1 (415) 555-0199")).toBe("+14155550199");
        expect(normalizePhone("415-555-0199")).toBe("+14155550199");
        expect(normalizePhone("  +1 415 555 0199  ")).toBe("+14155550199");
      });
    });

    describe("Org-Scoped vs Global Scoping Logic", () => {
      it("queries both org-scoped AND global suppression entries when orgId is provided", async () => {
        mocks.suppressionCount.mockResolvedValueOnce(1);

        const isSuppressed = await isPhoneSuppressed("4155550199", "org_acme");

        expect(isSuppressed).toBe(true);
        expect(mocks.suppressionCount).toHaveBeenCalledWith({
          where: {
            phone: "+14155550199",
            OR: [{ orgId: "org_acme" }, { orgId: null }]
          }
        });
      });

      it("queries ONLY global suppression entries (orgId: null) when orgId is null or omitted", async () => {
        mocks.suppressionCount.mockResolvedValueOnce(0);

        const isSuppressed = await isPhoneSuppressed("4155550199", null);

        expect(isSuppressed).toBe(false);
        expect(mocks.suppressionCount).toHaveBeenCalledWith({
          where: {
            phone: "+14155550199",
            orgId: null
          }
        });
      });

      it("retrieves the latest suppression reason across org and global scopes", async () => {
        mocks.suppressionFindFirst.mockResolvedValueOnce({
          reason: "GLOBAL_OPT_OUT",
          orgId: null,
          createdAt: new Date()
        });

        const reason = await getSuppressionReason("4155550199", "org_acme");

        expect(reason).toBe("GLOBAL_OPT_OUT");
        expect(mocks.suppressionFindFirst).toHaveBeenCalledWith({
          where: {
            phone: "+14155550199",
            OR: [{ orgId: "org_acme" }, { orgId: null }]
          },
          orderBy: { createdAt: "desc" }
        });
      });

      it("lists suppression entries including global entries when orgId is supplied", async () => {
        mocks.suppressionFindMany.mockResolvedValueOnce([]);

        await listSuppressionEntries({ orgId: "org_acme", limit: 20, offset: 10 });

        expect(mocks.suppressionFindMany).toHaveBeenCalledWith({
          where: { OR: [{ orgId: "org_acme" }, { orgId: null }] },
          orderBy: { createdAt: "desc" },
          take: 20,
          skip: 10
        });
      });

      it("defaults to tenant transaction orgId 'global' when adding a global suppression entry (orgId: null)", async () => {
        mocks.suppressionUpsert.mockResolvedValueOnce({
          id: "sup_global_1",
          orgId: null,
          phone: "+14155550199",
          reason: "CARRIER_BLOCK",
          source: "SYSTEM"
        });

        await addSuppressionEntry({
          orgId: null,
          phone: "4155550199",
          reason: "CARRIER_BLOCK",
          source: "SYSTEM"
        });

        expect(mocks.withTenantTransaction).toHaveBeenCalledWith(
          { orgId: "global" }
        );
        expect(mocks.suppressionUpsert).toHaveBeenCalledWith({
          where: { orgId_phone: { orgId: null, phone: "+14155550199" } },
          update: { reason: "CARRIER_BLOCK", source: "SYSTEM", metadata: expect.anything() },
          create: {
            orgId: null,
            phone: "+14155550199",
            reason: "CARRIER_BLOCK",
            source: "SYSTEM",
            metadata: expect.anything()
          }
        });
      });

      it("removes suppression entries cleanly by orgId scope", async () => {
        mocks.suppressionDeleteMany.mockResolvedValueOnce({ count: 1 });

        await removeSuppressionEntry("4155550199", "org_acme");

        expect(mocks.suppressionDeleteMany).toHaveBeenCalledWith({
          where: { orgId: "org_acme", phone: "+14155550199" }
        });
      });
    });
  });

  /* =========================================================================
   * 2. Hard Compliance Gate Evaluation
   * ========================================================================= */
  describe("2. Hard Compliance Gate Evaluation", () => {
    const validProfile = {
      businessName: "Acme Corp",
      messagingUseCase: "Marketing Alerts",
      optInDescription: "Web signup form",
      privacyPolicyUrl: "https://example.com/privacy",
      termsOfServiceUrl: "https://example.com/terms",
      a2pRegistrationStatus: A2pRegistrationStatus.APPROVED
    };

    const validContact = {
      phone: "+14155550100",
      consentStatus: ConsentStatus.OPTED_IN,
      optedOutAt: null,
      archivedAt: null,
      consentCapturedAt: new Date("2026-01-01T12:00:00Z"),
      consentMethod: "WEB_FORM",
      consentDisclosure: "I agree to receive SMS text messages. Msg & data rates may apply."
    };

    const readyGateInput = {
      demoMode: false,
      liveMessagingEnabled: true,
      messagingProvider: "twilio",
      complianceProfile: validProfile,
      contact: validContact,
      suppressed: false,
      suppressionReason: null
    };

    it("allows sending when all provider, compliance profile, consent, and suppression checks pass", () => {
      const result = evaluateMessagingHardGate(readyGateInput);
      expect(result.allowed).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it("blocks send with LIVE_MESSAGING_DISABLED when live messaging is disabled", () => {
      const result = evaluateMessagingHardGate({ ...readyGateInput, liveMessagingEnabled: false });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain("LIVE_MESSAGING_DISABLED");
    });

    it("blocks send with DEMO_MODE_ENABLED when demo mode is active", () => {
      const result = evaluateMessagingHardGate({ ...readyGateInput, demoMode: true });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain("DEMO_MODE_ENABLED");
    });

    it("blocks send with DUMMY_PROVIDER_SELECTED when provider is 'dummy'", () => {
      const result = evaluateMessagingHardGate({ ...readyGateInput, messagingProvider: "dummy" });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain("DUMMY_PROVIDER_SELECTED");
    });

    it("blocks send with COMPLIANCE_PROFILE_INCOMPLETE when compliance profile is missing required fields", () => {
      const result = evaluateMessagingHardGate({
        ...readyGateInput,
        complianceProfile: { ...validProfile, termsOfServiceUrl: null }
      });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain("COMPLIANCE_PROFILE_INCOMPLETE");
    });

    it("blocks send with A2P_NOT_APPROVED when 10DLC A2P status is not APPROVED", () => {
      const statusList = [
        A2pRegistrationStatus.PENDING,
        A2pRegistrationStatus.REJECTED,
        A2pRegistrationStatus.NOT_STARTED
      ];

      for (const status of statusList) {
        const result = evaluateMessagingHardGate({
          ...readyGateInput,
          complianceProfile: { ...validProfile, a2pRegistrationStatus: status }
        });
        expect(result.allowed).toBe(false);
        expect(result.reasons).toContain("A2P_NOT_APPROVED");
      }
    });

    it("blocks send with CONTACT_SUPPRESSED when suppressed flag is true or reason is set", () => {
      const resultFlag = evaluateMessagingHardGate({ ...readyGateInput, suppressed: true });
      expect(resultFlag.allowed).toBe(false);
      expect(resultFlag.reasons).toContain("CONTACT_SUPPRESSED");

      const resultReason = evaluateMessagingHardGate({ ...readyGateInput, suppressionReason: "STOP_KEYWORD" });
      expect(resultReason.allowed).toBe(false);
      expect(resultReason.reasons).toContain("CONTACT_SUPPRESSED");
    });

    it("blocks send with CONTACT_ARCHIVED when contact is archived", () => {
      const result = evaluateMessagingHardGate({
        ...readyGateInput,
        contact: { ...validContact, archivedAt: new Date() }
      });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain("CONTACT_ARCHIVED");
    });

    it("blocks send with PENDING_DOUBLE_OPT_IN when consent status is PENDING_DOUBLE_OPT_IN", () => {
      const result = evaluateMessagingHardGate({
        ...readyGateInput,
        contact: { ...validContact, consentStatus: ConsentStatus.PENDING_DOUBLE_OPT_IN }
      });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain("PENDING_DOUBLE_OPT_IN");
    });

    it("blocks send with CONSENT_NOT_OPTED_IN when consent status is NOT OPTED_IN", () => {
      const result = evaluateMessagingHardGate({
        ...readyGateInput,
        contact: { ...validContact, consentStatus: ConsentStatus.UNKNOWN }
      });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain("CONSENT_NOT_OPTED_IN");
    });

    it("blocks send with CONTACT_OPTED_OUT when contact optedOutAt is populated or consent status is OPTED_OUT", () => {
      const result = evaluateMessagingHardGate({
        ...readyGateInput,
        contact: { ...validContact, consentStatus: ConsentStatus.OPTED_OUT, optedOutAt: new Date() }
      });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain("CONTACT_OPTED_OUT");
      expect(result.reasons).toContain("CONSENT_NOT_OPTED_IN");
    });

    it("blocks send with CONSENT_EVIDENCE_MISSING when consent evidence is missing or blank", () => {
      const resultNoDate = evaluateMessagingHardGate({
        ...readyGateInput,
        contact: { ...validContact, consentCapturedAt: null }
      });
      expect(resultNoDate.allowed).toBe(false);
      expect(resultNoDate.reasons).toContain("CONSENT_EVIDENCE_MISSING");

      const resultBlankMethod = evaluateMessagingHardGate({
        ...readyGateInput,
        contact: { ...validContact, consentMethod: "   " }
      });
      expect(resultBlankMethod.allowed).toBe(false);
      expect(resultBlankMethod.reasons).toContain("CONSENT_EVIDENCE_MISSING");
    });

    it("blocks send with QUIET_HOURS when current time falls within recipient quiet hours window", () => {
      // 03:00 UTC = 20:00 (8pm) PDT. In FL, quiet hours start at 20:00 (8pm).
      const result = evaluateMessagingHardGate({
        ...readyGateInput,
        contact: { ...validContact, state: "FL" },
        quietHours: {
          now: new Date("2026-06-02T03:00:00Z"),
          timeZone: "America/Los_Angeles",
          state: "FL"
        }
      });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain("QUIET_HOURS");
    });

    it("collects ALL applicable violation reasons when multiple hard gates fail simultaneously", () => {
      const result = evaluateMessagingHardGate({
        demoMode: true,
        liveMessagingEnabled: false,
        messagingProvider: "dummy",
        complianceProfile: null,
        suppressed: true,
        contact: {
          phone: "+14155550100",
          consentStatus: ConsentStatus.OPTED_OUT,
          optedOutAt: new Date(),
          archivedAt: new Date()
        }
      });

      expect(result.allowed).toBe(false);
      expect(result.reasons).toEqual(
        expect.arrayContaining([
          "LIVE_MESSAGING_DISABLED",
          "DEMO_MODE_ENABLED",
          "DUMMY_PROVIDER_SELECTED",
          "COMPLIANCE_PROFILE_INCOMPLETE",
          "A2P_NOT_APPROVED",
          "CONTACT_SUPPRESSED",
          "CONTACT_ARCHIVED",
          "CONSENT_NOT_OPTED_IN",
          "CONTACT_OPTED_OUT",
          "CONSENT_EVIDENCE_MISSING"
        ])
      );
    });
  });

  /* =========================================================================
   * 3. CSV Export Sanitization Against Formula Injection Characters
   * ========================================================================= */
  describe("3. CSV Export Sanitization Against Formula Injection Characters (=, +, -, @, \\t, \\r)", () => {
    const baseConsentEvent: ConsentEvent = {
      id: "ce_test_1",
      orgId: "org_test",
      contactId: "cnt_test",
      phone: "+15555550100",
      consentStatus: ConsentStatus.OPTED_IN,
      previousStatus: null,
      source: "web_form",
      sourceIp: "127.0.0.1",
      channel: "WEB",
      actorUserId: "usr_1",
      consentCapturedAt: new Date("2026-07-23T10:00:00.000Z"),
      consentMethod: "form_checkbox",
      consentDisclosure: "I agree",
      evidenceReference: "REF-001",
      metadata: null,
      createdAt: new Date("2026-07-23T10:00:00.000Z")
    };

    const baseAuditEvent: AuditEvent = {
      id: "ae_test_1",
      orgId: "org_test",
      actorUserId: "usr_1",
      apiCredentialId: null,
      action: "COMPLIANCE_PROFILE_UPDATED",
      subjectType: "ComplianceProfile",
      subjectId: "cp_1",
      sourceIp: "127.0.0.1",
      channel: "WEB",
      metadata: { note: "test" },
      createdAt: new Date("2026-07-23T10:00:00.000Z")
    };

    it("sanitizes '=' formula injection in ConsentEvent fields", () => {
      const payload: ConsentEvent = {
        ...baseConsentEvent,
        phone: "=cmd|' /C calc'!A1",
        consentMethod: "=1+1",
        consentDisclosure: "=SUM(B1:B10)"
      };

      const csv = serializeConsentEventsCsv([payload]);

      expect(csv).toContain("\"'=cmd|' /C calc'!A1\"");
      expect(csv).toContain("\"'=1+1\"");
      expect(csv).toContain("\"'=SUM(B1:B10)\"");
    });

    it("sanitizes '+' formula injection in ConsentEvent fields while preserving E.164 phone representation", () => {
      const payload: ConsentEvent = {
        ...baseConsentEvent,
        phone: "+15555550100",
        consentMethod: "+1+1",
        consentDisclosure: "+SUM(1,2)"
      };

      const csv = serializeConsentEventsCsv([payload]);

      // Phone +15555550100 gets leading single quote so spreadsheets treat it as verbatim string text
      expect(csv).toContain("\"'+15555550100\"");
      expect(csv).toContain("\"'+1+1\"");
      expect(csv).toContain("\"'+SUM(1,2)\"");
    });

    it("sanitizes '-' formula injection in ConsentEvent fields", () => {
      const payload: ConsentEvent = {
        ...baseConsentEvent,
        consentMethod: "-100",
        evidenceReference: "-cmd|' /C calc'!A1"
      };

      const csv = serializeConsentEventsCsv([payload]);

      expect(csv).toContain("\"'-100\"");
      expect(csv).toContain("\"'-cmd|' /C calc'!A1\"");
    });

    it("sanitizes '@' formula injection in ConsentEvent fields", () => {
      const payload: ConsentEvent = {
        ...baseConsentEvent,
        consentMethod: "@SUM(A1:A5)",
        evidenceReference: "@EXEC('malicious')"
      };

      const csv = serializeConsentEventsCsv([payload]);

      expect(csv).toContain("\"'@SUM(A1:A5)\"");
      expect(csv).toContain("\"'@EXEC('malicious')\"");
    });

    it("sanitizes leading Tab (\\t) whitespace before formula characters", () => {
      const payload: ConsentEvent = {
        ...baseConsentEvent,
        consentMethod: "\t=cmd|' /C calc'!A1",
        consentDisclosure: "\t\t+1+1",
        evidenceReference: "\t-100"
      };

      const csv = serializeConsentEventsCsv([payload]);

      // Checks that leading tab whitespace doesn't bypass formula neutralization
      expect(csv).toContain("'\t=cmd");
      expect(csv).toContain("'\t\t+1+1");
      expect(csv).toContain("'\t-100");
    });

    it("sanitizes leading Carriage Return (\\r) whitespace before formula characters", () => {
      const payload: ConsentEvent = {
        ...baseConsentEvent,
        consentMethod: "\r=cmd|' /C calc'!A1",
        consentDisclosure: "\r\n+1+1"
      };

      const csv = serializeConsentEventsCsv([payload]);

      expect(csv).toContain("'\r=cmd");
      expect(csv).toContain("'\r\n+1+1");
    });

    it("handles embedded quotes and newlines safely in serializeConsentEventsCsv", () => {
      const payload: ConsentEvent = {
        ...baseConsentEvent,
        consentDisclosure: 'Line 1\r\nLine 2 with "quotes"'
      };

      const csv = serializeConsentEventsCsv([payload]);

      expect(csv).toContain('"Line 1\r\nLine 2 with ""quotes"""');
    });

    it("sanitizes all formula injection characters in serializeAuditEventsCsv", () => {
      const payload: AuditEvent = {
        ...baseAuditEvent,
        id: "=forged_id",
        action: "+FORGED_ACTION",
        subjectType: "-ForgedType",
        subjectId: "@ForgedId",
        sourceIp: "\t=127.0.0.1",
        metadata: { malicious: "\r=cmd|' /C calc'!A1" }
      };

      const csv = serializeAuditEventsCsv([payload]);

      expect(csv).toContain("\"'=forged_id\"");
      expect(csv).toContain("\"'+FORGED_ACTION\"");
      expect(csv).toContain("\"'-ForgedType\"");
      expect(csv).toContain("\"'@ForgedId\"");
      expect(csv).toContain("'\t=127.0.0.1");
      expect(csv).toContain("\\r=cmd");
    });
  });
});
