import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  contractOperationDriftControls,
  contractOperationFiles,
  contractOperationValidationChecks,
  getContractOperationsStatus
} from "@/lib/operations/contract-operations";

const publicContractFileFields = ["name", "path", "boundary"];
const publicValidationCheckFields = ["command", "purpose"];
const publicStatusFields = [
  "contractFileCount",
  "validationCheckCount",
  "driftControlCount",
  "externalImpact",
  "contractFiles",
  "validationChecks",
  "driftControls"
];

function sortedFields(value: object) {
  return Object.keys(value).sort();
}

describe("getContractOperationsStatus", () => {
  it("reports required contract inventory and read-only counts", () => {
    const status = getContractOperationsStatus();

    expect(status.contractFileCount).toBe(9);
    expect(status.validationCheckCount).toBe(4);
    expect(status.driftControlCount).toBe(5);
    expect(status.externalImpact).toBe("none");
    expect(status.contractFiles.map((file) => file.path)).toEqual([
      "contracts/CONTRACT-DB.md",
      "contracts/CONTRACT-API.md",
      "contracts/CONTRACT-WEBHOOKS.md",
      "contracts/CONTRACT-PROVIDER-ADAPTER.md",
      "contracts/CONTRACT-AI.md",
      "contracts/CONTRACT-BILLING.md",
      "contracts/CONTRACT-COMPLIANCE.md",
      "contracts/CONTRACT-QUEUE.md",
      "contracts/CONTRACT-TESTING.md"
    ]);
    expect(status.validationChecks.map((check) => check.command)).toEqual([
      "npm run contracts:check",
      "npm run validate",
      "npm run test:e2e:demo",
      "npm run secrets:scan"
    ]);
  });

  it("keeps listed contract paths backed by local files without reading contents", () => {
    const missingFiles = contractOperationFiles
      .map((file) => file.path)
      .filter((path) => !existsSync(join(process.cwd(), path)));

    expect(missingFiles).toEqual([]);
  });

  it("exposes only public contract operations fields", () => {
    const status = getContractOperationsStatus();
    const expectedFileFields = [...publicContractFileFields].sort();
    const expectedCheckFields = [...publicValidationCheckFields].sort();

    expect(sortedFields(status)).toEqual([...publicStatusFields].sort());
    expect(contractOperationFiles.every((file) => sortedFields(file).join("|") === expectedFileFields.join("|"))).toBe(true);
    expect(status.contractFiles.every((file) => sortedFields(file).join("|") === expectedFileFields.join("|"))).toBe(true);
    expect(contractOperationValidationChecks.every((check) => sortedFields(check).join("|") === expectedCheckFields.join("|"))).toBe(true);
    expect(status.validationChecks.every((check) => sortedFields(check).join("|") === expectedCheckFields.join("|"))).toBe(true);
  });

  it("keeps exported and per-call contract operations snapshots frozen", () => {
    const firstStatus = getContractOperationsStatus();
    const secondStatus = getContractOperationsStatus();
    const firstFile = firstStatus.contractFiles[0];

    expect(Object.isFrozen(contractOperationFiles)).toBe(true);
    expect(contractOperationFiles.every((file) => Object.isFrozen(file))).toBe(true);
    expect(Object.isFrozen(contractOperationValidationChecks)).toBe(true);
    expect(contractOperationValidationChecks.every((check) => Object.isFrozen(check))).toBe(true);
    expect(Object.isFrozen(contractOperationDriftControls)).toBe(true);
    expect(Object.isFrozen(firstStatus)).toBe(true);
    expect(Object.isFrozen(firstStatus.contractFiles)).toBe(true);
    expect(Object.isFrozen(firstStatus.validationChecks)).toBe(true);
    expect(Object.isFrozen(firstStatus.driftControls)).toBe(true);
    expect(firstStatus.contractFiles).not.toBe(secondStatus.contractFiles);
    expect(firstStatus.validationChecks).not.toBe(secondStatus.validationChecks);
    expect(firstStatus.driftControls).not.toBe(secondStatus.driftControls);
    expect(firstStatus.contractFiles[0]).not.toBe(contractOperationFiles[0]);
    expect(() => (firstStatus.contractFiles as unknown as Array<(typeof contractOperationFiles)[number]>).pop()).toThrow(TypeError);
    expect(() => ((firstFile as { path: string }).path = "contracts/CONTRACT-UNSAFE.md")).toThrow(TypeError);
    expect(getContractOperationsStatus().contractFiles[0].path).toBe(contractOperationFiles[0].path);
  });

  it("keeps contract operation metadata in canonical local-only shape", () => {
    expect(contractOperationFiles.map((file) => file.path).filter((path) => !path.startsWith("contracts/CONTRACT-"))).toEqual([]);
    expect(contractOperationFiles.map((file) => file.path).filter((path) => !path.endsWith(".md"))).toEqual([]);
    expect(contractOperationFiles.map((file) => file.path).filter((path) => path.includes("\\") || path.includes("?") || path.includes("#"))).toEqual([]);
    expect(contractOperationFiles.map((file) => file.name).filter((name) => name.trim().length === 0)).toEqual([]);
    expect(contractOperationFiles.map((file) => file.boundary).filter((boundary) => boundary.trim().length === 0)).toEqual([]);
    expect(contractOperationValidationChecks.map((check) => check.command).filter((command) => !command.startsWith("npm run "))).toEqual([]);
    expect(contractOperationValidationChecks.map((check) => check.purpose).filter((purpose) => purpose.trim().length === 0)).toEqual([]);
    expect(contractOperationDriftControls.filter((control) => control.trim().length === 0)).toEqual([]);
  });

  it("keeps contract operation inventory order stable for local review pages", () => {
    expect(contractOperationFiles.map((file) => file.path)).toEqual([
      "contracts/CONTRACT-DB.md",
      "contracts/CONTRACT-API.md",
      "contracts/CONTRACT-WEBHOOKS.md",
      "contracts/CONTRACT-PROVIDER-ADAPTER.md",
      "contracts/CONTRACT-AI.md",
      "contracts/CONTRACT-BILLING.md",
      "contracts/CONTRACT-COMPLIANCE.md",
      "contracts/CONTRACT-QUEUE.md",
      "contracts/CONTRACT-TESTING.md"
    ]);
    expect(contractOperationValidationChecks.map((check) => check.command)).toEqual([
      "npm run contracts:check",
      "npm run validate",
      "npm run test:e2e:demo",
      "npm run secrets:scan"
    ]);
    expect(contractOperationDriftControls).toEqual([
      "Product API routes must be documented in contracts and docs before or with implementation.",
      "Read-only settings pages must state the actions they do not perform.",
      "Live SMS, billing, notifications, provider calls, and live AI remain blocked by defaults.",
      "Tenant-scoped data access must preserve the orgId invariant and avoid cross-tenant reads.",
      "Seeded demo path coverage must expand when demo-visible operational routes are added."
    ]);
  });
});
