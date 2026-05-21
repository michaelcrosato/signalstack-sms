export const allowedQueueOperationWorkerCommands = Object.freeze([
  "npm run worker",
  "npm run worker:watch",
  "npm run worker:bullmq",
  "npm run queue:bullmq:smoke"
] as const);
export const allowedQueueOperationModes = Object.freeze([
  "database one-shot",
  "database continuous",
  "bullmq worker",
  "bullmq smoke"
] as const);
export const allowedQueueOperationCommandExecutionStates = Object.freeze(["none"] as const);
export const allowedQueueOperationExternalImpactStates = Object.freeze(["none"] as const);
export const allowedQueueOperationSecretsDisplayedStates = Object.freeze([false] as const);

export type QueueOperationSupportedWorkerCommand = (typeof allowedQueueOperationWorkerCommands)[number];
export type QueueOperationMode = (typeof allowedQueueOperationModes)[number];
export type QueueOperationCommandExecutionState = (typeof allowedQueueOperationCommandExecutionStates)[number];
export type QueueOperationExternalImpactState = (typeof allowedQueueOperationExternalImpactStates)[number];
export type QueueOperationSecretsDisplayedState = (typeof allowedQueueOperationSecretsDisplayedStates)[number];

export type QueueOperationWorkerCommand = {
  command: QueueOperationSupportedWorkerCommand;
  mode: QueueOperationMode;
  boundary: string;
};

export type QueueOperationsStatus = {
  workerCommandCount: number;
  safetyBoundaryCount: number;
  commandExecution: QueueOperationCommandExecutionState;
  externalImpact: QueueOperationExternalImpactState;
  secretsDisplayed: QueueOperationSecretsDisplayedState;
  workerCommands: readonly QueueOperationWorkerCommand[];
  safetyBoundaries: readonly string[];
};

const queueOperationWorkerCommandFields = ["command", "mode", "boundary"] as const;
const requiredWorkerBoundaryTerms = ["local", "dummy", "live messaging", "QueueJob", "Redis"] as const;
const requiredSafetyBoundaryTerms = [
  "enqueue",
  "workers",
  "Redis",
  "providers",
  "billing",
  "notifications",
  "SMS",
  "mutations",
  "campaign status"
] as const;
const forbiddenSecretMetadataPatterns = [
  /\bsk_(?:live|test)_[A-Za-z0-9]+/,
  /\bpk_live_[A-Za-z0-9]+/,
  /\bAC[a-fA-F0-9]{32}\b/,
  /\b(?:TWILIO_AUTH_TOKEN|STRIPE_SECRET_KEY|OPENAI_API_KEY|CLERK_SECRET_KEY)\s*=/,
  /\bBearer\s+[A-Za-z0-9._-]{12,}/
] as const;

const queueOperationStatusSummary = Object.freeze({
  commandExecution: "none",
  externalImpact: "none",
  secretsDisplayed: false
} satisfies Pick<QueueOperationsStatus, "commandExecution" | "externalImpact" | "secretsDisplayed">);

function assertExactFields<T extends object>(value: T, fields: readonly string[], errorMessage: string) {
  const actualKeys = Reflect.ownKeys(value);

  if (actualKeys.length !== fields.length || actualKeys.some((key) => !fields.includes(String(key)))) {
    throw new Error(errorMessage);
  }
}

function assertNonblankString(value: unknown, errorMessage: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(errorMessage);
  }
}

function assertCleanCopy(value: string, errorMessage: string) {
  if (value !== value.trim() || value.includes("\n") || value.includes("\r") || value.includes("  ")) {
    throw new Error(errorMessage);
  }
}

function assertNoSecretLikeMetadata(value: string, errorMessage: string) {
  if (forbiddenSecretMetadataPatterns.some((pattern) => pattern.test(value))) {
    throw new Error(errorMessage);
  }
}

function assertUniqueValues(values: readonly string[], errorMessage: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(errorMessage);
  }
}

function assertStatusSummary(summary: Pick<QueueOperationsStatus, "commandExecution" | "externalImpact" | "secretsDisplayed">) {
  if (!allowedQueueOperationCommandExecutionStates.includes(summary.commandExecution)) {
    throw new Error(`Unsupported queue operation command execution state: ${summary.commandExecution}`);
  }

  if (!allowedQueueOperationExternalImpactStates.includes(summary.externalImpact)) {
    throw new Error(`Unsupported queue operation external impact state: ${summary.externalImpact}`);
  }

  if (!allowedQueueOperationSecretsDisplayedStates.includes(summary.secretsDisplayed)) {
    throw new Error(`Unsupported queue operation secrets-displayed state: ${summary.secretsDisplayed}`);
  }
}

function assertWorkerCommand(command: QueueOperationWorkerCommand) {
  assertExactFields(command, queueOperationWorkerCommandFields, "Invalid queue operation worker command fields");
  assertNonblankString(command.command, "Invalid queue operation worker command");
  assertNonblankString(command.mode, `Invalid queue operation mode for ${command.command}`);
  assertNonblankString(command.boundary, `Invalid queue operation boundary for ${command.command}`);
  assertCleanCopy(command.command, `Whitespace-unsafe queue operation command ${command.command}`);
  assertCleanCopy(command.mode, `Whitespace-unsafe queue operation mode for ${command.command}`);
  assertCleanCopy(command.boundary, `Whitespace-unsafe queue operation boundary for ${command.command}`);
  assertNoSecretLikeMetadata(command.command, `Secret-like queue operation command ${command.command}`);
  assertNoSecretLikeMetadata(command.mode, `Secret-like queue operation mode for ${command.command}`);
  assertNoSecretLikeMetadata(command.boundary, `Secret-like queue operation boundary for ${command.command}`);

  if (!allowedQueueOperationWorkerCommands.includes(command.command as QueueOperationSupportedWorkerCommand)) {
    throw new Error(`Unsupported queue operation worker command ${command.command}`);
  }

  if (!allowedQueueOperationModes.includes(command.mode as (typeof allowedQueueOperationModes)[number])) {
    throw new Error(`Unsupported queue operation mode for ${command.command}`);
  }
}

function freezeWorkerCommands(commands: QueueOperationWorkerCommand[]) {
  for (const command of commands) {
    assertWorkerCommand(command);
  }

  assertUniqueValues(
    commands.map((command) => command.command),
    "Duplicate queue operation worker commands"
  );
  assertUniqueValues(
    commands.map((command) => command.mode),
    "Duplicate queue operation modes"
  );

  const joinedBoundaries = commands.map((command) => command.boundary).join(" ");
  const missingBoundaryTerms = requiredWorkerBoundaryTerms.filter((term) => !joinedBoundaries.includes(term));

  if (missingBoundaryTerms.length > 0) {
    throw new Error(`Missing queue operation worker boundary terms: ${missingBoundaryTerms.join(", ")}`);
  }

  return Object.freeze(
    commands.map((command) =>
      Object.freeze({
        command: command.command,
        mode: command.mode,
        boundary: command.boundary
      })
    )
  );
}

function freezeSafetyBoundaries(boundaries: string[]) {
  for (const boundary of boundaries) {
    assertNonblankString(boundary, "Invalid queue operation safety boundary");
    assertCleanCopy(boundary, "Whitespace-unsafe queue operation safety boundary");
    assertNoSecretLikeMetadata(boundary, "Secret-like queue operation safety boundary");
  }

  assertUniqueValues(boundaries, "Duplicate queue operation safety boundaries");

  const joinedBoundaries = boundaries.join(" ");
  const missingBoundaryTerms = requiredSafetyBoundaryTerms.filter((term) => !joinedBoundaries.includes(term));

  if (missingBoundaryTerms.length > 0) {
    throw new Error(`Missing queue operation safety boundary terms: ${missingBoundaryTerms.join(", ")}`);
  }

  return Object.freeze([...boundaries]);
}

export const queueOperationWorkerCommands = freezeWorkerCommands([
  {
    command: "npm run worker",
    mode: "database one-shot",
    boundary: "Processes due local QueueJob rows through the dummy provider only while live messaging remains blocked."
  },
  {
    command: "npm run worker:watch",
    mode: "database continuous",
    boundary: "Repeats local QueueJob polling with bounded loop controls and the same dummy live messaging gate."
  },
  {
    command: "npm run worker:bullmq",
    mode: "bullmq worker",
    boundary: "Consumes Redis-delivered references to durable local QueueJob rows through the dummy-only worker path."
  },
  {
    command: "npm run queue:bullmq:smoke",
    mode: "bullmq smoke",
    boundary: "Touches only a dedicated local Redis smoke queue and never scheduled campaign QueueJob rows."
  }
]);

export const queueOperationSafetyBoundaries = freezeSafetyBoundaries([
  "This view does not enqueue jobs, execute workers, call Redis, update campaign status, or mutate QueueJob rows.",
  "Queue review never calls providers, creates billing records, sends notifications, sends SMS, or enables live messaging.",
  "Worker execution remains an explicit local operator step with dummy-provider and live-disabled gates.",
  "BullMQ remains optional; Redis-backed acceleration cannot replace database idempotency or durable QueueJob records.",
  "Invalid payload visibility is read-only and does not repair, cancel, retry, or make mutations to queue records."
]);

export function getQueueOperationsStatus(): QueueOperationsStatus {
  assertStatusSummary(queueOperationStatusSummary);

  return Object.freeze({
    workerCommandCount: queueOperationWorkerCommands.length,
    safetyBoundaryCount: queueOperationSafetyBoundaries.length,
    commandExecution: queueOperationStatusSummary.commandExecution,
    externalImpact: queueOperationStatusSummary.externalImpact,
    secretsDisplayed: queueOperationStatusSummary.secretsDisplayed,
    workerCommands: freezeWorkerCommands(queueOperationWorkerCommands.map((command) => ({ ...command }))),
    safetyBoundaries: freezeSafetyBoundaries([...queueOperationSafetyBoundaries])
  });
}
