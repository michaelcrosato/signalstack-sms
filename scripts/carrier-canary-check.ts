import { evaluateCarrierCanaryPolicy } from "../lib/operations/carrier-canary";

const result = evaluateCarrierCanaryPolicy(process.env);

if (!result.allowed) {
  console.error(`Carrier canary policy check failed: ${result.reason}`);
  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      console.warn(`- Warning: ${warning}`);
    }
  }
  process.exit(1);
}

console.log(`Carrier canary policy check passed: [Mode: ${result.mode}] ${result.reason}`);
