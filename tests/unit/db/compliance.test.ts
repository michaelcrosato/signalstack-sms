import { describe, expect, it, vi, beforeEach } from "vitest";
import { A2pRegistrationStatus } from "@prisma/client";
import { getOrCreateComplianceProfile, updateComplianceProfile } from "@/lib/db/repositories/compliance";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    complianceProfile: {
      upsert: mocks.upsert
    }
  }
}));

describe("Compliance Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOrCreateComplianceProfile", () => {
    it("upserts with empty update and NOT_STARTED registration status", async () => {
      const orgId = "org_123";
      mocks.upsert.mockResolvedValueOnce({ id: "profile_1", orgId });

      const result = await getOrCreateComplianceProfile(orgId);

      expect(result).toEqual({ id: "profile_1", orgId });
      expect(mocks.upsert).toHaveBeenCalledWith({
        where: { orgId },
        update: {},
        create: {
          orgId,
          a2pRegistrationStatus: A2pRegistrationStatus.NOT_STARTED
        }
      });
    });
  });

  describe("updateComplianceProfile", () => {
    it("upserts with the provided input for both update and create", async () => {
      const orgId = "org_123";
      const input = {
        businessName: "Acme Corp",
        messagingUseCase: "Notifications",
        a2pRegistrationStatus: A2pRegistrationStatus.PENDING
      };

      mocks.upsert.mockResolvedValueOnce({ id: "profile_1", orgId, ...input });

      const result = await updateComplianceProfile(orgId, input);

      expect(result).toEqual({ id: "profile_1", orgId, ...input });
      expect(mocks.upsert).toHaveBeenCalledWith({
        where: { orgId },
        update: input,
        create: {
          orgId,
          ...input
        }
      });
    });

    it("handles empty input correctly", async () => {
      const orgId = "org_123";
      const input = {};

      mocks.upsert.mockResolvedValueOnce({ id: "profile_1", orgId });

      await updateComplianceProfile(orgId, input);

      expect(mocks.upsert).toHaveBeenCalledWith({
        where: { orgId },
        update: input,
        create: {
          orgId,
          ...input
        }
      });
    });
  });
});
