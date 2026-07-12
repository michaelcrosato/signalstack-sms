import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  evaluateStandaloneRoadmapFiles,
  expectedStandaloneMilestoneIds,
  validateStandaloneRoadmapConsistency
} from "@/scripts/standalone-roadmap-check";

const statuses = new Map<string, string>([
  ["M0", "in progress"],
  ["M1", "not started"],
  ["M2", "partial foundation"],
  ["M3", "not started"],
  ["M4", "partial foundation"],
  ["M5", "partial foundation"],
  ["M6", "partial foundation"],
  ["M7", "partial foundation"],
  ["M8", "partial foundation"],
  ["M9", "partial foundation"],
  ["M10", "not started"],
  ["M11", "not started"]
]);

function validLedger() {
  return {
    schemaVersion: 1,
    roadmap: "docs/STANDALONE_ROADMAP.md",
    milestones: expectedStandaloneMilestoneIds.map((id) => ({
      id,
      status: statuses.get(id),
      evidence: [`tests/evidence/${id}.test.ts`]
    }))
  };
}

function validRoadmap() {
  const rows = expectedStandaloneMilestoneIds.map(
    (id) => `| ${id} | ${statuses.get(id)} | Current evidence for ${id}. |`
  ).join("\n");

  return [
    "# Roadmap",
    "",
    "## Verification Ledger",
    "",
    "| Milestone | Status | Authoritative evidence |",
    "| --- | --- | --- |",
    rows,
    "",
    "## Next section"
  ].join("\n");
}

describe("standalone roadmap check", () => {
  it("accepts the checked-in ledger and roadmap", () => {
    expect(evaluateStandaloneRoadmapFiles()).toEqual({ failures: [] });

    const ledger = JSON.parse(readFileSync("docs/standalone-verification.json", "utf8")) as {
      milestones: unknown[];
    };
    expect(ledger.milestones).toHaveLength(12);
  });

  it("requires each M0 through M11 milestone exactly once in both sources", () => {
    const ledger = validLedger();
    ledger.milestones[1] = { ...ledger.milestones[0] };
    const roadmap = validRoadmap().replace(
      "| M11 | not started | Current evidence for M11. |",
      "| M12 | not started | Unexpected evidence. |"
    );

    const { failures } = validateStandaloneRoadmapConsistency(ledger, roadmap);

    expect(failures).toContain("Standalone verification ledger must contain M0 exactly once; found 2.");
    expect(failures).toContain("Standalone verification ledger must contain M1 exactly once; found 0.");
    expect(failures).toContain("Roadmap verification ledger must contain M11 exactly once; found 0.");
    expect(failures).toContain("Roadmap verification ledger contains unexpected milestone M12.");
  });

  it("rejects unsupported or disagreeing statuses and invalid evidence arrays", () => {
    const ledger = validLedger();
    ledger.milestones[0] = {
      id: "M0",
      status: "complete",
      evidence: []
    };
    ledger.milestones[2] = {
      id: "M2",
      status: "done",
      evidence: ["../outside.txt"]
    };
    (ledger.milestones[3] as { evidence: unknown }).evidence = "not-an-array";

    const { failures } = validateStandaloneRoadmapConsistency(ledger, validRoadmap());

    expect(failures).toContain("Ledger milestone M0 has unsupported status: complete");
    expect(failures).toContain("Ledger milestone M0 evidence must contain at least one artifact path.");
    expect(failures).toContain(
      "Ledger milestone M2 evidence path is not normalized inside the repository: ../outside.txt"
    );
    expect(failures).toContain("Ledger milestone M3 evidence must be an array.");
    expect(failures).toContain(
      "Milestone M2 status disagrees: ledger=done, roadmap=partial foundation."
    );
  });
});
