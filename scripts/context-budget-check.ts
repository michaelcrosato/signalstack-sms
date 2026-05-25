import { readFileSync, statSync } from "node:fs";

type BudgetedFile = {
  path: string;
  maxBytes: number;
  requiredText?: string[];
  forbiddenText?: string[];
};

const currentHandoffBudgets: BudgetedFile[] = [
  {
    path: "SUMMARY.codex.md",
    maxBytes: 12_000,
    requiredText: ["Run number:", "History is preserved in `LOOP_LOG.md`"],
    forbiddenText: ["## Previous Run"]
  },
  {
    path: "BLOCKERS.codex.md",
    maxBytes: 12_000,
    requiredText: ["Run number:", "Historical blocker notes are preserved in `LOOP_LOG.md`"],
    forbiddenText: ["## Previous Run"]
  },
  {
    path: "docs/NEXT_PROMPTS.md",
    maxBytes: 16_000,
    requiredText: ["## Context Discipline", "Full history is in `LOOP_LOG.md`"],
    forbiddenText: ["Run 700", "Run 650", "Run 600"]
  },
  {
    path: "docs/CURRENT_STATE_MATRIX.md",
    maxBytes: 24_000,
    requiredText: ["This file is intentionally compact", "| Area | Backend/API State | Browser State | Main Gap | Next Action |"],
    forbiddenText: ["Run 700", "Run 650", "Run 600"]
  },
  {
    path: "docs/AGENT-LOOP.md",
    maxBytes: 12_000,
    requiredText: ["# CONTEXT BUDGET", "Read the latest useful truth, not the entire history."]
  }
];

const appendOnlyHistoryFiles = ["LOOP_LOG.md", "docs/LOOP_LOG.md"];
const advisoryLargeFiles = [
  "tests/unit/auth/api-route-authorization.test.ts",
  "tests/unit/queue/live-worker-controls.test.ts",
  "contracts/CONTRACT-TESTING.md"
];

const failures: string[] = [];

function fileText(path: string) {
  return readFileSync(path, "utf8");
}

for (const budget of currentHandoffBudgets) {
  const { size } = statSync(budget.path);
  const text = fileText(budget.path);

  if (size > budget.maxBytes) {
    failures.push(`${budget.path} is ${size} bytes, above the ${budget.maxBytes} byte current-handoff budget.`);
  }

  for (const required of budget.requiredText ?? []) {
    if (!text.includes(required)) {
      failures.push(`${budget.path} is missing required context-budget text: ${required}`);
    }
  }

  for (const forbidden of budget.forbiddenText ?? []) {
    if (text.includes(forbidden)) {
      failures.push(`${budget.path} contains historical handoff bloat marker: ${forbidden}`);
    }
  }
}

for (const historyFile of appendOnlyHistoryFiles) {
  const text = fileText(historyFile);
  if (!text.includes("## Run ")) {
    failures.push(`${historyFile} must remain the append-only run history.`);
  }
}

if (failures.length > 0) {
  console.error("Context budget check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

const advisory = advisoryLargeFiles
  .map((path) => ({ path, size: statSync(path).size }))
  .filter(({ size }) => size > 100_000)
  .map(({ path, size }) => `${path}=${size} bytes`);

console.log("Context budget check passed.");
if (advisory.length > 0) {
  console.log(`Large files are allowed but should be read with targeted search: ${advisory.join("; ")}`);
}
