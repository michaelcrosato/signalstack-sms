import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflowPaths = [".github/workflows/ci.yml", ".github/workflows/e2e.yml"] as const;

function readWorkflow(path: (typeof workflowPaths)[number]) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("GitHub validation workflows", () => {
  it("run the protected local gate instead of treating raw validation scripts as green", () => {
    for (const workflowPath of workflowPaths) {
      const workflow = readWorkflow(workflowPath);

      expect(workflow).toContain("bash scripts/verify.sh");
      expect(workflow).not.toMatch(/\brun:\s+npm run (?:validate|premerge)\b/);
    }
  });

  it("keep validation workflows on demo-safe local defaults", () => {
    for (const workflowPath of workflowPaths) {
      const workflow = readWorkflow(workflowPath);

      // Verify that no live credentials or live modes are enabled in the workflows
      expect(workflow).not.toContain('DEMO_MODE: "false"');
      expect(workflow).not.toContain('LIVE_MESSAGING_ENABLED: "true"');
      expect(workflow).not.toContain('LIVE_BILLING_ENABLED: "true"');
      expect(workflow).not.toContain("MESSAGING_PROVIDER: twilio");
    }
  });
});
