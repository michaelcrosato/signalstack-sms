import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";

vi.mock("@prisma/client", () => {
  return {
    PrismaClient: vi.fn(function() {
      return {};
    }),
  };
});

vi.mock("@/lib/env/defaults", () => {
  return {
    applyDemoSafeRuntimeDefaults: vi.fn(),
  };
});

// Create a type for the global object to avoid using `any`
type PrismaGlobal = typeof globalThis & {
  prisma?: PrismaClient;
};

describe("prisma.ts", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    originalEnv = process.env.NODE_ENV;
    delete (globalThis as PrismaGlobal).prisma;
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalEnv || "test");
  });

  it("should call applyDemoSafeRuntimeDefaults", async () => {
    const { applyDemoSafeRuntimeDefaults } = await import("@/lib/env/defaults");
    await import("@/lib/db/prisma");
    expect(applyDemoSafeRuntimeDefaults).toHaveBeenCalled();
  });

  it("should create a new PrismaClient instance in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { PrismaClient } = await import("@prisma/client");

    await import("@/lib/db/prisma");

    expect(PrismaClient).toHaveBeenCalledWith({
      log: ["error"]
    });
    expect((globalThis as PrismaGlobal).prisma).toBeUndefined();
  });

  it("should save PrismaClient instance to globalThis in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { PrismaClient } = await import("@prisma/client");

    const { prisma } = await import("@/lib/db/prisma");

    expect(PrismaClient).toHaveBeenCalledWith({
      log: ["warn", "error"]
    });
    expect((globalThis as PrismaGlobal).prisma).toBe(prisma);
  });

  it("should reuse the existing PrismaClient instance from globalThis", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const mockPrisma = { isMock: true } as unknown as PrismaClient;
    (globalThis as PrismaGlobal).prisma = mockPrisma;

    const { PrismaClient } = await import("@prisma/client");
    const { prisma } = await import("@/lib/db/prisma");

    expect(prisma).toBe(mockPrisma);
    expect(PrismaClient).not.toHaveBeenCalled();
  });
});
