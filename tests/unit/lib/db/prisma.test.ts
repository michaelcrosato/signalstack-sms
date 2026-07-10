import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockPrismaClient = vi.fn(function() { return { _isMock: true }; });
vi.mock("@prisma/client", () => {
  return { PrismaClient: mockPrismaClient };
});

const mockApplyDefaults = vi.fn();
vi.mock("@/lib/env/defaults", () => {
  return { applyDemoSafeRuntimeDefaults: mockApplyDefaults };
});

describe("prisma client singleton", () => {

  beforeEach(() => {
    vi.resetModules();
    mockPrismaClient.mockClear();
    mockApplyDefaults.mockClear();
    // @ts-expect-error - Testing global modifications
    delete globalThis.prisma;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    // @ts-expect-error - Testing global modifications
    delete globalThis.prisma;
  });

  it("calls applyDemoSafeRuntimeDefaults on import", async () => {
    await import("@/lib/db/prisma");
    expect(mockApplyDefaults).toHaveBeenCalledTimes(1);
  });

  it("creates a new PrismaClient and assigns to globalThis in development", async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { prisma } = await import("@/lib/db/prisma");

    expect(mockPrismaClient).toHaveBeenCalledWith({
      log: ["warn", "error"]
    });

    // @ts-expect-error - Testing global modifications
    expect(globalThis.prisma).toBe(prisma);
  });

  it("creates a new PrismaClient and does NOT assign to globalThis in production", async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await import("@/lib/db/prisma");

    expect(mockPrismaClient).toHaveBeenCalledWith({
      log: ["error"]
    });

    // @ts-expect-error - Testing global modifications
    expect(globalThis.prisma).toBeUndefined();
  });

  it("reuses existing globalThis.prisma if it exists", async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const existingPrisma = { _isExisting: true };
    // @ts-expect-error - Testing global modifications
    globalThis.prisma = existingPrisma;

    const { prisma } = await import("@/lib/db/prisma");

    expect(prisma).toBe(existingPrisma);
    expect(mockPrismaClient).not.toHaveBeenCalled();
  });
});
