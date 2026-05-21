export type SecurityOperationControl = {
  name: string;
  status: string;
  detail: string;
};

export type SecurityOperationValidationReference = {
  command: string;
  purpose: string;
};

export type SecurityOperationsStatus = {
  controlCount: number;
  validationReferenceCount: number;
  commandExecution: "none";
  externalImpact: "none";
  secretsDisplayed: false;
  controls: readonly SecurityOperationControl[];
  validationReferences: readonly SecurityOperationValidationReference[];
  safetyBoundaries: readonly string[];
};

const securityOperationControlFields = ["name", "status", "detail"] as const;
const securityOperationValidationReferenceFields = ["command", "purpose"] as const;
const allowedSecurityOperationControlStatuses = [
  "local metadata only",
  "blocked by default",
  "rate limited",
  "validation enforced"
] as const;
const requiredSafetyBoundaryTerms = ["secrets", "provider calls", "SMS", "email", "notifications", "mutations"] as const;

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

function assertNonblankString(value: unknown, errorMessage: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(errorMessage);
  }
}

function assertSecurityControl(control: SecurityOperationControl) {
  assertExactFields(control, securityOperationControlFields, "Invalid security operation control fields");
  assertNonblankString(control.name, "Invalid security operation control name");
  assertNonblankString(control.status, `Invalid security operation status for ${control.name}`);
  assertNonblankString(control.detail, `Invalid security operation detail for ${control.name}`);

  if (!allowedSecurityOperationControlStatuses.includes(control.status as (typeof allowedSecurityOperationControlStatuses)[number])) {
    throw new Error(`Unsupported security operation status for ${control.name}`);
  }
}

function assertValidationReference(reference: SecurityOperationValidationReference) {
  assertExactFields(reference, securityOperationValidationReferenceFields, "Invalid security operation validation fields");

  if (typeof reference.command !== "string" || !reference.command.startsWith("npm run ")) {
    throw new Error(`Invalid security operation validation command ${String(reference.command)}`);
  }

  assertNonblankString(reference.purpose, `Invalid security operation validation purpose for ${reference.command}`);
}

function freezeSecurityControls(controls: SecurityOperationControl[]) {
  for (const control of controls) {
    assertSecurityControl(control);
  }

  assertUniqueValues(
    controls.map((control) => control.name),
    "Duplicate security operation control names"
  );

  return Object.freeze(
    controls.map((control) =>
      Object.freeze({
        name: control.name,
        status: control.status,
        detail: control.detail
      })
    )
  );
}

function freezeValidationReferences(references: SecurityOperationValidationReference[]) {
  for (const reference of references) {
    assertValidationReference(reference);
  }

  assertUniqueValues(
    references.map((reference) => reference.command),
    "Duplicate security operation validation commands"
  );

  return Object.freeze(
    references.map((reference) =>
      Object.freeze({
        command: reference.command,
        purpose: reference.purpose
      })
    )
  );
}

function freezeSafetyBoundaries(boundaries: string[]) {
  for (const boundary of boundaries) {
    assertNonblankString(boundary, "Invalid security operation safety boundary");
  }

  assertUniqueValues(boundaries, "Duplicate security operation safety boundaries");

  const joinedBoundaries = boundaries.join(" ");
  const missingTerms = requiredSafetyBoundaryTerms.filter((term) => !joinedBoundaries.includes(term));

  if (missingTerms.length > 0) {
    throw new Error(`Missing security operation safety boundary terms: ${missingTerms.join(", ")}`);
  }

  return Object.freeze([...boundaries]);
}

export const securityOperationControls = freezeSecurityControls([
  {
    name: "Secret storage",
    status: "local metadata only",
    detail: "Provider credential screens store redacted metadata and token fingerprints only."
  },
  {
    name: "External impact",
    status: "blocked by default",
    detail: "Live SMS, billing, notifications, provider calls, and live AI remain disabled by demo-safe defaults."
  },
  {
    name: "API protection",
    status: "rate limited",
    detail: "Next middleware applies the local fixed-window policy to /api/:path*."
  },
  {
    name: "Production gate",
    status: "validation enforced",
    detail: "npm run validate includes the production deployment gate and blocks unsafe live-impact production-like settings."
  }
]);

export const securityOperationValidationReferences = freezeValidationReferences([
  {
    command: "npm run validate",
    purpose: "Runs the protected local gate, including production, compliance, secrets, test, lint, typecheck, and build checks."
  },
  {
    command: "npm run production:gate",
    purpose: "Blocks unsafe production-like live-impact configuration unless a future explicit override is present."
  },
  {
    command: "npm run secrets:scan",
    purpose: "Scans committed files for secret-like values without displaying raw local environment secrets."
  },
  {
    command: "npm run compliance:check",
    purpose: "Verifies demo-safe live messaging, billing, provider, and AI defaults remain blocked."
  }
]);

export const securityOperationSafetyBoundaries = freezeSafetyBoundaries([
  "This view does not read or display raw secrets, `.env.local`, provider tokens, or API keys.",
  "Secret scanning remains an explicit validation command through `npm run secrets:scan`.",
  "Production safety remains enforced through `npm run production:gate` inside `npm run validate`.",
  "No provider calls, live AI calls, Stripe calls, SMS, email, notifications, mutations, or live feature enablement occur here."
]);

export function getSecurityOperationsStatus(): SecurityOperationsStatus {
  return Object.freeze({
    controlCount: securityOperationControls.length,
    validationReferenceCount: securityOperationValidationReferences.length,
    commandExecution: "none",
    externalImpact: "none",
    secretsDisplayed: false,
    controls: freezeSecurityControls(securityOperationControls.map((control) => ({ ...control }))),
    validationReferences: freezeValidationReferences(securityOperationValidationReferences.map((reference) => ({ ...reference }))),
    safetyBoundaries: freezeSafetyBoundaries([...securityOperationSafetyBoundaries])
  });
}
