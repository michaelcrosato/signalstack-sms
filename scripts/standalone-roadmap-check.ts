import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export const expectedStandaloneMilestoneIds = Object.freeze(
  Array.from({ length: 12 }, (_, index) => `M${index}`)
);

export const allowedStandaloneMilestoneStatuses = Object.freeze([
  "not started",
  "in progress",
  "partial foundation",
  "blocked-by-live-proof",
  "done"
] as const);

export type StandaloneMilestoneStatus = (typeof allowedStandaloneMilestoneStatuses)[number];

type RoadmapMilestoneRow = {
  id: string;
  status: string;
  evidence: string;
};

type ValidationOptions = {
  evidencePathExists?: (path: string) => boolean;
};

type FileCheckOptions = {
  cwd?: string;
  ledgerPath?: string;
  roadmapPath?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowedStatus(value: string): value is StandaloneMilestoneStatus {
  return allowedStandaloneMilestoneStatuses.includes(value as StandaloneMilestoneStatus);
}

function countIds(ids: string[]) {
  const counts = new Map<string, number>();
  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

function roadmapVerificationRows(roadmapText: string, failures: string[]): RoadmapMilestoneRow[] {
  const heading = "## Verification Ledger";
  const headingIndex = roadmapText.indexOf(heading);
  if (headingIndex === -1) {
    failures.push(`Roadmap is missing the ${heading} section.`);
    return [];
  }

  const afterHeading = roadmapText.slice(headingIndex + heading.length);
  const nextHeadingIndex = afterHeading.search(/\r?\n##\s+/);
  const section = nextHeadingIndex === -1 ? afterHeading : afterHeading.slice(0, nextHeadingIndex);
  const rows: RoadmapMilestoneRow[] = [];

  for (const line of section.split(/\r?\n/)) {
    const match = /^\|\s*(M\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/.exec(line);
    if (!match) {
      continue;
    }

    rows.push({
      id: match[1],
      status: match[2].trim(),
      evidence: match[3].trim()
    });
  }

  return rows;
}

function validateExpectedIds(source: string, ids: string[], failures: string[]) {
  const counts = countIds(ids);

  for (const expectedId of expectedStandaloneMilestoneIds) {
    const count = counts.get(expectedId) ?? 0;
    if (count !== 1) {
      failures.push(`${source} must contain ${expectedId} exactly once; found ${count}.`);
    }
  }

  for (const id of counts.keys()) {
    if (!expectedStandaloneMilestoneIds.includes(id)) {
      failures.push(`${source} contains unexpected milestone ${id}.`);
    }
  }
}

function validateEvidencePath(path: string, milestoneId: string, failures: string[]) {
  if (path !== path.trim() || path.length === 0) {
    failures.push(`Ledger milestone ${milestoneId} contains a blank or whitespace-padded evidence path.`);
    return false;
  }
  if (path.includes("\\") || isAbsolute(path)) {
    failures.push(`Ledger milestone ${milestoneId} evidence must use a repo-relative POSIX path: ${path}`);
    return false;
  }

  const normalized = normalize(path).replaceAll("\\", "/");
  if (normalized === ".." || normalized.startsWith("../") || normalized !== path) {
    failures.push(`Ledger milestone ${milestoneId} evidence path is not normalized inside the repository: ${path}`);
    return false;
  }
  return true;
}

export function validateStandaloneRoadmapConsistency(
  ledger: unknown,
  roadmapText: string,
  options: ValidationOptions = {}
) {
  const failures: string[] = [];
  const roadmapRows = roadmapVerificationRows(roadmapText, failures);
  validateExpectedIds("Roadmap verification ledger", roadmapRows.map((row) => row.id), failures);

  for (const row of roadmapRows) {
    if (!isAllowedStatus(row.status)) {
      failures.push(`Roadmap milestone ${row.id} has unsupported status: ${row.status}`);
    }
    if (!row.evidence) {
      failures.push(`Roadmap milestone ${row.id} is missing authoritative evidence text.`);
    }
  }

  if (!isRecord(ledger)) {
    failures.push("Standalone verification ledger must be a JSON object.");
    return { failures };
  }

  if (ledger.schemaVersion !== 1) {
    failures.push("Standalone verification ledger schemaVersion must be 1.");
  }
  if (ledger.roadmap !== "docs/STANDALONE_ROADMAP.md") {
    failures.push("Standalone verification ledger roadmap must be docs/STANDALONE_ROADMAP.md.");
  }
  if (!Array.isArray(ledger.milestones)) {
    failures.push("Standalone verification ledger milestones must be an array.");
    return { failures };
  }

  const ledgerRows: Array<{ id: string; status: string }> = [];
  for (const [index, milestone] of ledger.milestones.entries()) {
    if (!isRecord(milestone)) {
      failures.push(`Ledger milestone at index ${index} must be an object.`);
      continue;
    }

    const id = typeof milestone.id === "string" ? milestone.id : `<index:${index}>`;
    const status = typeof milestone.status === "string" ? milestone.status : "";
    ledgerRows.push({ id, status });

    if (typeof milestone.id !== "string" || !/^M\d+$/.test(milestone.id)) {
      failures.push(`Ledger milestone at index ${index} has an invalid id.`);
    }
    if (!isAllowedStatus(status)) {
      failures.push(`Ledger milestone ${id} has unsupported status: ${status || "<missing>"}`);
    }
    if (!Array.isArray(milestone.evidence)) {
      failures.push(`Ledger milestone ${id} evidence must be an array.`);
      continue;
    }
    if (milestone.evidence.length === 0) {
      failures.push(`Ledger milestone ${id} evidence must contain at least one artifact path.`);
    }

    const seenEvidence = new Set<string>();
    for (const evidence of milestone.evidence) {
      if (typeof evidence !== "string") {
        failures.push(`Ledger milestone ${id} evidence entries must be strings.`);
        continue;
      }
      const validPath = validateEvidencePath(evidence, id, failures);
      if (seenEvidence.has(evidence)) {
        failures.push(`Ledger milestone ${id} repeats evidence path: ${evidence}`);
      }
      seenEvidence.add(evidence);
      if (validPath && options.evidencePathExists && !options.evidencePathExists(evidence)) {
        failures.push(`Ledger milestone ${id} references missing evidence: ${evidence}`);
      }
    }
  }

  validateExpectedIds("Standalone verification ledger", ledgerRows.map((row) => row.id), failures);

  const roadmapById = new Map(roadmapRows.map((row) => [row.id, row]));
  const ledgerCounts = countIds(ledgerRows.map((row) => row.id));
  const roadmapCounts = countIds(roadmapRows.map((row) => row.id));
  for (const row of ledgerRows) {
    if ((ledgerCounts.get(row.id) ?? 0) !== 1 || (roadmapCounts.get(row.id) ?? 0) !== 1) {
      continue;
    }
    const roadmapRow = roadmapById.get(row.id);
    if (roadmapRow && roadmapRow.status !== row.status) {
      failures.push(
        `Milestone ${row.id} status disagrees: ledger=${row.status}, roadmap=${roadmapRow.status}.`
      );
    }
  }

  return { failures };
}

export function evaluateStandaloneRoadmapFiles(options: FileCheckOptions = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const ledgerPath = options.ledgerPath ?? "docs/standalone-verification.json";
  const roadmapPath = options.roadmapPath ?? "docs/STANDALONE_ROADMAP.md";
  const failures: string[] = [];
  let ledger: unknown;
  let roadmapText = "";

  try {
    ledger = JSON.parse(readFileSync(resolve(cwd, ledgerPath), "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`Could not read standalone verification ledger: ${message}`);
  }

  try {
    roadmapText = readFileSync(resolve(cwd, roadmapPath), "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`Could not read standalone roadmap: ${message}`);
  }

  if (failures.length > 0) {
    return { failures };
  }

  const result = validateStandaloneRoadmapConsistency(ledger, roadmapText, {
    evidencePathExists: (path) => {
      const absolutePath = resolve(cwd, path);
      return relative(cwd, absolutePath).split(/[\\/]/)[0] !== ".." && existsSync(absolutePath);
    }
  });
  return result;
}

const isMain =
  process.argv[1]?.endsWith("standalone-roadmap-check.ts") ||
  process.argv[1]?.endsWith("standalone-roadmap-check.js");

if (isMain) {
  const { failures } = evaluateStandaloneRoadmapFiles();
  if (failures.length > 0) {
    console.error("Standalone roadmap check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Standalone roadmap check passed.");
}
