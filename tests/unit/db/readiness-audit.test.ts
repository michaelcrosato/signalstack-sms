import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordLiveReadinessAuditEvent, listLiveReadinessAuditEvents, type ReadinessAuditInput } from "@/lib/db/repositories/readiness-audit";

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

describe("Readiness Audit Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordLiveReadinessAuditEvent", () => {
    const orgId = "org_demo";
    const baseInput: ReadinessAuditInput = {
      action: "PROVIDER_NUMBER_UPSERTED",
      subjectType: "ProviderPhoneNumber",
    };

    it("creates an audit event with minimal required fields", async () => {
      const createdEvent = {
        id: "evt_123",
        orgId,
        actorUserId: null,
        ...baseInput,
        subjectId: null,
        metadata: null,
        createdAt: new Date()
      };
      mocks.liveReadinessAuditEventCreate.mockResolvedValue(createdEvent);

      await expect(recordLiveReadinessAuditEvent(orgId, baseInput)).resolves.toEqual(createdEvent);

      expect(mocks.liveReadinessAuditEventCreate).toHaveBeenCalledWith({
        data: {
          orgId,
          actorUserId: undefined,
          action: "PROVIDER_NUMBER_UPSERTED",
          subjectType: "ProviderPhoneNumber",
          subjectId: undefined,
          metadata: undefined
        }
      });
    });

    it("creates an audit event with all optional fields provided", async () => {
      const fullInput: ReadinessAuditInput = {
        ...baseInput,
        actorUserId: "usr_456",
        subjectId: "prov_789",
        metadata: { provider: "twilio" }
      };

      const createdEvent = {
        id: "evt_123",
        orgId,
        ...fullInput,
        createdAt: new Date()
      };

      mocks.liveReadinessAuditEventCreate.mockResolvedValue(createdEvent);

      await expect(recordLiveReadinessAuditEvent(orgId, fullInput)).resolves.toEqual(createdEvent);

      expect(mocks.liveReadinessAuditEventCreate).toHaveBeenCalledWith({
        data: {
          orgId,
          actorUserId: "usr_456",
          action: "PROVIDER_NUMBER_UPSERTED",
          subjectType: "ProviderPhoneNumber",
          subjectId: "prov_789",
          metadata: { provider: "twilio" }
        }
      });
    });

    it("propagates database errors during creation", async () => {
      const error = new Error("Database error");
      mocks.liveReadinessAuditEventCreate.mockRejectedValue(error);

      await expect(recordLiveReadinessAuditEvent(orgId, baseInput)).rejects.toThrow("Database error");
    });
  });

  describe("listLiveReadinessAuditEvents", () => {
    const orgId = "org_demo";
    const mockEvents = [
      { id: "evt_1", orgId, action: "test", subjectType: "type", createdAt: new Date() },
      { id: "evt_2", orgId, action: "test2", subjectType: "type", createdAt: new Date() }
    ];

    it("lists events with default parameters", async () => {
      mocks.liveReadinessAuditEventFindMany.mockResolvedValue(mockEvents);

      await expect(listLiveReadinessAuditEvents(orgId)).resolves.toEqual(mockEvents);

      expect(mocks.liveReadinessAuditEventFindMany).toHaveBeenCalledWith({
        where: {
          orgId
        },
        orderBy: { createdAt: "desc" },
        take: 50
      });
    });

    it("lists events with custom take limit", async () => {
      mocks.liveReadinessAuditEventFindMany.mockResolvedValue(mockEvents);

      await expect(listLiveReadinessAuditEvents(orgId, 10)).resolves.toEqual(mockEvents);

      expect(mocks.liveReadinessAuditEventFindMany).toHaveBeenCalledWith({
        where: {
          orgId
        },
        orderBy: { createdAt: "desc" },
        take: 10
      });
    });

    it("filters events by action", async () => {
      mocks.liveReadinessAuditEventFindMany.mockResolvedValue(mockEvents);

      await expect(listLiveReadinessAuditEvents(orgId, 50, { action: "PROVIDER_NUMBER_UPSERTED" })).resolves.toEqual(mockEvents);

      expect(mocks.liveReadinessAuditEventFindMany).toHaveBeenCalledWith({
        where: {
          orgId,
          action: "PROVIDER_NUMBER_UPSERTED"
        },
        orderBy: { createdAt: "desc" },
        take: 50
      });
    });

    it("filters events by subjectType", async () => {
      mocks.liveReadinessAuditEventFindMany.mockResolvedValue(mockEvents);

      await expect(listLiveReadinessAuditEvents(orgId, 50, { subjectType: "ProviderPhoneNumber" })).resolves.toEqual(mockEvents);

      expect(mocks.liveReadinessAuditEventFindMany).toHaveBeenCalledWith({
        where: {
          orgId,
          subjectType: "ProviderPhoneNumber"
        },
        orderBy: { createdAt: "desc" },
        take: 50
      });
    });

    it("filters events by both action and subjectType", async () => {
      mocks.liveReadinessAuditEventFindMany.mockResolvedValue(mockEvents);

      await expect(listLiveReadinessAuditEvents(orgId, 50, { action: "PROVIDER_NUMBER_UPSERTED", subjectType: "ProviderPhoneNumber" })).resolves.toEqual(mockEvents);

      expect(mocks.liveReadinessAuditEventFindMany).toHaveBeenCalledWith({
        where: {
          orgId,
          action: "PROVIDER_NUMBER_UPSERTED",
          subjectType: "ProviderPhoneNumber"
        },
        orderBy: { createdAt: "desc" },
        take: 50
      });
    });

    it("propagates database errors during listing", async () => {
      const error = new Error("Database error");
      mocks.liveReadinessAuditEventFindMany.mockRejectedValue(error);

      await expect(listLiveReadinessAuditEvents(orgId)).rejects.toThrow("Database error");
    });
  });
});
