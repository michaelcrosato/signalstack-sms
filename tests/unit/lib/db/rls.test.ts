import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTenantRls, rlsIsEnabled, withOptionalTenantRls } from '@/lib/db/rls';
import { prisma } from '@/lib/db/prisma';

vi.mock('@/lib/db/prisma', () => {
  return {
    prisma: {
      $transaction: vi.fn(),
    },
  };
});

describe('rls.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rlsIsEnabled', () => {
    it('returns true when DATABASE_RLS_ENFORCED is "true"', () => {
      expect(rlsIsEnabled({ DATABASE_RLS_ENFORCED: 'true' })).toBe(true);
    });

    it('returns false when DATABASE_RLS_ENFORCED is not "true"', () => {
      expect(rlsIsEnabled({ DATABASE_RLS_ENFORCED: 'false' })).toBe(false);
      expect(rlsIsEnabled({})).toBe(false);
      expect(rlsIsEnabled({ DATABASE_RLS_ENFORCED: undefined })).toBe(false);
    });

    it('uses process.env by default', () => {
      const originalEnv = process.env.DATABASE_RLS_ENFORCED;
      process.env.DATABASE_RLS_ENFORCED = 'true';
      expect(rlsIsEnabled()).toBe(true);
      process.env.DATABASE_RLS_ENFORCED = 'false';
      expect(rlsIsEnabled()).toBe(false);
      process.env.DATABASE_RLS_ENFORCED = originalEnv;
    });
  });

  describe('withTenantRls', () => {
    it('executes a transaction with correct RLS setup', async () => {
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue(undefined),
        $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
      };

      const mockFn = vi.fn().mockResolvedValue('test-result');

      vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) => {
        return (callback as (tx: unknown) => unknown)(mockTx);
      });

      const result = await withTenantRls('org-123', mockFn);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockTx.$queryRaw).toHaveBeenCalled();
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith('SET LOCAL ROLE app_rls');
      expect(mockFn).toHaveBeenCalledWith(mockTx);
      expect(result).toBe('test-result');
    });
  });

  describe('withOptionalTenantRls', () => {
    it('calls withTenantRls when RLS is enabled', async () => {
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue(undefined),
        $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
      };
      const mockFn = vi.fn().mockResolvedValue('test-result');

      vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) => {
        return (callback as (tx: unknown) => unknown)(mockTx);
      });

      const env = { DATABASE_RLS_ENFORCED: 'true' };
      const result = await withOptionalTenantRls('org-123', mockFn, env);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toBe('test-result');
    });

    it('calls the function directly with prisma when RLS is disabled', async () => {
      const mockFn = vi.fn().mockResolvedValue('test-result');

      const env = { DATABASE_RLS_ENFORCED: 'false' };
      const result = await withOptionalTenantRls('org-123', mockFn, env);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(mockFn).toHaveBeenCalledWith(prisma);
      expect(result).toBe('test-result');
    });
  });
});
