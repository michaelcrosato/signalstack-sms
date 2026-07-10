import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { withTenantRls, withOptionalTenantRls, rlsIsEnabled } from "@/lib/db/rls";

// Mock the prisma client to avoid actual database calls in this unit test
vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      $transaction: vi.fn(async (callback) => {
        const tx = {
          $queryRaw: vi.fn(),
          $executeRawUnsafe: vi.fn(),
        };
        return callback(tx);
      }),
    },
  };
});

describe("rls.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rlsIsEnabled", () => {
    it("returns true when DATABASE_RLS_ENFORCED is 'true'", () => {
      expect(rlsIsEnabled({ DATABASE_RLS_ENFORCED: "true" })).toBe(true);
    });

    it("returns false when DATABASE_RLS_ENFORCED is not 'true'", () => {
      expect(rlsIsEnabled({ DATABASE_RLS_ENFORCED: "false" })).toBe(false);
      expect(rlsIsEnabled({})).toBe(false);
      expect(rlsIsEnabled({ DATABASE_RLS_ENFORCED: undefined })).toBe(false);
    });
  });

  describe("withTenantRls", () => {
    it("executes transaction with proper RLS settings", async () => {
      const mockFn = vi.fn().mockResolvedValue("success");
      const result = await withTenantRls("org_123", mockFn);

      expect(result).toBe("success");
      expect(prisma.$transaction).toHaveBeenCalled();

      // Ensure the mock function was called
      expect(mockFn).toHaveBeenCalled();
      const txArg = mockFn.mock.calls[0][0];

      // Check that the tx argument has the mocked raw methods called
      expect(txArg.$queryRaw).toHaveBeenCalled();
      expect(txArg.$executeRawUnsafe).toHaveBeenCalledWith("SET LOCAL ROLE app_rls");
    });
  });

  describe("withOptionalTenantRls", () => {
    it("calls withTenantRls when RLS is enabled", async () => {
      const mockFn = vi.fn().mockResolvedValue("success_rls");

      const result = await withOptionalTenantRls(
        "org_123",
        mockFn,
        { DATABASE_RLS_ENFORCED: "true" }
      );

      expect(result).toBe("success_rls");
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("calls function directly with prisma when RLS is disabled", async () => {
      const mockFn = vi.fn().mockResolvedValue("success_no_rls");

      const result = await withOptionalTenantRls(
        "org_123",
        mockFn,
        { DATABASE_RLS_ENFORCED: "false" }
      );

      expect(result).toBe("success_no_rls");
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(mockFn).toHaveBeenCalledWith(prisma);
    });
  });
});
