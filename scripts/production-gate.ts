import { evaluateProductionDeploymentGate } from "../src/lib/deployment/production-gate";

const result = evaluateProductionDeploymentGate(process.env);

if (!result.allowed) {
  console.error(`Production deployment gate blocked: ${result.blockers.join(", ")}`);
  process.exit(1);
}

console.log(
  result.productionLike
    ? "Production deployment gate passed with external-impact defaults blocked."
    : "Production deployment gate skipped for non-production environment."
);
