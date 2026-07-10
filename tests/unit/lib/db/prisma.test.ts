import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    PrismaClient: vi.fn(),
    applyDemoSafeRuntimeDefaults: vi.fn(),
  };
});

vi.mock("@prisma/client", () => {
  return { PrismaClient: mocks.PrismaClient };
});

vi.mock("@/lib/env/defaults", () => ({
  applyDemoSafeRuntimeDefaults: mocks.applyDemoSafeRuntimeDefaults,
}));

describe("prisma.ts", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalGlobal = globalThis as any;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete originalGlobal.prisma;
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete originalGlobal.prisma;
  });

  it("initializes a new PrismaClient and sets it on globalThis in non-production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { applyDemoSafeRuntimeDefaults } = await import("@/lib/env/defaults");
    const { prisma } = await import("@/lib/db/prisma");

    expect(applyDemoSafeRuntimeDefaults).toHaveBeenCalled();
    expect(mocks.PrismaClient).toHaveBeenCalledWith({
      log: ["warn", "error"],
    });
    expect(originalGlobal.prisma).toBe(prisma);
  });

  it("reuses existing PrismaClient on globalThis", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const existingPrisma = { mock: "client" };
    originalGlobal.prisma = existingPrisma;

    const { prisma } = await import("@/lib/db/prisma");

    expect(mocks.PrismaClient).not.toHaveBeenCalled();
    expect(prisma).toBe(existingPrisma);
  });

  it("does not set PrismaClient on globalThis in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await import("@/lib/db/prisma");

    expect(mocks.PrismaClient).toHaveBeenCalledWith({
      log: ["error"],
    });
    expect(originalGlobal.prisma).toBeUndefined();
  });
});
