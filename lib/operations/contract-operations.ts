export type ContractOperationFile = {
  name: string;
  path: string;
  boundary: string;
};

export type ContractOperationValidationCheck = {
  command: string;
  purpose: string;
};

export type ContractOperationsStatus = {
  contractFileCount: number;
  validationCheckCount: number;
  driftControlCount: number;
  externalImpact: "none";
  contractFiles: readonly ContractOperationFile[];
  validationChecks: readonly ContractOperationValidationCheck[];
  driftControls: readonly string[];
};

const contractOperationFileFields = ["name", "path", "boundary"] as const;
const contractOperationValidationCheckFields = ["command", "purpose"] as const;
export const allowedContractOperationValidationCommands = Object.freeze([
  "npm run contracts:check",
  "npm run validate",
  "npm run test:e2e:demo",
  "npm run secrets:scan"
] as const);

export type ContractOperationSupportedValidationCommand = (typeof allowedContractOperationValidationCommands)[number];
const forbiddenSecretMetadataPatterns = [
  /\bsk_(?:live|test)_[A-Za-z0-9]+/,
  /\bpk_live_[A-Za-z0-9]+/,
  /\bAC[a-fA-F0-9]{32}\b/,
  /\b(?:TWILIO_AUTH_TOKEN|STRIPE_SECRET_KEY|OPENAI_API_KEY|CLERK_SECRET_KEY)\s*=/,
  /\bBearer\s+[A-Za-z0-9._-]{12,}/
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

function assertNoSecretLikeMetadata(value: string, errorMessage: string) {
  if (forbiddenSecretMetadataPatterns.some((pattern) => pattern.test(value))) {
    throw new Error(errorMessage);
  }
}

function assertCleanContractMetadata(value: string, errorMessage: string) {
  if (value !== value.trim() || value.includes("\n") || value.includes("\r") || value.includes("  ")) {
    throw new Error(errorMessage);
  }
}

function assertContractOperationFile(file: ContractOperationFile) {
  assertExactFields(file, contractOperationFileFields, "Invalid contract operation file fields");

  if (typeof file.name !== "string" || file.name.trim().length === 0) {
    throw new Error("Invalid contract operation file name");
  }
  assertCleanContractMetadata(file.name, `Whitespace-unsafe contract operation file name for ${file.path}`);
  assertNoSecretLikeMetadata(file.name, `Secret-like contract operation file name for ${file.path}`);

  if (
    typeof file.path !== "string" ||
    !file.path.startsWith("contracts/CONTRACT-") ||
    !file.path.endsWith(".md") ||
    file.path.includes("\\") ||
    file.path.includes("?") ||
    file.path.includes("#")
  ) {
    throw new Error(`Invalid contract operation file path ${String(file.path)}`);
  }
  assertCleanContractMetadata(file.path, `Whitespace-unsafe contract operation file path ${file.path}`);

  if (typeof file.boundary !== "string" || file.boundary.trim().length === 0) {
    throw new Error(`Invalid contract operation boundary for ${file.path}`);
  }
  assertCleanContractMetadata(file.boundary, `Whitespace-unsafe contract operation boundary for ${file.path}`);
  assertNoSecretLikeMetadata(file.boundary, `Secret-like contract operation boundary for ${file.path}`);
}

function assertValidationCheck(check: ContractOperationValidationCheck) {
  assertExactFields(check, contractOperationValidationCheckFields, "Invalid contract operation validation fields");

  if (typeof check.command !== "string" || !check.command.startsWith("npm run ")) {
    throw new Error(`Invalid contract operation validation command ${String(check.command)}`);
  }
  assertCleanContractMetadata(check.command, `Whitespace-unsafe contract operation validation command ${check.command}`);

  if (
    !allowedContractOperationValidationCommands.includes(
      check.command as ContractOperationSupportedValidationCommand
    )
  ) {
    throw new Error(`Unsupported contract operation validation command ${check.command}`);
  }

  if (typeof check.purpose !== "string" || check.purpose.trim().length === 0) {
    throw new Error(`Invalid contract operation validation purpose for ${check.command}`);
  }
  assertCleanContractMetadata(check.purpose, `Whitespace-unsafe contract operation validation purpose for ${check.command}`);
  assertNoSecretLikeMetadata(check.purpose, `Secret-like contract operation validation purpose for ${check.command}`);
}

function freezeContractOperationFiles(files: ContractOperationFile[]) {
  for (const file of files) {
    assertContractOperationFile(file);
  }

  assertUniqueValues(
    files.map((file) => file.name),
    "Duplicate contract operation file names"
  );
  assertUniqueValues(
    files.map((file) => file.path),
    "Duplicate contract operation file paths"
  );

  return Object.freeze(files.map((file) => Object.freeze({ name: file.name, path: file.path, boundary: file.boundary })));
}

function freezeValidationChecks(checks: ContractOperationValidationCheck[]) {
  for (const check of checks) {
    assertValidationCheck(check);
  }

  assertUniqueValues(
    checks.map((check) => check.command),
    "Duplicate contract operation validation commands"
  );

  return Object.freeze(checks.map((check) => Object.freeze({ command: check.command, purpose: check.purpose })));
}

function freezeDriftControls(controls: string[]) {
  for (const control of controls) {
    if (typeof control !== "string" || control.trim().length === 0) {
      throw new Error("Invalid contract operation drift control");
    }
    assertCleanContractMetadata(control, "Whitespace-unsafe contract operation drift control");
    assertNoSecretLikeMetadata(control, "Secret-like contract operation drift control");
  }

  assertUniqueValues(controls, "Duplicate contract operation drift controls");

  return Object.freeze([...controls]);
}

export const contractOperationFiles = freezeContractOperationFiles([
  {
    name: "Database",
    path: "contracts/CONTRACT-DB.md",
    boundary: "Tenant orgId invariants, schema ownership, and migration discipline."
  },
  {
    name: "API",
    path: "contracts/CONTRACT-API.md",
    boundary: "Route inventory, request/response contracts, and local-only mutation boundaries."
  },
  {
    name: "Webhooks",
    path: "contracts/CONTRACT-WEBHOOKS.md",
    boundary: "Twilio inbound/status persistence, signature validation, and idempotency rules."
  },
  {
    name: "Provider Adapter",
    path: "contracts/CONTRACT-PROVIDER-ADAPTER.md",
    boundary: "Dummy-provider defaults and Twilio-ready adapter behavior behind live gates."
  },
  {
    name: "AI",
    path: "contracts/CONTRACT-AI.md",
    boundary: "Deterministic fake AI behavior and live AI blocking expectations."
  },
  {
    name: "Billing",
    path: "contracts/CONTRACT-BILLING.md",
    boundary: "Local usage records, billing metadata, and no live Stripe charges."
  },
  {
    name: "Compliance",
    path: "contracts/CONTRACT-COMPLIANCE.md",
    boundary: "Consent, STOP/HELP behavior, A2P readiness, and hard gates."
  },
  {
    name: "Queue",
    path: "contracts/CONTRACT-QUEUE.md",
    boundary: "Scheduled jobs, idempotency keys, worker safety, and optional BullMQ mirroring."
  },
  {
    name: "Testing",
    path: "contracts/CONTRACT-TESTING.md",
    boundary: "Validation commands, seeded demo coverage, and regression gates."
  }
]);

export const contractOperationValidationChecks = freezeValidationChecks([
  {
    command: "npm run contracts:check",
    purpose: "Verifies required contract files and API map coverage remain present."
  },
  {
    command: "npm run validate",
    purpose: "Runs the local gate, including contract, compliance, safety, test, lint, typecheck, and build checks."
  },
  {
    command: "npm run test:e2e:demo",
    purpose: "Exercises the seeded investor demo path after local database migration and seed."
  },
  {
    command: "npm run secrets:scan",
    purpose: "Checks for secret-like values without displaying raw environment secrets."
  }
]);

export const contractOperationDriftControls = freezeDriftControls([
  "Product API routes must be documented in contracts and docs before or with implementation.",
  "Read-only settings pages must state the actions they do not perform.",
  "Live SMS, billing, notifications, provider calls, and live AI remain blocked by defaults.",
  "Tenant-scoped data access must preserve the orgId invariant and avoid cross-tenant reads.",
  "Seeded demo path coverage must expand when demo-visible operational routes are added."
]);

export function getContractOperationsStatus(): ContractOperationsStatus {
  return Object.freeze({
    contractFileCount: contractOperationFiles.length,
    validationCheckCount: contractOperationValidationChecks.length,
    driftControlCount: contractOperationDriftControls.length,
    externalImpact: "none",
    contractFiles: freezeContractOperationFiles(contractOperationFiles.map((file) => ({ ...file }))),
    validationChecks: freezeValidationChecks(contractOperationValidationChecks.map((check) => ({ ...check }))),
    driftControls: freezeDriftControls([...contractOperationDriftControls])
  });
}
