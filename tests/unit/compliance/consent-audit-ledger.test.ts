import { ConsentStatus, type AuditEvent, type ConsentEvent } from "@prisma/client";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  recordConsentEvent,
  listConsentEvents,
  getConsentEvent
} from "@/lib/db/repositories/consent-events";
import {
  recordAuditEvent,
  listAuditEvents,
  getAuditEvent
} from "@/lib/db/repositories/audit-events";
import {
  serializeConsentEventsCsv,
  serializeAuditEventsCsv
} from "@/lib/compliance/consent-audit-export";

const mocks = vi.hoisted(() => ({
  consentEventCreate: vi.fn(),
  consentEventFindMany: vi.fn(),
  consentEventFindFirst: vi.fn(),
  auditEventCreate: vi.fn(),
  auditEventFindMany: vi.fn(),
  auditEventFindFirst: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    consentEvent: {
      create: mocks.consentEventCreate,
      findMany: mocks.consentEventFindMany,
      findFirst: mocks.consentEventFindFirst
    },
    auditEvent: {
      create: mocks.auditEventCreate,
      findMany: mocks.auditEventFindMany,
      findFirst: mocks.auditEventFindFirst
    }
  }
}));

vi.mock("@/lib/db/tenant-context", () => ({
  withTenantTransaction: vi.fn((_ctx, callback) =>
    callback({
      consentEvent: {
        create: mocks.consentEventCreate,
        findMany: mocks.consentEventFindMany,
        findFirst: mocks.consentEventFindFirst
      },
      auditEvent: {
        create: mocks.auditEventCreate,
        findMany: mocks.auditEventFindMany,
        findFirst: mocks.auditEventFindFirst
      }
    })
  )
}));

describe("Append-Only Consent & Audit Ledger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ConsentEvent Repository", () => {
    it("records a new consent event with timestamp, actor, channel, and source IP", async () => {
      const capturedAt = new Date("2026-07-20T10:00:00Z");
      const mockCreated: ConsentEvent = {
        id: "ce_123",
        orgId: "org_1",
        contactId: "cnt_1",
        phone: "+15555550100",
        consentStatus: ConsentStatus.OPTED_IN,
        previousStatus: ConsentStatus.UNKNOWN,
        source: "web_form",
        sourceIp: "192.168.1.1",
        channel: "WEB",
        actorUserId: "usr_admin",
        consentCapturedAt: capturedAt,
        consentMethod: "form_checkbox",
        consentDisclosure: "I agree to SMS",
        evidenceReference: "REF-100",
        metadata: null,
        createdAt: new Date()
      };

      mocks.consentEventCreate.mockResolvedValueOnce(mockCreated);

      const result = await recordConsentEvent("org_1", {
        contactId: "cnt_1",
        phone: "+15555550100",
        consentStatus: ConsentStatus.OPTED_IN,
        previousStatus: ConsentStatus.UNKNOWN,
        source: "web_form",
        sourceIp: "192.168.1.1",
        channel: "WEB",
        actorUserId: "usr_admin",
        consentCapturedAt: capturedAt,
        consentMethod: "form_checkbox",
        consentDisclosure: "I agree to SMS",
        evidenceReference: "REF-100"
      });

      expect(result).toEqual(mockCreated);
      expect(mocks.consentEventCreate).toHaveBeenCalledTimes(1);
    });

    it("lists and gets consent events by orgId", async () => {
      mocks.consentEventFindMany.mockResolvedValueOnce([]);
      mocks.consentEventFindFirst.mockResolvedValueOnce(null);

      await listConsentEvents("org_1", { phone: "+15555550100", limit: 10 });
      await getConsentEvent("org_1", "ce_123");

      expect(mocks.consentEventFindMany).toHaveBeenCalledTimes(1);
      expect(mocks.consentEventFindFirst).toHaveBeenCalledTimes(1);
    });

    it("serializes consent events to CSV cleanly", () => {
      const now = new Date("2026-07-20T10:00:00.000Z");
      const events: ConsentEvent[] = [
        {
          id: "ce_1",
          orgId: "org_1",
          contactId: "cnt_1",
          phone: "+15555550100",
          consentStatus: ConsentStatus.OPTED_IN,
          previousStatus: ConsentStatus.UNKNOWN,
          source: "web_form",
          sourceIp: "10.0.0.1",
          channel: "WEB",
          actorUserId: "usr_1",
          consentCapturedAt: now,
          consentMethod: "web_checkbox",
          consentDisclosure: "I agree to terms",
          evidenceReference: "REF-1",
          metadata: null,
          createdAt: now
        }
      ];

      const csv = serializeConsentEventsCsv(events);
      expect(csv).toContain("id,orgId,contactId,phone,consentStatus");
      expect(csv).toContain('"ce_1"');
      expect(csv).toContain("'+15555550100");
      expect(csv).toContain('"OPTED_IN"');
      expect(csv).toContain('"web_form"');
    });
  });

  describe("AuditEvent Repository", () => {
    it("records a system/compliance audit event", async () => {
      const mockCreated: AuditEvent = {
        id: "ae_123",
        orgId: "org_1",
        actorUserId: "usr_admin",
        apiCredentialId: null,
        action: "COMPLIANCE_PROFILE_UPDATED",
        subjectType: "ComplianceProfile",
        subjectId: "cp_1",
        sourceIp: "127.0.0.1",
        channel: "ADMIN_UI",
        metadata: { field: "businessName" },
        createdAt: new Date()
      };

      mocks.auditEventCreate.mockResolvedValueOnce(mockCreated);

      const result = await recordAuditEvent("org_1", {
        actorUserId: "usr_admin",
        action: "COMPLIANCE_PROFILE_UPDATED",
        subjectType: "ComplianceProfile",
        subjectId: "cp_1",
        sourceIp: "127.0.0.1",
        channel: "ADMIN_UI",
        metadata: { field: "businessName" }
      });

      expect(result).toEqual(mockCreated);
      expect(mocks.auditEventCreate).toHaveBeenCalledTimes(1);
    });

    it("lists and gets audit events by orgId", async () => {
      mocks.auditEventFindMany.mockResolvedValueOnce([]);
      mocks.auditEventFindFirst.mockResolvedValueOnce(null);

      await listAuditEvents("org_1", { action: "COMPLIANCE_PROFILE_UPDATED" });
      await getAuditEvent("org_1", "ae_123");

      expect(mocks.auditEventFindMany).toHaveBeenCalledTimes(1);
      expect(mocks.auditEventFindFirst).toHaveBeenCalledTimes(1);
    });

    it("serializes audit events to CSV cleanly", () => {
      const now = new Date("2026-07-20T10:00:00.000Z");
      const events: AuditEvent[] = [
        {
          id: "ae_1",
          orgId: "org_1",
          actorUserId: "usr_1",
          apiCredentialId: null,
          action: "SUPPRESSION_ADDED",
          subjectType: "SuppressionEntry",
          subjectId: "se_1",
          sourceIp: "10.0.0.1",
          channel: "API",
          metadata: { phone: "+15555550199" },
          createdAt: now
        }
      ];

      const csv = serializeAuditEventsCsv(events);
      expect(csv).toContain("id,orgId,actorUserId,apiCredentialId,action");
      expect(csv).toContain('"ae_1"');
      expect(csv).toContain('"SUPPRESSION_ADDED"');
    });
  });
});
