import { verifyOperationalDrills } from "../lib/operations/operational-drills";

const { allPassed, results } = verifyOperationalDrills();

console.log("=== End-to-End Operational Drills Verification ===");
for (const drill of results) {
  const symbol = drill.verified ? "✓" : "✗";
  console.log(`${symbol} [${drill.flow}] ${drill.title}`);
  console.log(`  ${drill.evidence}`);
}

if (!allPassed) {
  console.error("Operational drills verification failed: Some required flow artifacts are missing.");
  process.exit(1);
}

console.log("All 9 operational drill flows successfully verified.");
