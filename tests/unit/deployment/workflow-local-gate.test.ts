import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflowPaths = [".github/workflows/ci.yml", ".github/workflows/premerge.yml"] as const;

function readWorkflow(path: (typeof workflowPaths)[number]) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("GitHub validation workflows", () => {
  it("run the protected local gate instead of treating raw validation scripts as green", () => {
    for (const workflowPath of workflowPaths) {
      const workflow = readWorkflow(workflowPath);

      expect(workflow).toContain("pwsh ./scripts/local-gate.ps1");
      expect(workflow).not.toMatch(/\brun:\s+npm run (?:validate|premerge)\b/);
    }
  });

  it("keep validation workflows on demo-safe local defaults", () => {
    for (const workflowPath of workflowPaths) {
      const workflow = readWorkflow(workflowPath);

      expect(workflow).toContain('DEMO_MODE: "true"');
      expect(workflow).toContain('LIVE_MESSAGING_ENABLED: "false"');
      expect(workflow).toContain('LIVE_BILLING_ENABLED: "false"');
      expect(workflow).toContain("MESSAGING_PROVIDER: dummy");
      expect(workflow).toContain("AI_PROVIDER: fake");
      expect(workflow).toContain(
        "DATABASE_URL: postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public"
      );
    }
  });
});
