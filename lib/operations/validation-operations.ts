export type ValidationOperationGateCommand = {
  command: string;
  area: string;
  boundary: string;
};

export type ValidationOperationsStatus = {
  gateCommandCount: number;
  repairSignalCount: number;
  commandExecution: "none";
  externalImpact: "none";
  secretsDisplayed: false;
  gateCommands: readonly ValidationOperationGateCommand[];
  repairSignals: readonly string[];
};

const validationOperationGateCommandFields = ["command", "area", "boundary"] as const;
const allowedValidationOperationCommands = [
  "npm run validate",
  "npm run contracts:check",
  "npm run compliance:check",
  "npm run production:gate",
  "npm run observability:check",
  "npm run operator:check",
  "npm run platform:check",
  "npm run secrets:scan",
  "npm run test:e2e:demo"
] as const;
const allowedValidationOperationAreas = [
  "full local gate",
  "contracts",
  "safety defaults",
  "deployment",
  "observability",
  "runbook",
  "platform",
  "secrets",
  "investor demo"
] as const;
const requiredGateBoundaryTerms = ["local", "demo-safe", "blocked", "secrets"] as const;
const requiredRepairSignalTerms = [
  "does not execute commands",
  "DATABASE_URL",
  "Playwright",
  "Live provider",
  "live AI",
  "smallest failing command"
] as const;

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

function assertGateCommand(command: ValidationOperationGateCommand) {
  assertExactFields(command, validationOperationGateCommandFields, "Invalid validation operation gate command fields");

  if (typeof command.command !== "string" || !command.command.startsWith("npm run ")) {
    throw new Error(`Invalid validation operation command ${String(command.command)}`);
  }

  if (!allowedValidationOperationCommands.includes(command.command as (typeof allowedValidationOperationCommands)[number])) {
    throw new Error(`Unsupported validation operation command ${command.command}`);
  }

  if (typeof command.area !== "string" || command.area.trim().length === 0) {
    throw new Error(`Invalid validation operation area for ${command.command}`);
  }

  if (!allowedValidationOperationAreas.includes(command.area as (typeof allowedValidationOperationAreas)[number])) {
    throw new Error(`Unsupported validation operation area for ${command.command}`);
  }

  if (typeof command.boundary !== "string" || command.boundary.trim().length === 0) {
    throw new Error(`Invalid validation operation boundary for ${command.command}`);
  }
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
  return Object.freeze({
    gateCommandCount: validationOperationGateCommands.length,
    repairSignalCount: validationOperationRepairSignals.length,
    commandExecution: "none",
    externalImpact: "none",
    secretsDisplayed: false,
    gateCommands: freezeGateCommands(validationOperationGateCommands.map((command) => ({ ...command }))),
    repairSignals: freezeRepairSignals([...validationOperationRepairSignals])
  });
}
