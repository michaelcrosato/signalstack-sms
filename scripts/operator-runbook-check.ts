import { readFileSync } from "node:fs";

const runbook = readFileSync("docs/LOCAL_OPERATOR_RUNBOOK.md", "utf8");
const localGate = readFileSync("docs/LOCAL_GATE.md", "utf8");

const requiredRunbookText = [
  "DEMO_MODE=true",
  "LIVE_MESSAGING_ENABLED=false",
  "LIVE_BILLING_ENABLED=false",
  "MESSAGING_PROVIDER=dummy",
  "AI_PROVIDER=fake",
  "npm run validate",
  "npm run test:e2e:demo",
  "/settings/exports",
  "/api/settings/provider/rotations/export",
  "must not expose raw auth tokens, provider token fingerprints, customer secrets",
  "must not mutate records, call providers, create billing records, send notifications, or enable live messaging",
  "BLOCKERS.codex.md"
];

const missingRunbookText = requiredRunbookText.filter((text) => !runbook.includes(text));

if (missingRunbookText.length > 0) {
  console.error(`Local operator runbook is missing required safety text: ${missingRunbookText.join("; ")}`);
  process.exit(1);
}

if (!localGate.includes("docs/LOCAL_OPERATOR_RUNBOOK.md")) {
  console.error("Local gate must link to docs/LOCAL_OPERATOR_RUNBOOK.md.");
  process.exit(1);
}

console.log("Local operator runbook verified.");
