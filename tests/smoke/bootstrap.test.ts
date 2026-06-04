import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { envDefaults } from "@/lib/env/defaults";
import { dummyProvider } from "@/lib/messaging/provider/dummy-provider";
import { fakeCampaignCopy } from "@/lib/ai/fake-ai-provider";

describe("Milestone 0 scaffold", () => {
  it("keeps demo-safe defaults", () => {
    expect(Object.isFrozen(envDefaults)).toBe(true);
    expect(envDefaults).toEqual({
      DEMO_MODE: "true",
      LIVE_MESSAGING_ENABLED: "false",
      LIVE_BILLING_ENABLED: "false",
      MESSAGING_PROVIDER: "dummy",
      AI_PROVIDER: "fake"
    });
    expect(() => {
      (envDefaults as unknown as Record<string, string>).DEMO_MODE = "false";
    }).toThrow(TypeError);
    expect(envDefaults.DEMO_MODE).toBe("true");
  });

  it("uses npm as the only committed package manager metadata", () => {
    expect(existsSync(join(process.cwd(), "package-lock.json"))).toBe(true);
    expect(existsSync(join(process.cwd(), "pnpm-lock.yaml"))).toBe(false);
    expect(existsSync(join(process.cwd(), "pnpm-workspace.yaml"))).toBe(false);
    expect(existsSync(join(process.cwd(), "yarn.lock"))).toBe(false);
  });

  it("uses deterministic fake integrations", async () => {
    await expect(
      dummyProvider.send({
        to: "+15555550100",
        from: "+15555550199",
        body: "hello",
        orgId: "org_demo",
        idempotencyKey: "smoke"
      })
    ).resolves.toEqual({ providerMessageId: "dummy_smoke", status: "queued" });
    expect(fakeCampaignCopy("spring sale")).toContain("spring sale");
  });
});
