import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  allowedQueueOperationCommandExecutionStates,
  allowedQueueOperationExternalImpactStates,
  allowedQueueOperationSecretsDisplayedStates,
  allowedQueueOperationWorkerCommands,
  getQueueOperationsStatus,
  queueOperationSafetyBoundaries,
  queueOperationWorkerCommands
} from "@/lib/operations/queue-operations";

const publicWorkerCommandFields = ["command", "mode", "boundary"];
const publicStatusFields = [
  "workerCommandCount",
  "safetyBoundaryCount",
  "commandExecution",
  "externalImpact",
  "secretsDisplayed",
  "workerCommands",
  "safetyBoundaries"
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

describe("getQueueOperationsStatus", () => {
  it("reports required queue worker command inventory and read-only counts", () => {
    const status = getQueueOperationsStatus();

    expect(status.workerCommandCount).toBe(4);
    expect(status.safetyBoundaryCount).toBe(5);
    expect(status.commandExecution).toBe("none");
    expect(status.externalImpact).toBe("none");
    expect(status.secretsDisplayed).toBe(false);
    expect(status.workerCommands.map((command) => command.command)).toEqual([
      "npm run worker",
      "npm run worker:watch",
      "npm run worker:bullmq",
      "npm run queue:bullmq:smoke"
    ]);
  });

  it("exposes only public queue operations fields", () => {
    const status = getQueueOperationsStatus();
    const expectedCommandFields = [...publicWorkerCommandFields].sort();

    expect(sortedFields(status)).toEqual([...publicStatusFields].sort());
    expect(queueOperationWorkerCommands.every((command) => sortedFields(command).join("|") === expectedCommandFields.join("|"))).toBe(true);
    expect(status.workerCommands.every((command) => sortedFields(command).join("|") === expectedCommandFields.join("|"))).toBe(true);
  });

  it("keeps exported and per-call queue operations snapshots frozen", () => {
    const firstStatus = getQueueOperationsStatus();
    const secondStatus = getQueueOperationsStatus();
    const firstCommand = firstStatus.workerCommands[0];

    expect(Object.isFrozen(queueOperationWorkerCommands)).toBe(true);
    expect(queueOperationWorkerCommands.every((command) => Object.isFrozen(command))).toBe(true);
    expect(Object.isFrozen(queueOperationSafetyBoundaries)).toBe(true);
    expect(Object.isFrozen(firstStatus)).toBe(true);
    expect(Object.isFrozen(firstStatus.workerCommands)).toBe(true);
    expect(Object.isFrozen(firstStatus.safetyBoundaries)).toBe(true);
    expect(firstStatus.workerCommands).not.toBe(secondStatus.workerCommands);
    expect(firstStatus.safetyBoundaries).not.toBe(secondStatus.safetyBoundaries);
    expect(firstStatus.workerCommands[0]).not.toBe(queueOperationWorkerCommands[0]);
    expect(() => (firstStatus.workerCommands as unknown as Array<(typeof queueOperationWorkerCommands)[number]>).pop()).toThrow(TypeError);
    expect(() => ((firstCommand as { mode: string }).mode = "unsafe")).toThrow(TypeError);
    expect(getQueueOperationsStatus().workerCommands[0].mode).toBe(queueOperationWorkerCommands[0].mode);
  });

  it("keeps queue operation metadata in canonical local-only shape", () => {
    expect(queueOperationWorkerCommands.map((command) => command.command).filter((command) => !command.startsWith("npm run "))).toEqual([]);
    expect(queueOperationWorkerCommands.map((command) => command.mode).filter((mode) => mode.trim().length === 0)).toEqual([]);
    expect(queueOperationWorkerCommands.map((command) => command.boundary).filter((boundary) => boundary.trim().length === 0)).toEqual([]);
    expect(queueOperationSafetyBoundaries.filter((boundary) => boundary.trim().length === 0)).toEqual([]);
  });

  it("keeps queue operation static metadata whitespace-clean", () => {
    const staticCopy = [
      ...queueOperationWorkerCommands.flatMap((command) => [command.command, command.mode, command.boundary]),
      ...queueOperationSafetyBoundaries
    ];

    expect(staticCopy.filter((copy) => copy !== copy.trim())).toEqual([]);
    expect(staticCopy.filter((copy) => copy.includes("\n") || copy.includes("\r"))).toEqual([]);
    expect(staticCopy.filter((copy) => copy.includes("  "))).toEqual([]);
  });

  it("keeps queue operation values inside documented local worker boundaries", () => {
    expect(queueOperationWorkerCommands.map((command) => command.mode)).toEqual([
      "database one-shot",
      "database continuous",
      "bullmq worker",
      "bullmq smoke"
    ]);

    const workerBoundaryCopy = queueOperationWorkerCommands.map((command) => command.boundary).join(" ");
    const safetyCopy = queueOperationSafetyBoundaries.join(" ");

    expect(workerBoundaryCopy).toContain("local");
    expect(workerBoundaryCopy).toContain("dummy");
    expect(workerBoundaryCopy).toContain("live messaging");
    expect(workerBoundaryCopy).toContain("QueueJob");
    expect(workerBoundaryCopy).toContain("Redis");
    expect(safetyCopy).toContain("enqueue");
    expect(safetyCopy).toContain("workers");
    expect(safetyCopy).toContain("Redis");
    expect(safetyCopy).toContain("providers");
    expect(safetyCopy).toContain("billing");
    expect(safetyCopy).toContain("notifications");
    expect(safetyCopy).toContain("SMS");
    expect(safetyCopy).toContain("mutations");
    expect(safetyCopy).toContain("campaign status");
  });

  it("keeps queue operation summary states inside the no-impact vocabulary", () => {
    const status = getQueueOperationsStatus();

    expect(allowedQueueOperationCommandExecutionStates).toEqual(["none"]);
    expect(allowedQueueOperationExternalImpactStates).toEqual(["none"]);
    expect(allowedQueueOperationSecretsDisplayedStates).toEqual([false]);
    expect(Object.isFrozen(allowedQueueOperationCommandExecutionStates)).toBe(true);
    expect(Object.isFrozen(allowedQueueOperationExternalImpactStates)).toBe(true);
    expect(Object.isFrozen(allowedQueueOperationSecretsDisplayedStates)).toBe(true);
    expect(allowedQueueOperationCommandExecutionStates).toContain(status.commandExecution);
    expect(allowedQueueOperationExternalImpactStates).toContain(status.externalImpact);
    expect(allowedQueueOperationSecretsDisplayedStates).toContain(status.secretsDisplayed);
  });

  it("keeps exported queue operation vocabularies frozen against caller mutation", () => {
    const vocabularies = [
      allowedQueueOperationWorkerCommands,
      allowedQueueOperationCommandExecutionStates,
      allowedQueueOperationExternalImpactStates,
      allowedQueueOperationSecretsDisplayedStates
    ];

    for (const vocabulary of vocabularies) {
      expect(Object.isFrozen(vocabulary)).toBe(true);
      expect(() => (vocabulary as unknown as unknown[]).push("unsafe")).toThrow(TypeError);
    }
  });

  it("keeps queue operation worker commands inside the supported command allowlist", () => {
    expect(allowedQueueOperationWorkerCommands).toEqual([
      "npm run worker",
      "npm run worker:watch",
      "npm run worker:bullmq",
      "npm run queue:bullmq:smoke"
    ]);
    expect(Object.isFrozen(allowedQueueOperationWorkerCommands)).toBe(true);
    expect(queueOperationWorkerCommands.map((command) => command.command)).toEqual(allowedQueueOperationWorkerCommands);
    const allowedCommands = new Set<string>(allowedQueueOperationWorkerCommands);

    expect(
      queueOperationWorkerCommands.map((command) => command.command).filter((command) => !allowedCommands.has(command))
    ).toEqual([]);
  });

  it("keeps queue operation inventory order stable for local review pages", () => {
    expect(queueOperationWorkerCommands.map((command) => command.command)).toEqual([
      "npm run worker",
      "npm run worker:watch",
      "npm run worker:bullmq",
      "npm run queue:bullmq:smoke"
    ]);
    expect(queueOperationSafetyBoundaries).toEqual([
      "This view does not enqueue jobs, execute workers, call Redis, update campaign status, or mutate QueueJob rows.",
      "Queue review never calls providers, creates billing records, sends notifications, sends SMS, or enables live messaging.",
      "Worker execution remains an explicit local operator step with dummy-provider and live-disabled gates.",
      "BullMQ remains optional; Redis-backed acceleration cannot replace database idempotency or durable QueueJob records.",
      "Invalid payload visibility is read-only and does not repair, cancel, retry, or make mutations to queue records."
    ]);
  });

  it("keeps queue operation identifiers unique before local review pages render them", () => {
    const commands = queueOperationWorkerCommands.map((command) => command.command);
    const modes = queueOperationWorkerCommands.map((command) => command.mode);

    expect(new Set(commands).size).toBe(commands.length);
    expect(new Set(modes).size).toBe(modes.length);
    expect(new Set(queueOperationSafetyBoundaries).size).toBe(queueOperationSafetyBoundaries.length);
  });

  it("keeps queue operation command references backed by package scripts", () => {
    const scripts = packageScripts();
    const missingScripts = queueOperationWorkerCommands
      .map((command) => command.command.replace("npm run ", ""))
      .filter((scriptName) => !Object.prototype.hasOwnProperty.call(scripts, scriptName));

    expect(missingScripts).toEqual([]);
  });

  it("keeps queue operation static metadata free of secret-like literals", () => {
    const staticCopy = [
      ...queueOperationWorkerCommands.flatMap((command) => [command.command, command.mode, command.boundary]),
      ...queueOperationSafetyBoundaries
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
});
