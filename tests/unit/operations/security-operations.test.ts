import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  allowedSecurityOperationCommandExecutionStates,
  allowedSecurityOperationControlStatuses,
  allowedSecurityOperationExternalImpactStates,
  allowedSecurityOperationSecretsDisplayedStates,
  getSecurityOperationsStatus,
  securityOperationControls,
  securityOperationSafetyBoundaries,
  securityOperationValidationReferences
} from "@/lib/operations/security-operations";

const publicControlFields = ["name", "status", "detail"];
const publicValidationReferenceFields = ["command", "purpose"];
const publicStatusFields = [
  "controlCount",
  "validationReferenceCount",
  "commandExecution",
  "externalImpact",
  "secretsDisplayed",
  "controls",
  "validationReferences",
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

describe("getSecurityOperationsStatus", () => {
  it("reports required security control inventory and read-only counts", () => {
    const status = getSecurityOperationsStatus();

    expect(status.controlCount).toBe(4);
    expect(status.validationReferenceCount).toBe(4);
    expect(status.commandExecution).toBe("none");
    expect(status.externalImpact).toBe("none");
    expect(status.secretsDisplayed).toBe(false);
    expect(status.controls.map((control) => control.name)).toEqual([
      "Secret storage",
      "External impact",
      "API protection",
      "Production gate"
    ]);
    expect(status.validationReferences.map((reference) => reference.command)).toEqual([
      "npm run validate",
      "npm run production:gate",
      "npm run secrets:scan",
      "npm run compliance:check"
    ]);
  });

  it("exposes only public security operations fields", () => {
    const status = getSecurityOperationsStatus();
    const expectedControlFields = [...publicControlFields].sort();
    const expectedReferenceFields = [...publicValidationReferenceFields].sort();

    expect(sortedFields(status)).toEqual([...publicStatusFields].sort());
    expect(securityOperationControls.every((control) => sortedFields(control).join("|") === expectedControlFields.join("|"))).toBe(true);
    expect(status.controls.every((control) => sortedFields(control).join("|") === expectedControlFields.join("|"))).toBe(true);
    expect(
      securityOperationValidationReferences.every(
        (reference) => sortedFields(reference).join("|") === expectedReferenceFields.join("|")
      )
    ).toBe(true);
    expect(status.validationReferences.every((reference) => sortedFields(reference).join("|") === expectedReferenceFields.join("|"))).toBe(true);
  });

  it("keeps exported and per-call security operations snapshots frozen", () => {
    const firstStatus = getSecurityOperationsStatus();
    const secondStatus = getSecurityOperationsStatus();
    const firstControl = firstStatus.controls[0];

    expect(Object.isFrozen(securityOperationControls)).toBe(true);
    expect(securityOperationControls.every((control) => Object.isFrozen(control))).toBe(true);
    expect(Object.isFrozen(securityOperationValidationReferences)).toBe(true);
    expect(securityOperationValidationReferences.every((reference) => Object.isFrozen(reference))).toBe(true);
    expect(Object.isFrozen(securityOperationSafetyBoundaries)).toBe(true);
    expect(Object.isFrozen(firstStatus)).toBe(true);
    expect(Object.isFrozen(firstStatus.controls)).toBe(true);
    expect(Object.isFrozen(firstStatus.validationReferences)).toBe(true);
    expect(Object.isFrozen(firstStatus.safetyBoundaries)).toBe(true);
    expect(firstStatus.controls).not.toBe(secondStatus.controls);
    expect(firstStatus.validationReferences).not.toBe(secondStatus.validationReferences);
    expect(firstStatus.safetyBoundaries).not.toBe(secondStatus.safetyBoundaries);
    expect(firstStatus.controls[0]).not.toBe(securityOperationControls[0]);
    expect(() => (firstStatus.controls as unknown as Array<(typeof securityOperationControls)[number]>).pop()).toThrow(TypeError);
    expect(() => ((firstControl as { status: string }).status = "unsafe")).toThrow(TypeError);
    expect(getSecurityOperationsStatus().controls[0].status).toBe(securityOperationControls[0].status);
  });

  it("keeps security operation metadata in canonical local-only shape", () => {
    expect(securityOperationControls.map((control) => control.name).filter((name) => name.trim().length === 0)).toEqual([]);
    expect(securityOperationControls.map((control) => control.status).filter((status) => status.trim().length === 0)).toEqual([]);
    expect(securityOperationControls.map((control) => control.detail).filter((detail) => detail.trim().length === 0)).toEqual([]);
    expect(securityOperationValidationReferences.map((reference) => reference.command).filter((command) => !command.startsWith("npm run "))).toEqual([]);
    expect(securityOperationValidationReferences.map((reference) => reference.purpose).filter((purpose) => purpose.trim().length === 0)).toEqual([]);
    expect(securityOperationSafetyBoundaries.filter((boundary) => boundary.trim().length === 0)).toEqual([]);
  });

  it("keeps security operation static metadata whitespace-clean", () => {
    const staticCopy = [
      ...securityOperationControls.flatMap((control) => [control.name, control.status, control.detail]),
      ...securityOperationValidationReferences.flatMap((reference) => [reference.command, reference.purpose]),
      ...securityOperationSafetyBoundaries
    ];

    expect(staticCopy.filter((copy) => copy !== copy.trim())).toEqual([]);
    expect(staticCopy.filter((copy) => copy.includes("\n") || copy.includes("\r"))).toEqual([]);
    expect(staticCopy.filter((copy) => copy.includes("  "))).toEqual([]);
  });

  it("keeps security operation values inside documented local-only boundaries", () => {
    expect(allowedSecurityOperationControlStatuses).toEqual([
      "local metadata only",
      "blocked by default",
      "rate limited",
      "validation enforced"
    ]);
    expect(Object.isFrozen(allowedSecurityOperationControlStatuses)).toBe(true);
    expect(securityOperationControls.map((control) => control.status)).toEqual([
      "local metadata only",
      "blocked by default",
      "rate limited",
      "validation enforced"
    ]);
    expect(securityOperationSafetyBoundaries.join(" ")).toContain("secrets");
    expect(securityOperationSafetyBoundaries.join(" ")).toContain("provider calls");
    expect(securityOperationSafetyBoundaries.join(" ")).toContain("SMS");
    expect(securityOperationSafetyBoundaries.join(" ")).toContain("email");
    expect(securityOperationSafetyBoundaries.join(" ")).toContain("notifications");
    expect(securityOperationSafetyBoundaries.join(" ")).toContain("mutations");
  });

  it("keeps security operation summary states inside the no-impact vocabulary", () => {
    const status = getSecurityOperationsStatus();

    expect(allowedSecurityOperationCommandExecutionStates).toEqual(["none"]);
    expect(allowedSecurityOperationExternalImpactStates).toEqual(["none"]);
    expect(allowedSecurityOperationSecretsDisplayedStates).toEqual([false]);
    expect(Object.isFrozen(allowedSecurityOperationCommandExecutionStates)).toBe(true);
    expect(Object.isFrozen(allowedSecurityOperationExternalImpactStates)).toBe(true);
    expect(Object.isFrozen(allowedSecurityOperationSecretsDisplayedStates)).toBe(true);
    expect(allowedSecurityOperationCommandExecutionStates).toContain(status.commandExecution);
    expect(allowedSecurityOperationExternalImpactStates).toContain(status.externalImpact);
    expect(allowedSecurityOperationSecretsDisplayedStates).toContain(status.secretsDisplayed);
  });

  it("keeps security operation validation references inside the supported command allowlist", () => {
    expect(securityOperationValidationReferences.map((reference) => reference.command)).toEqual([
      "npm run validate",
      "npm run production:gate",
      "npm run secrets:scan",
      "npm run compliance:check"
    ]);
  });

  it("keeps security operation inventory order stable for local review pages", () => {
    expect(securityOperationControls.map((control) => control.name)).toEqual([
      "Secret storage",
      "External impact",
      "API protection",
      "Production gate"
    ]);
    expect(securityOperationValidationReferences.map((reference) => reference.command)).toEqual([
      "npm run validate",
      "npm run production:gate",
      "npm run secrets:scan",
      "npm run compliance:check"
    ]);
    expect(securityOperationSafetyBoundaries).toEqual([
      "This view does not read or display raw secrets, `.env.local`, provider tokens, or API keys.",
      "Secret scanning remains an explicit validation command through `npm run secrets:scan`.",
      "Production safety remains enforced through `npm run production:gate` inside `npm run validate`.",
      "No provider calls, live AI calls, Stripe calls, SMS, email, notifications, mutations, or live feature enablement occur here."
    ]);
  });

  it("keeps security operation identifiers unique before local review pages render them", () => {
    const controlNames = securityOperationControls.map((control) => control.name);
    const validationCommands = securityOperationValidationReferences.map((reference) => reference.command);

    expect(new Set(controlNames).size).toBe(controlNames.length);
    expect(new Set(validationCommands).size).toBe(validationCommands.length);
    expect(new Set(securityOperationSafetyBoundaries).size).toBe(securityOperationSafetyBoundaries.length);
  });

  it("keeps security operation validation command references backed by package scripts", () => {
    const scripts = packageScripts();
    const missingScripts = securityOperationValidationReferences
      .map((reference) => reference.command.replace("npm run ", ""))
      .filter((scriptName) => !Object.prototype.hasOwnProperty.call(scripts, scriptName));

    expect(missingScripts).toEqual([]);
  });

  it("keeps security operation static metadata free of secret-like literals", () => {
    const staticCopy = [
      ...securityOperationControls.flatMap((control) => [control.name, control.status, control.detail]),
      ...securityOperationValidationReferences.flatMap((reference) => [reference.command, reference.purpose]),
      ...securityOperationSafetyBoundaries
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
