import { readFileSync } from "node:fs";

const observabilityPlan = readFileSync("docs/PRODUCTION_OBSERVABILITY.md", "utf8");
const deploymentRunbook = readFileSync("docs/PRODUCTION_DEPLOYMENT.md", "utf8");

const requiredPlanText = [
  "demo-safe production-like deployments only",
  "/api/health",
  "npm run production:gate",
  "/api/settings/readiness-audit/export",
  "must not include raw message bodies, auth tokens, provider fingerprints, Stripe identifiers, or customer secrets",
  "vendor export is disabled by default"
];

const missingPlanText = requiredPlanText.filter((text) => !observabilityPlan.includes(text));

if (missingPlanText.length > 0) {
  console.error(`Production observability plan is missing required safety text: ${missingPlanText.join("; ")}`);
  process.exit(1);
}

if (!deploymentRunbook.includes("docs/PRODUCTION_OBSERVABILITY.md")) {
  console.error("Production deployment runbook must link to docs/PRODUCTION_OBSERVABILITY.md.");
  process.exit(1);
}

// SPEC-006: the instrumentation seam must be off by default and the logger must redact PII.
const instrumentation = readFileSync("instrumentation.ts", "utf8");
const observabilityLogger = readFileSync("lib/observability/logger.ts", "utf8");
const observabilityCodeFailures: string[] = [];

if (!instrumentation.includes("observabilityIsEnabled")) {
  observabilityCodeFailures.push("instrumentation.ts must gate initialization on observabilityIsEnabled (default off)");
}
if (!observabilityLogger.includes('OBSERVABILITY_ENABLED === "true"')) {
  observabilityCodeFailures.push('logger must treat OBSERVABILITY_ENABLED as opt-in (=== "true")');
}
for (const sensitiveKey of ['"phone"', '"body"', '"authToken"']) {
  if (!observabilityLogger.includes(sensitiveKey)) {
    observabilityCodeFailures.push(`logger redaction denylist must cover ${sensitiveKey}`);
  }
}

if (observabilityCodeFailures.length > 0) {
  console.error(`Observability instrumentation check failed: ${observabilityCodeFailures.join("; ")}`);
  process.exit(1);
}

console.log("Production observability plan verified.");
