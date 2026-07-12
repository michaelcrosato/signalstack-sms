import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { withTenantRls, withOptionalTenantRls, rlsIsEnabled } from "@/lib/db/rls";
import {
  currentTenantDatabaseContext,
  withAuthDatabaseContext,
  withTenantTransaction
} from "@/lib/db/tenant-context";

// Mock the prisma client to avoid actual database calls in this unit test
vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      $queryRaw: vi.fn(),
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

    it("cannot be disabled by a runtime flag", () => {
      expect(rlsIsEnabled({ DATABASE_RLS_ENFORCED: "false" })).toBe(true);
      expect(rlsIsEnabled({})).toBe(true);
      expect(rlsIsEnabled({ DATABASE_RLS_ENFORCED: undefined })).toBe(true);
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
      expect(txArg.$executeRawUnsafe).toHaveBeenCalledWith("SET LOCAL ROLE signalstack_runtime");
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

    it("still enters the tenant role when the legacy flag is false", async () => {
      const mockFn = vi.fn().mockResolvedValue("success_mandatory_rls");

      const result = await withOptionalTenantRls(
        "org_123",
        mockFn,
        { DATABASE_RLS_ENFORCED: "false" }
      );

      expect(result).toBe("success_mandatory_rls");
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockFn).toHaveBeenCalled();
    });
  });

  describe("tenant context", () => {
    it("reuses a same-org transaction and rejects a nested org switch", async () => {
      const result = await withTenantTransaction({ orgId: "org_a", userId: "user_a" }, async (outer) => {
        expect(currentTenantDatabaseContext()).toEqual({ orgId: "org_a", userId: "user_a" });
        const nested = await withTenantTransaction({ orgId: "org_a" }, async (inner) => {
          expect(inner).toBe(outer);
          return "nested";
        });
        await expect(
          withTenantTransaction({ orgId: "org_b" }, async () => "forged")
        ).rejects.toThrow("cannot switch organizations");
        return nested;
      });

      expect(result).toBe("nested");
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(currentTenantDatabaseContext()).toBeNull();
    });

    it("selects the bounded control role for exact auth evidence", async () => {
      const result = await withAuthDatabaseContext(
        { sessionHash: "a".repeat(43), orgSlug: "bounded-org" },
        async (tx) => tx.$executeRawUnsafe("SELECT 1")
      );

      expect(result).toBeUndefined();
      const transaction = vi.mocked(prisma.$transaction).mock.calls.at(-1)?.[0];
      expect(transaction).toBeTypeOf("function");
    });

    it("rejects empty or malformed context evidence before opening a transaction", async () => {
      await expect(withTenantTransaction({ orgId: " org_a" }, async () => undefined)).rejects.toThrow(
        "orgId is invalid"
      );
      await expect(withAuthDatabaseContext({}, async () => undefined)).rejects.toThrow(
        "requires bounded evidence"
      );
      await expect(
        withAuthDatabaseContext({ orgSlug: " bounded-org", purpose: "organization_create" }, async () => undefined)
      ).rejects.toThrow("orgSlug is invalid");
    });
  });
});
