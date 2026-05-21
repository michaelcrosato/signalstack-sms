import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  allowedValidationOperationCommandExecutionStates,
  allowedValidationOperationExternalImpactStates,
  allowedValidationOperationGateCommands,
  allowedValidationOperationMutationStates,
  allowedValidationOperationSecretsDisplayedStates,
  getValidationOperationsStatus,
  validationOperationGateCommands,
  validationOperationRepairSignals
} from "@/lib/operations/validation-operations";

const publicGateCommandFields = ["command", "area", "boundary"];
const publicStatusFields = [
  "gateCommandCount",
  "repairSignalCount",
  "commandExecution",
  "externalImpact",
  "mutation",
  "secretsDisplayed",
  "gateCommands",
  "repairSignals"
];

function sortedFields(value: object) {
  return Object.keys(value).sort();
}

function packageScripts() {
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };

  return packageJson.scripts ?? {};
}

describe("getValidationOperationsStatus", () => {
  it("reports required validation gate inventory and read-only counts", () => {
    const status = getValidationOperationsStatus();

    expect(status.gateCommandCount).toBe(9);
    expect(status.repairSignalCount).toBe(5);
    expect(status.commandExecution).toBe("none");
    expect(status.externalImpact).toBe("none");
    expect(status.mutation).toBe("none");
    expect(status.secretsDisplayed).toBe(false);
    expect(status.gateCommands.map((gate) => gate.command)).toEqual([
      "npm run validate",
      "npm run contracts:check",
      "npm run compliance:check",
      "npm run production:gate",
      "npm run observability:check",
      "npm run operator:check",
      "npm run platform:check",
      "npm run secrets:scan",
      "npm run test:e2e:demo"
    ]);
  });

  it("exposes only public validation operations fields", () => {
    const status = getValidationOperationsStatus();
    const expectedGateFields = [...publicGateCommandFields].sort();

    expect(sortedFields(status)).toEqual([...publicStatusFields].sort());
    expect(validationOperationGateCommands.every((gate) => sortedFields(gate).join("|") === expectedGateFields.join("|"))).toBe(true);
    expect(status.gateCommands.every((gate) => sortedFields(gate).join("|") === expectedGateFields.join("|"))).toBe(true);
  });

  it("keeps exported and per-call validation operations snapshots frozen", () => {
    const firstStatus = getValidationOperationsStatus();
    const secondStatus = getValidationOperationsStatus();
    const firstGate = firstStatus.gateCommands[0];

    expect(Object.isFrozen(validationOperationGateCommands)).toBe(true);
    expect(validationOperationGateCommands.every((gate) => Object.isFrozen(gate))).toBe(true);
    expect(Object.isFrozen(validationOperationRepairSignals)).toBe(true);
    expect(Object.isFrozen(firstStatus)).toBe(true);
    expect(Object.isFrozen(firstStatus.gateCommands)).toBe(true);
    expect(Object.isFrozen(firstStatus.repairSignals)).toBe(true);
    expect(firstStatus.gateCommands).not.toBe(secondStatus.gateCommands);
    expect(firstStatus.repairSignals).not.toBe(secondStatus.repairSignals);
    expect(firstStatus.gateCommands[0]).not.toBe(validationOperationGateCommands[0]);
    expect(() => (firstStatus.gateCommands as unknown as Array<(typeof validationOperationGateCommands)[number]>).pop()).toThrow(TypeError);
    expect(() => ((firstGate as { command: string }).command = "npm run unsafe")).toThrow(TypeError);
    expect(getValidationOperationsStatus().gateCommands[0].command).toBe(validationOperationGateCommands[0].command);
  });

  it("keeps validation operation metadata in canonical local-only shape", () => {
    expect(validationOperationGateCommands.map((gate) => gate.command).filter((command) => !command.startsWith("npm run "))).toEqual([]);
    expect(validationOperationGateCommands.map((gate) => gate.area).filter((area) => area.trim().length === 0)).toEqual([]);
    expect(validationOperationGateCommands.map((gate) => gate.boundary).filter((boundary) => boundary.trim().length === 0)).toEqual([]);
    expect(validationOperationRepairSignals.filter((signal) => signal.trim().length === 0)).toEqual([]);
  });

  it("keeps validation operation static metadata whitespace-clean", () => {
    const staticCopy = [
      ...validationOperationGateCommands.flatMap((gate) => [gate.command, gate.area, gate.boundary]),
      ...validationOperationRepairSignals
    ];

    expect(staticCopy.filter((copy) => copy !== copy.trim())).toEqual([]);
    expect(staticCopy.filter((copy) => copy.includes("\n") || copy.includes("\r"))).toEqual([]);
    expect(staticCopy.filter((copy) => copy.includes("  "))).toEqual([]);
  });

  it("keeps validation operation values inside documented local-only boundaries", () => {
    expect(validationOperationGateCommands.map((gate) => gate.area)).toEqual([
      "full local gate",
      "contracts",
      "safety defaults",
      "deployment",
      "observability",
      "runbook",
      "platform",
      "secrets",
      "investor demo"
    ]);

    const gateBoundaries = validationOperationGateCommands.map((gate) => gate.boundary).join(" ");
    const repairSignals = validationOperationRepairSignals.join(" ");

    expect(gateBoundaries).toContain("local");
    expect(gateBoundaries).toContain("demo-safe");
    expect(gateBoundaries).toContain("blocked");
    expect(gateBoundaries).toContain("secrets");
    expect(repairSignals).toContain("does not execute commands");
    expect(repairSignals).toContain("DATABASE_URL");
    expect(repairSignals).toContain("Playwright");
    expect(repairSignals).toContain("Live provider");
    expect(repairSignals).toContain("live AI");
    expect(repairSignals).toContain("smallest failing command");
  });

  it("keeps validation operation summary states inside the no-impact vocabulary", () => {
    const status = getValidationOperationsStatus();

    expect(allowedValidationOperationCommandExecutionStates).toEqual(["none"]);
    expect(allowedValidationOperationExternalImpactStates).toEqual(["none"]);
    expect(allowedValidationOperationMutationStates).toEqual(["none"]);
    expect(allowedValidationOperationSecretsDisplayedStates).toEqual([false]);
    expect(Object.isFrozen(allowedValidationOperationCommandExecutionStates)).toBe(true);
    expect(Object.isFrozen(allowedValidationOperationExternalImpactStates)).toBe(true);
    expect(Object.isFrozen(allowedValidationOperationMutationStates)).toBe(true);
    expect(Object.isFrozen(allowedValidationOperationSecretsDisplayedStates)).toBe(true);
    expect(allowedValidationOperationCommandExecutionStates).toContain(status.commandExecution);
    expect(allowedValidationOperationExternalImpactStates).toContain(status.externalImpact);
    expect(allowedValidationOperationMutationStates).toContain(status.mutation);
    expect(allowedValidationOperationSecretsDisplayedStates).toContain(status.secretsDisplayed);
  });

  it("keeps exported validation operation vocabularies frozen against caller mutation", () => {
    const vocabularies = [
      allowedValidationOperationGateCommands,
      allowedValidationOperationCommandExecutionStates,
      allowedValidationOperationExternalImpactStates,
      allowedValidationOperationMutationStates,
      allowedValidationOperationSecretsDisplayedStates
    ];

    for (const vocabulary of vocabularies) {
      expect(Object.isFrozen(vocabulary)).toBe(true);
      expect(() => (vocabulary as unknown as unknown[]).push("unsafe")).toThrow(TypeError);
    }
  });

  it("keeps validation operation gate commands inside the supported command allowlist", () => {
    expect(allowedValidationOperationGateCommands).toEqual([
      "npm run validate",
      "npm run contracts:check",
      "npm run compliance:check",
      "npm run production:gate",
      "npm run observability:check",
      "npm run operator:check",
      "npm run platform:check",
      "npm run secrets:scan",
      "npm run test:e2e:demo"
    ]);
    expect(Object.isFrozen(allowedValidationOperationGateCommands)).toBe(true);
    expect(validationOperationGateCommands.map((gate) => gate.command)).toEqual(allowedValidationOperationGateCommands);
    const allowedCommands = new Set<string>(allowedValidationOperationGateCommands);

    expect(
      validationOperationGateCommands.map((gate) => gate.command).filter((command) => !allowedCommands.has(command))
    ).toEqual([]);
  });

  it("keeps validation operation inventory order stable for local review pages", () => {
    expect(validationOperationGateCommands.map((gate) => gate.command)).toEqual([
      "npm run validate",
      "npm run contracts:check",
      "npm run compliance:check",
      "npm run production:gate",
      "npm run observability:check",
      "npm run operator:check",
      "npm run platform:check",
      "npm run secrets:scan",
      "npm run test:e2e:demo"
    ]);
    expect(validationOperationRepairSignals).toEqual([
      "The page does not execute commands or inspect process output.",
      "Database migration and demo seed still require an explicit local DATABASE_URL command.",
      "Playwright coverage should expand when demo-visible admin pages are added.",
      "Live provider, live billing, notification, and live AI settings must stay blocked in validation.",
      "Failures should be repaired by rerunning the smallest failing command before the full gate."
    ]);
  });

  it("keeps validation operation identifiers unique before local review pages render them", () => {
    const commands = validationOperationGateCommands.map((gate) => gate.command);
    const areas = validationOperationGateCommands.map((gate) => gate.area);

    expect(new Set(commands).size).toBe(commands.length);
    expect(new Set(areas).size).toBe(areas.length);
    expect(new Set(validationOperationRepairSignals).size).toBe(validationOperationRepairSignals.length);
  });

  it("keeps validation operation command references backed by package scripts", () => {
    const scripts = packageScripts();
    const missingScripts = validationOperationGateCommands
      .map((gate) => gate.command.replace("npm run ", ""))
      .filter((scriptName) => !Object.prototype.hasOwnProperty.call(scripts, scriptName));

    expect(missingScripts).toEqual([]);
  });

  it("keeps validation operation static metadata free of secret-like literals", () => {
    const staticCopy = [
      ...validationOperationGateCommands.flatMap((gate) => [gate.command, gate.area, gate.boundary]),
      ...validationOperationRepairSignals
    ];
    const secretLikePatterns = [
      /\bsk_(?:live|test)_[A-Za-z0-9]+/,
      /\bpk_live_[A-Za-z0-9]+/,
      /\bAC[a-fA-F0-9]{32}\b/,
      /\b(?:TWILIO_AUTH_TOKEN|STRIPE_SECRET_KEY|OPENAI_API_KEY|CLERK_SECRET_KEY)\s*=/,
      /\bBearer\s+[A-Za-z0-9._-]{12,}/
    ];

    expect(staticCopy.filter((copy) => secretLikePatterns.some((pattern) => pattern.test(copy)))).toEqual([]);
  });

  it("keeps validation operation non-command metadata free of command-like literals", () => {
    const nonCommandCopy = [
      ...validationOperationGateCommands.flatMap((gate) => [gate.area, gate.boundary]),
      ...validationOperationRepairSignals
    ];
    const commandLikePatterns = [
      /\bnpm\s+run\b/i,
      /\bnpx\b/i,
      /\bpowershell\b/i,
      /\bcurl\b/i,
      /\bInvoke-WebRequest\b/i
    ];

    expect(nonCommandCopy.filter((copy) => commandLikePatterns.some((pattern) => pattern.test(copy)))).toEqual([]);
  });
});
