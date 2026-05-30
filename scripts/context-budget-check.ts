import { readFileSync, statSync, existsSync } from "node:fs";

export type BudgetedFile = {
  path: string;
  maxBytes: number;
  requiredText?: string[];
  forbiddenText?: string[];
  isOptional?: boolean;
};

export const currentHandoffBudgets: BudgetedFile[] = [
  {
    path: "SUMMARY.codex.md",
    maxBytes: 12_000,
    requiredText: ["Run number:"],
    forbiddenText: ["## Previous Run"]
  },
  {
    path: "BLOCKERS.codex.md",
    maxBytes: 12_000,
    requiredText: ["Run number:"],
    forbiddenText: ["## Previous Run"]
  },
  {
    path: "docs/NEXT_PROMPTS.md",
    maxBytes: 16_000,
    requiredText: ["## Context Discipline", "npm run agent:brief"],
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
    requiredText: ["# CONTEXT BUDGET", "Read the latest useful truth, not the entire history.", "npm run agent:brief"]
  }
];

export const advisoryLargeFiles = [
  "tests/unit/auth/api-route-authorization.test.ts",
  "tests/unit/queue/live-worker-controls.test.ts",
  "contracts/CONTRACT-TESTING.md"
];

export function evaluateContextBudget(
  budgets: BudgetedFile[] = currentHandoffBudgets,
  largeFiles: string[] = advisoryLargeFiles
) {
  const failures: string[] = [];

  for (const budget of budgets) {
    if (!existsSync(budget.path)) {
      if (budget.isOptional) {
        continue;
      }
      failures.push(`${budget.path} does not exist and is a required budget file.`);
      continue;
    }

    const { size } = statSync(budget.path);
    let text = "";
    try {
      text = readFileSync(budget.path, "utf8");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      failures.push(`Failed to read ${budget.path}: ${message}`);
      continue;
    }

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

  const advisory = largeFiles
    .filter((path) => existsSync(path))
    .map((path) => ({ path, size: statSync(path).size }))
    .filter(({ size }) => size > 100_000)
    .map(({ path, size }) => `${path}=${size} bytes`);

  return { failures, advisory };
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("context-budget-check.ts") ||
    process.argv[1].endsWith("context-budget-check.js") ||
    process.argv[1].includes("context-budget-check"));

if (isMain) {
  const { failures, advisory } = evaluateContextBudget();

  if (failures.length > 0) {
    console.error("Context budget check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Context budget check passed.");
  if (advisory.length > 0) {
    console.log(`Large files are allowed but should be read with targeted search: ${advisory.join("; ")}`);
  }
}

