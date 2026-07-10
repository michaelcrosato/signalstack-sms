import { describe, expect, it, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  liveReadinessAuditEvent: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

import { recordLiveReadinessAuditEvent, listLiveReadinessAuditEvents } from "@/lib/db/repositories/readiness-audit";

describe("ReadinessAudit repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordLiveReadinessAuditEvent", () => {
    it("should create a new event with the provided data", async () => {
      const mockResult = { id: "123", orgId: "org-1" };
      mockPrisma.liveReadinessAuditEvent.create.mockResolvedValue(mockResult as never);

      const input = {
        actorUserId: "user-1",
        action: "PROVIDER_NUMBER_UPSERTED",
        subjectType: "ProviderPhoneNumber",
        subjectId: "sub-1",
        metadata: { key: "value" }
      };

      const result = await recordLiveReadinessAuditEvent("org-1", input);

      expect(mockPrisma.liveReadinessAuditEvent.create).toHaveBeenCalledWith({
        data: {
          orgId: "org-1",
          actorUserId: "user-1",
          action: "PROVIDER_NUMBER_UPSERTED",
          subjectType: "ProviderPhoneNumber",
          subjectId: "sub-1",
          metadata: { key: "value" }
        }
      });
      expect(result).toBe(mockResult);
    });

    it("should create an event omitting optional fields if not provided", async () => {
      mockPrisma.liveReadinessAuditEvent.create.mockResolvedValue({} as never);
      const input = {
        action: "PROVIDER_NUMBER_UPSERTED",
        subjectType: "ProviderPhoneNumber",
      };

      await recordLiveReadinessAuditEvent("org-1", input);

      expect(mockPrisma.liveReadinessAuditEvent.create).toHaveBeenCalledWith({
        data: {
          orgId: "org-1",
          actorUserId: undefined,
          action: "PROVIDER_NUMBER_UPSERTED",
          subjectType: "ProviderPhoneNumber",
          subjectId: undefined,
          metadata: undefined
        }
      });
    });
  });

  describe("listLiveReadinessAuditEvents", () => {
    it("should list events with default parameters", async () => {
      const mockResult = [{ id: "1" }];
      mockPrisma.liveReadinessAuditEvent.findMany.mockResolvedValue(mockResult as never);

      const result = await listLiveReadinessAuditEvents("org-1");

      expect(mockPrisma.liveReadinessAuditEvent.findMany).toHaveBeenCalledWith({
        where: { orgId: "org-1" },
        orderBy: { createdAt: "desc" },
        take: 50
      });
      expect(result).toBe(mockResult);
    });

    it("should list events with custom take limit", async () => {
      mockPrisma.liveReadinessAuditEvent.findMany.mockResolvedValue([] as never);

      await listLiveReadinessAuditEvents("org-1", 10);

      expect(mockPrisma.liveReadinessAuditEvent.findMany).toHaveBeenCalledWith({
        where: { orgId: "org-1" },
        orderBy: { createdAt: "desc" },
        take: 10
      });
    });

    it("should apply action filter when provided", async () => {
      mockPrisma.liveReadinessAuditEvent.findMany.mockResolvedValue([] as never);

      await listLiveReadinessAuditEvents("org-1", 50, { action: "COMPLIANCE_PROFILE_UPDATED" });

      expect(mockPrisma.liveReadinessAuditEvent.findMany).toHaveBeenCalledWith({
        where: { orgId: "org-1", action: "COMPLIANCE_PROFILE_UPDATED" },
        orderBy: { createdAt: "desc" },
        take: 50
      });
    });

    it("should apply subjectType filter when provided", async () => {
      mockPrisma.liveReadinessAuditEvent.findMany.mockResolvedValue([] as never);

      await listLiveReadinessAuditEvents("org-1", 50, { subjectType: "ComplianceProfile" });

      expect(mockPrisma.liveReadinessAuditEvent.findMany).toHaveBeenCalledWith({
        where: { orgId: "org-1", subjectType: "ComplianceProfile" },
        orderBy: { createdAt: "desc" },
        take: 50
      });
    });

    it("should apply both action and subjectType filters when provided", async () => {
      mockPrisma.liveReadinessAuditEvent.findMany.mockResolvedValue([] as never);

      await listLiveReadinessAuditEvents("org-1", 50, { action: "COMPLIANCE_PROFILE_UPDATED", subjectType: "ComplianceProfile" });

      expect(mockPrisma.liveReadinessAuditEvent.findMany).toHaveBeenCalledWith({
        where: { orgId: "org-1", action: "COMPLIANCE_PROFILE_UPDATED", subjectType: "ComplianceProfile" },
        orderBy: { createdAt: "desc" },
        take: 50
      });
    });
  });
});
