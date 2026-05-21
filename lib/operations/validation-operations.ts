export type ValidationOperationGateCommand = {
  command: string;
  area: string;
  boundary: string;
};

export type ValidationOperationsStatus = {
  gateCommandCount: number;
  repairSignalCount: number;
  commandExecution: ValidationOperationCommandExecutionState;
  externalImpact: ValidationOperationExternalImpactState;
  mutation: ValidationOperationMutationState;
  secretsDisplayed: ValidationOperationSecretsDisplayedState;
  gateCommands: readonly ValidationOperationGateCommand[];
  repairSignals: readonly string[];
};

export const allowedValidationOperationGateCommands = Object.freeze([
  "npm run validate",
  "npm run contracts:check",
  "npm run compliance:check",
  "npm run production:gate",
  "npm run observability:check",
  "npm run operator:check",
  "npm run platform:check",
  "npm run secrets:scan",
  "npm run test:e2e:demo"
] as const);
export const allowedValidationOperationCommandExecutionStates = Object.freeze(["none"] as const);
export const allowedValidationOperationExternalImpactStates = Object.freeze(["none"] as const);
export const allowedValidationOperationMutationStates = Object.freeze(["none"] as const);
export const allowedValidationOperationSecretsDisplayedStates = Object.freeze([false] as const);
export const allowedValidationOperationAreas = Object.freeze([
  "full local gate",
  "contracts",
  "safety defaults",
  "deployment",
  "observability",
  "runbook",
  "platform",
  "secrets",
  "investor demo"
] as const);

export type ValidationOperationSupportedGateCommand = (typeof allowedValidationOperationGateCommands)[number];
export type ValidationOperationCommandExecutionState = (typeof allowedValidationOperationCommandExecutionStates)[number];
export type ValidationOperationExternalImpactState = (typeof allowedValidationOperationExternalImpactStates)[number];
export type ValidationOperationMutationState = (typeof allowedValidationOperationMutationStates)[number];
export type ValidationOperationSecretsDisplayedState = (typeof allowedValidationOperationSecretsDisplayedStates)[number];
export type ValidationOperationArea = (typeof allowedValidationOperationAreas)[number];

const validationOperationGateCommandFields = ["command", "area", "boundary"] as const;
const requiredGateBoundaryTerms = ["local", "demo-safe", "blocked", "secrets"] as const;
const requiredRepairSignalTerms = [
  "does not execute commands",
  "DATABASE_URL",
  "Playwright",
  "Live provider",
  "live AI",
  "smallest failing command"
] as const;
const forbiddenSecretMetadataPatterns = [
  /\bsk_(?:live|test)_[A-Za-z0-9]+/,
  /\bpk_live_[A-Za-z0-9]+/,
  /\bAC[a-fA-F0-9]{32}\b/,
  /\b(?:TWILIO_AUTH_TOKEN|STRIPE_SECRET_KEY|OPENAI_API_KEY|CLERK_SECRET_KEY)\s*=/,
  /\bBearer\s+[A-Za-z0-9._-]{12,}/
] as const;
const forbiddenCommandMetadataPatterns = [
  /\bnpm\s+run\b/i,
  /\bnpx\b/i,
  /\bpowershell\b/i,
  /\bcurl\b/i,
  /\bInvoke-WebRequest\b/i
] as const;

const validationOperationStatusSummary = Object.freeze({
  commandExecution: "none",
  externalImpact: "none",
  mutation: "none",
  secretsDisplayed: false
} satisfies Pick<ValidationOperationsStatus, "commandExecution" | "externalImpact" | "mutation" | "secretsDisplayed">);

function assertExactFields<T extends object>(value: T, fields: readonly string[], errorMessage: string) {
  const actualKeys = Reflect.ownKeys(value);

  if (actualKeys.length !== fields.length || actualKeys.some((key) => !fields.includes(String(key)))) {
    throw new Error(errorMessage);
  }
}

function assertUniqueValues(values: readonly string[], errorMessage: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(errorMessage);
  }
}

function assertNoSecretLikeMetadata(value: string, errorMessage: string) {
  if (forbiddenSecretMetadataPatterns.some((pattern) => pattern.test(value))) {
    throw new Error(errorMessage);
  }
}

function assertNoCommandLikeMetadata(value: string, errorMessage: string) {
  if (forbiddenCommandMetadataPatterns.some((pattern) => pattern.test(value))) {
    throw new Error(errorMessage);
  }
}

function assertCleanValidationMetadata(value: string, errorMessage: string) {
  if (value !== value.trim() || value.includes("\n") || value.includes("\r") || value.includes("  ")) {
    throw new Error(errorMessage);
  }
}

function assertStatusSummary(
  summary: Pick<ValidationOperationsStatus, "commandExecution" | "externalImpact" | "mutation" | "secretsDisplayed">
) {
  if (!allowedValidationOperationCommandExecutionStates.includes(summary.commandExecution)) {
    throw new Error(`Unsupported validation operation command execution state: ${summary.commandExecution}`);
  }

  if (!allowedValidationOperationExternalImpactStates.includes(summary.externalImpact)) {
    throw new Error(`Unsupported validation operation external impact state: ${summary.externalImpact}`);
  }

  if (!allowedValidationOperationMutationStates.includes(summary.mutation)) {
    throw new Error(`Unsupported validation operation mutation state: ${summary.mutation}`);
  }

  if (!allowedValidationOperationSecretsDisplayedStates.includes(summary.secretsDisplayed)) {
    throw new Error(`Unsupported validation operation secrets-displayed state: ${summary.secretsDisplayed}`);
  }
}

function assertGateCommand(command: ValidationOperationGateCommand) {
  assertExactFields(command, validationOperationGateCommandFields, "Invalid validation operation gate command fields");

  if (typeof command.command !== "string" || !command.command.startsWith("npm run ")) {
    throw new Error(`Invalid validation operation command ${String(command.command)}`);
  }
  assertCleanValidationMetadata(command.command, `Whitespace-unsafe validation operation command ${command.command}`);

  if (!allowedValidationOperationGateCommands.includes(command.command as ValidationOperationSupportedGateCommand)) {
    throw new Error(`Unsupported validation operation command ${command.command}`);
  }

  if (typeof command.area !== "string" || command.area.trim().length === 0) {
    throw new Error(`Invalid validation operation area for ${command.command}`);
  }
  assertCleanValidationMetadata(command.area, `Whitespace-unsafe validation operation area for ${command.command}`);

  if (!allowedValidationOperationAreas.includes(command.area as ValidationOperationArea)) {
    throw new Error(`Unsupported validation operation area for ${command.command}`);
  }
  assertNoSecretLikeMetadata(command.area, `Secret-like validation operation area for ${command.command}`);
  assertNoCommandLikeMetadata(command.area, `Command-like validation operation area for ${command.command}`);

  if (typeof command.boundary !== "string" || command.boundary.trim().length === 0) {
    throw new Error(`Invalid validation operation boundary for ${command.command}`);
  }
  assertCleanValidationMetadata(command.boundary, `Whitespace-unsafe validation operation boundary for ${command.command}`);
  assertNoSecretLikeMetadata(command.boundary, `Secret-like validation operation boundary for ${command.command}`);
  assertNoCommandLikeMetadata(command.boundary, `Command-like validation operation boundary for ${command.command}`);
}

function freezeGateCommands(commands: ValidationOperationGateCommand[]) {
  for (const command of commands) {
    assertGateCommand(command);
  }

  assertUniqueValues(
    commands.map((command) => command.command),
    "Duplicate validation operation commands"
  );
  assertUniqueValues(
    commands.map((command) => command.area),
    "Duplicate validation operation areas"
  );

  const joinedBoundaries = commands.map((command) => command.boundary).join(" ");
  const missingBoundaryTerms = requiredGateBoundaryTerms.filter((term) => !joinedBoundaries.includes(term));

  if (missingBoundaryTerms.length > 0) {
    throw new Error(`Missing validation operation gate boundary terms: ${missingBoundaryTerms.join(", ")}`);
  }

  return Object.freeze(
    commands.map((command) =>
      Object.freeze({ command: command.command, area: command.area, boundary: command.boundary })
    )
  );
}

function freezeRepairSignals(signals: string[]) {
  for (const signal of signals) {
    if (typeof signal !== "string" || signal.trim().length === 0) {
      throw new Error("Invalid validation operation repair signal");
    }
    assertCleanValidationMetadata(signal, "Whitespace-unsafe validation operation repair signal");
    assertNoSecretLikeMetadata(signal, "Secret-like validation operation repair signal");
    assertNoCommandLikeMetadata(signal, "Command-like validation operation repair signal");
  }

  assertUniqueValues(signals, "Duplicate validation operation repair signals");

  const joinedSignals = signals.join(" ");
  const missingSignalTerms = requiredRepairSignalTerms.filter((term) => !joinedSignals.includes(term));

  if (missingSignalTerms.length > 0) {
    throw new Error(`Missing validation operation repair signal terms: ${missingSignalTerms.join(", ")}`);
  }

  return Object.freeze([...signals]);
}

export const validationOperationGateCommands = freezeGateCommands([
  {
    command: "npm run validate",
    area: "full local gate",
    boundary: "Runs local checks only and must keep demo-safe defaults."
  },
  {
    command: "npm run contracts:check",
    area: "contracts",
    boundary: "Checks required docs/contracts and API map coverage."
  },
  {
    command: "npm run compliance:check",
    area: "safety defaults",
    boundary: "Verifies live messaging, billing, provider, and AI defaults stay blocked."
  },
  {
    command: "npm run production:gate",
    area: "deployment",
    boundary: "Blocks unsafe production-like live-impact configuration without explicit future override."
  },
  {
    command: "npm run observability:check",
    area: "observability",
    boundary: "Verifies demo-safe observability planning docs exist."
  },
  {
    command: "npm run operator:check",
    area: "runbook",
    boundary: "Verifies the local operator runbook remains present and demo-safe."
  },
  {
    command: "npm run platform:check",
    area: "platform",
    boundary: "Verifies demo-safe deployment platform notes exist."
  },
  {
    command: "npm run secrets:scan",
    area: "secrets",
    boundary: "Scans committed files for secret-like values without displaying local env secrets."
  },
  {
    command: "npm run test:e2e:demo",
    area: "investor demo",
    boundary: "Exercises the seeded demo path after explicit local database migration and seeding."
  }
]);

export const validationOperationRepairSignals = freezeRepairSignals([
  "The page does not execute commands or inspect process output.",
  "Database migration and demo seed still require an explicit local DATABASE_URL command.",
  "Playwright coverage should expand when demo-visible admin pages are added.",
  "Live provider, live billing, notification, and live AI settings must stay blocked in validation.",
  "Failures should be repaired by rerunning the smallest failing command before the full gate."
]);

export function getValidationOperationsStatus(): ValidationOperationsStatus {
  assertStatusSummary(validationOperationStatusSummary);

  return Object.freeze({
    gateCommandCount: validationOperationGateCommands.length,
    repairSignalCount: validationOperationRepairSignals.length,
    commandExecution: validationOperationStatusSummary.commandExecution,
    externalImpact: validationOperationStatusSummary.externalImpact,
    mutation: validationOperationStatusSummary.mutation,
    secretsDisplayed: validationOperationStatusSummary.secretsDisplayed,
    gateCommands: freezeGateCommands(validationOperationGateCommands.map((command) => ({ ...command }))),
    repairSignals: freezeRepairSignals([...validationOperationRepairSignals])
  });
}
