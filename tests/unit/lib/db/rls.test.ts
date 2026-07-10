import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { rlsIsEnabled, withTenantRls, withOptionalTenantRls } from "@/lib/db/rls";

// Mock prisma transaction and raw queries
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback) => {
      const mockTx = {
        $queryRaw: vi.fn(),
        $executeRawUnsafe: vi.fn(),
      };
      return callback(mockTx);
    }),
  },
}));

describe("lib/db/rls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rlsIsEnabled", () => {
    it("returns true when DATABASE_RLS_ENFORCED is 'true'", () => {
      expect(rlsIsEnabled({ DATABASE_RLS_ENFORCED: "true" })).toBe(true);
    });

    it("returns false when DATABASE_RLS_ENFORCED is false or unset", () => {
      expect(rlsIsEnabled({ DATABASE_RLS_ENFORCED: "false" })).toBe(false);
      expect(rlsIsEnabled({})).toBe(false);
      expect(rlsIsEnabled()).toBe(false);
    });
  });

  describe("withTenantRls", () => {
    it("executes the correct raw queries and calls fn with tx", async () => {
      const mockFn = vi.fn().mockResolvedValue("result");
      const result = await withTenantRls("org-123", mockFn);

      expect(prisma.$transaction).toHaveBeenCalled();

      // Get the mock transaction object that was passed to the callback
      const mockTx = mockFn.mock.calls[0][0];
      expect(mockTx.$queryRaw).toHaveBeenCalled();
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith("SET LOCAL ROLE app_rls");

      expect(mockFn).toHaveBeenCalled();
      expect(result).toBe("result");
    });
  });

  describe("withOptionalTenantRls", () => {
    it("delegates to withTenantRls when RLS is enabled", async () => {
      const mockFn = vi.fn().mockResolvedValue("result");
      const result = await withOptionalTenantRls("org-123", mockFn, { DATABASE_RLS_ENFORCED: "true" });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockFn).toHaveBeenCalled();
      expect(result).toBe("result");
    });

    it("delegates to fn(prisma) when RLS is disabled", async () => {
      const mockFn = vi.fn().mockResolvedValue("result");
      const result = await withOptionalTenantRls("org-123", mockFn, { DATABASE_RLS_ENFORCED: "false" });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      // Because we mock prisma, mockFn should be called with it directly
      expect(mockFn).toHaveBeenCalledWith(prisma);
      expect(result).toBe("result");
    });
  });
});
