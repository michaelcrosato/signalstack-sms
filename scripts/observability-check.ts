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

console.log("Production observability plan verified.");
