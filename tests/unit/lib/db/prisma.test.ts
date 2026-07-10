import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const applyDemoSafeRuntimeDefaultsMock = vi.fn();
vi.mock("@/lib/env/defaults", () => ({
  applyDemoSafeRuntimeDefaults: applyDemoSafeRuntimeDefaultsMock,
}));

const PrismaClientMock = vi.fn();
vi.mock("@prisma/client", () => ({
  PrismaClient: PrismaClientMock,
}));

describe("lib/db/prisma", () => {
  beforeEach(() => {
    vi.resetModules();
    applyDemoSafeRuntimeDefaultsMock.mockClear();
    PrismaClientMock.mockClear();
    delete (globalThis as unknown as Record<string, unknown>).prisma;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should call applyDemoSafeRuntimeDefaults", async () => {
    await import("@/lib/db/prisma");
    expect(applyDemoSafeRuntimeDefaultsMock).toHaveBeenCalled();
  });

  it("should create a new PrismaClient and attach to globalThis if not production", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const { prisma } = await import("@/lib/db/prisma");

    expect(PrismaClientMock).toHaveBeenCalledWith({
      log: ["warn", "error"],
    });

    expect(prisma).toBeDefined();
    expect((globalThis as unknown as Record<string, unknown>).prisma).toBe(prisma);
  });

  it("should not attach to globalThis in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const { prisma } = await import("@/lib/db/prisma");

    expect(PrismaClientMock).toHaveBeenCalledWith({
      log: ["error"],
    });

    expect(prisma).toBeDefined();
    expect((globalThis as unknown as Record<string, unknown>).prisma).toBeUndefined();
  });

  it("should reuse the existing PrismaClient if present on globalThis", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const existingPrisma = { mock: "client" };
    (globalThis as unknown as Record<string, unknown>).prisma = existingPrisma;

    const { prisma } = await import("@/lib/db/prisma");

    expect(PrismaClientMock).not.toHaveBeenCalled();
    expect(prisma).toBe(existingPrisma);
  });
});
