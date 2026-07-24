import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  addSuppressionEntry,
  isPhoneSuppressed,
  getSuppressionReason,
  normalizePhone
} from "@/lib/db/repositories/suppression";
import { evaluateMessagingHardGate } from "@/lib/compliance/gates";

const mocks = vi.hoisted(() => ({
  suppressionUpsert: vi.fn(),
  suppressionDeleteMany: vi.fn(),
  suppressionCount: vi.fn(),
  suppressionFindFirst: vi.fn()
}));

vi.mock("@/lib/db/tenant-context", () => ({
  withTenantTransaction: vi.fn((_ctx, callback) =>
    callback({
      suppressionEntry: {
        upsert: mocks.suppressionUpsert,
        deleteMany: mocks.suppressionDeleteMany,
        count: mocks.suppressionCount,
        findFirst: mocks.suppressionFindFirst
      }
    })
  )
}));

describe("Global & Org-Level Suppression Lists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Phone Normalization", () => {
    it("normalizes 10-digit US phones to E.164 format", () => {
      expect(normalizePhone("5555550199")).toBe("+15555550199");
      expect(normalizePhone("15555550199")).toBe("+15555550199");
      expect(normalizePhone("+15555550199")).toBe("+15555550199");
    });
  });

  describe("Suppression Repository", () => {
    it("adds an org-level suppression entry", async () => {
      mocks.suppressionUpsert.mockResolvedValueOnce({
        id: "sup_1",
        orgId: "org_1",
        phone: "+15555550199",
        reason: "STOP_REQUEST",
        source: "INBOUND_SMS"
      });

      const entry = await addSuppressionEntry({
        orgId: "org_1",
        phone: "5555550199",
        reason: "STOP_REQUEST",
        source: "INBOUND_SMS"
      });

      expect(entry.phone).toBe("+15555550199");
      expect(mocks.suppressionUpsert).toHaveBeenCalledTimes(1);
    });

    it("checks if phone is suppressed for an organization", async () => {
      mocks.suppressionCount.mockResolvedValueOnce(1);

      const suppressed = await isPhoneSuppressed("5555550199", "org_1");
      expect(suppressed).toBe(true);
      expect(mocks.suppressionCount).toHaveBeenCalledWith({
        where: {
          phone: "+15555550199",
          OR: [{ orgId: "org_1" }, { orgId: null }]
        }
      });
    });

    it("retrieves the suppression reason", async () => {
      mocks.suppressionFindFirst.mockResolvedValueOnce({
        reason: "CARRIER_COMPLAINT"
      });

      const reason = await getSuppressionReason("5555550199", "org_1");
      expect(reason).toBe("CARRIER_COMPLAINT");
    });
  });

  describe("Messaging Hard Gate Integration", () => {
    it("blocks send when contact is suppressed", () => {
      const result = evaluateMessagingHardGate({
        demoMode: false,
        liveMessagingEnabled: true,
        messagingProvider: "twilio",
        suppressed: true,
        suppressionReason: "STOP_REQUEST",
        complianceProfile: {
          businessName: "Acme Corp",
          messagingUseCase: "Notifications",
          optInDescription: "Web form opt-in",
          privacyPolicyUrl: "https://example.com/privacy",
          termsOfServiceUrl: "https://example.com/terms",
          a2pRegistrationStatus: "APPROVED"
        },
        contact: {
          phone: "+15555550199",
          consentStatus: "OPTED_IN",
          optedOutAt: null,
          archivedAt: null,
          consentCapturedAt: new Date(),
          consentMethod: "form",
          consentDisclosure: "I agree"
        }
      });

      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain("CONTACT_SUPPRESSED");
    });
  });
});
