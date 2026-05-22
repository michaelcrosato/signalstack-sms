import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const fakeAiRoutes = [
  "app/api/ai/campaign-copy/route.ts",
  "app/api/ai/reply-suggestion/route.ts",
  "app/api/ai/conversation-summary/route.ts",
  "app/api/ai/lead-qualification/route.ts"
] as const;

function routeSource(repoPath: string) {
  return readFileSync(path.join(process.cwd(), ...repoPath.split("/")), "utf8");
}

describe("AI API usage metering", () => {
  it("keeps successful fake AI endpoints metered as local AI_REQUEST usage", () => {
    const unmeteredRoutes = fakeAiRoutes.filter((repoPath) => {
      const source = routeSource(repoPath);
      return !source.includes("recordFakeAiUsage") || !source.includes("currentOrg.orgId");
    });

    expect(unmeteredRoutes).toEqual([]);
  });

  it("records fake AI usage through local billing metering only", () => {
    const source = routeSource("lib/ai/usage.ts");

    expect(source).toContain("UsageEventType.AI_REQUEST");
    expect(source).toContain('provider: "fake"');
    expect(source).toContain("recordUsageEvent");
    expect(source).not.toMatch(/\bfetch\s*\(|twilio|stripe|openai|sendSms/i);
  });
});
