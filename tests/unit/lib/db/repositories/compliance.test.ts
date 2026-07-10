import { describe, expect, it, vi, beforeEach } from "vitest";
import { getOrCreateComplianceProfile, updateComplianceProfile } from "@/lib/db/repositories/compliance";
import { A2pRegistrationStatus } from "@prisma/client";

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

describe("compliance repository", () => {
  const orgId = "org_123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOrCreateComplianceProfile", () => {
    it("calls upsert with NOT_STARTED status on create and no update data", async () => {
      const mockResult = { orgId, a2pRegistrationStatus: A2pRegistrationStatus.NOT_STARTED };
      mocks.upsert.mockResolvedValue(mockResult);

      const result = await getOrCreateComplianceProfile(orgId);

      expect(mocks.upsert).toHaveBeenCalledWith({
        where: { orgId },
        update: {},
        create: {
          orgId,
          a2pRegistrationStatus: A2pRegistrationStatus.NOT_STARTED
        }
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe("updateComplianceProfile", () => {
    it("calls upsert mapping input fields to update and create", async () => {
      const input = {
        legalBusinessName: "Acme Corp",
        businessType: "sole_proprietorship" as const,
        a2pRegistrationStatus: A2pRegistrationStatus.PENDING
      };

      const mockResult = { orgId, ...input };
      mocks.upsert.mockResolvedValue(mockResult);

      const result = await updateComplianceProfile(orgId, input);

      expect(mocks.upsert).toHaveBeenCalledWith({
        where: { orgId },
        update: input,
        create: {
          orgId,
          ...input
        }
      });
      expect(result).toEqual(mockResult);
    });
  });
});
