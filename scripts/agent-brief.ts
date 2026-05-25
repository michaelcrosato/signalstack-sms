import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const handoffFiles = [
  "SUMMARY.codex.md",
  "BLOCKERS.codex.md",
  "docs/NEXT_PROMPTS.md",
  "docs/CURRENT_STATE_MATRIX.md",
  "docs/AGENT-LOOP.md"
] as const;

const largeContextFiles = [
  "LOOP_LOG.md",
  "docs/LOOP_LOG.md",
  "tests/unit/auth/api-route-authorization.test.ts",
  "tests/unit/queue/live-worker-controls.test.ts",
  "contracts/CONTRACT-TESTING.md"
] as const;

function git(args: string[], maxLines = 40) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    return "(unavailable)";
  }

  return result.stdout
    .trim()
    .split(/\r?\n/)
    .slice(0, maxLines)
    .join("\n")
    .trim();
}

function fileText(path: string) {
  return readFileSync(path, "utf8");
}

function markdownSection(path: string, heading: string, maxLines = 14) {
  const text = fileText(path);
  const marker = `## ${heading}`;
  const start = text.indexOf(marker);
  if (start === -1) {
    return "(section not found)";
  }

  const next = text.indexOf("\n## ", start + marker.length);
  return text
    .slice(start, next === -1 ? undefined : next)
    .trim()
    .split(/\r?\n/)
    .slice(0, maxLines)
    .join("\n");
}

function fileSizeLine(path: string) {
  return `${path}: ${statSync(path).size.toLocaleString()} bytes`;
}

function latestLoopRuns(path: string, maxRuns = 5) {
  const matches = [...fileText(path).matchAll(/^## Run\s+(\d+)\s+(.+)$/gm)]
    .map((match) => ({ run: Number(match[1]), heading: `Run ${match[1]} ${match[2]}` }))
    .filter(({ run }) => Number.isFinite(run))
    .sort((left, right) => right.run - left.run)
    .slice(0, maxRuns)
    .map(({ heading }) => `- ${heading}`);

  return matches.length > 0 ? matches.join("\n") : "- (no run headings found)";
}

function printBlock(title: string, body: string) {
  console.log(`\n## ${title}`);
  console.log(body.trim() || "(none)");
}

console.log("# SignalStack Agent Brief");
console.log(`Generated: ${new Date().toISOString()}`);
console.log("Purpose: compact startup context for autonomous loops; use targeted reads after this.");

printBlock("Git Status", git(["status", "--short", "--branch"], 80));
printBlock("Recent Commits", git(["log", "--oneline", "--decorate", "-n", "8"], 12));
printBlock("Dirty Diff Stat", git(["diff", "--stat"], 40));
printBlock("Next Prompt Current State", markdownSection("docs/NEXT_PROMPTS.md", "Current State"));
printBlock("Next Work", markdownSection("docs/NEXT_PROMPTS.md", "Next Work", 10));
printBlock("Context Discipline", markdownSection("docs/NEXT_PROMPTS.md", "Context Discipline", 10));
printBlock("Current Handoff Sizes", handoffFiles.map(fileSizeLine).join("\n"));
printBlock("Large File Advisory", largeContextFiles.map(fileSizeLine).join("\n"));
printBlock("Latest Loop Runs", latestLoopRuns("LOOP_LOG.md"));
printBlock(
  "Required First Reads",
  [
    "1. docs/AXIOMS.md",
    "2. docs/AGENT-LOOP.md",
    "3. This brief output",
    "4. Targeted files for the selected task"
  ].join("\n")
);
