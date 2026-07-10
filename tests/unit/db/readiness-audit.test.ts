import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordLiveReadinessAuditEvent, listLiveReadinessAuditEvents } from "@/lib/db/repositories/readiness-audit";
import type { ReadinessAuditInput } from "@/lib/db/repositories/readiness-audit";

const mocks = vi.hoisted(() => ({
  liveReadinessAuditEventCreate: vi.fn(),
  liveReadinessAuditEventFindMany: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    liveReadinessAuditEvent: {
      create: mocks.liveReadinessAuditEventCreate,
      findMany: mocks.liveReadinessAuditEventFindMany
    }
  }
}));

describe("ReadinessAudit Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordLiveReadinessAuditEvent", () => {
    it("creates an audit event with the correct data", async () => {
      const mockEvent = { id: "audit_1", orgId: "org_1", action: "COMPLIANCE_PROFILE_UPDATED", subjectType: "ComplianceProfile", subjectId: "camp_1" };
      mocks.liveReadinessAuditEventCreate.mockResolvedValue(mockEvent);

      const input: ReadinessAuditInput = {
        action: "COMPLIANCE_PROFILE_UPDATED",
        subjectType: "ComplianceProfile",
        subjectId: "camp_1",
        actorUserId: "user_1",
        metadata: { reason: "manual" }
      };

      const result = await recordLiveReadinessAuditEvent("org_1", input);

      expect(result).toEqual(mockEvent);
      expect(mocks.liveReadinessAuditEventCreate).toHaveBeenCalledWith({
        data: {
          orgId: "org_1",
          actorUserId: "user_1",
          action: "COMPLIANCE_PROFILE_UPDATED",
          subjectType: "ComplianceProfile",
          subjectId: "camp_1",
          metadata: { reason: "manual" }
        }
      });
    });
  });

  describe("listLiveReadinessAuditEvents", () => {
    it("lists audit events without filters", async () => {
      const mockEvents = [{ id: "audit_1", action: "COMPLIANCE_PROFILE_UPDATED" }];
      mocks.liveReadinessAuditEventFindMany.mockResolvedValue(mockEvents);

      const result = await listLiveReadinessAuditEvents("org_1");

      expect(result).toEqual(mockEvents);
      expect(mocks.liveReadinessAuditEventFindMany).toHaveBeenCalledWith({
        where: {
          orgId: "org_1"
        },
        orderBy: { createdAt: "desc" },
        take: 50
      });
    });

    it("lists audit events with custom take limit", async () => {
      mocks.liveReadinessAuditEventFindMany.mockResolvedValue([]);

      await listLiveReadinessAuditEvents("org_1", 10);

      expect(mocks.liveReadinessAuditEventFindMany).toHaveBeenCalledWith(expect.objectContaining({
        take: 10
      }));
    });

    it("lists audit events with action filter", async () => {
      mocks.liveReadinessAuditEventFindMany.mockResolvedValue([]);

      await listLiveReadinessAuditEvents("org_1", 50, { action: "PROVIDER_NUMBER_UPSERTED" });

      expect(mocks.liveReadinessAuditEventFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          orgId: "org_1",
          action: "PROVIDER_NUMBER_UPSERTED"
        }
      }));
    });

    it("lists audit events with subjectType filter", async () => {
      mocks.liveReadinessAuditEventFindMany.mockResolvedValue([]);

      await listLiveReadinessAuditEvents("org_1", 50, { subjectType: "ProviderPhoneNumber" });

      expect(mocks.liveReadinessAuditEventFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          orgId: "org_1",
          subjectType: "ProviderPhoneNumber"
        }
      }));
    });

    it("lists audit events with multiple filters", async () => {
      mocks.liveReadinessAuditEventFindMany.mockResolvedValue([]);

      await listLiveReadinessAuditEvents("org_1", 25, { action: "PROVIDER_CREDENTIAL_METADATA_UPSERTED", subjectType: "ProviderCredential" });

      expect(mocks.liveReadinessAuditEventFindMany).toHaveBeenCalledWith({
        where: {
          orgId: "org_1",
          action: "PROVIDER_CREDENTIAL_METADATA_UPSERTED",
          subjectType: "ProviderCredential"
        },
        orderBy: { createdAt: "desc" },
        take: 25
      });
    });
  });
});
