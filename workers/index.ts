import {
  parseWorkerRuntimeOptions,
  processDueScheduledCampaignJobs,
  runContinuousScheduledCampaignWorker
} from "@/lib/queue/worker";
import { applyDemoSafeRuntimeDefaults } from "@/lib/env/defaults";

applyDemoSafeRuntimeDefaults();

function logResult(result: Awaited<ReturnType<typeof processDueScheduledCampaignJobs>>, prefix = "SignalStack SMS worker") {
  if (result.blocked) {
    console.log(`${prefix} blocked: only dummy provider with live messaging disabled is supported.`);
  } else {
    console.log(`${prefix} processed ${result.processed} scheduled campaign job(s), skipped ${result.skipped}.`);
  }
}

async function main() {
  const options = parseWorkerRuntimeOptions({ argv: process.argv.slice(2), env: process.env });

  if (options.mode === "once") {
    logResult(await processDueScheduledCampaignJobs());
    return;
  }

  let running = true;
  const stop = () => {
    running = false;
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.log(`SignalStack SMS worker polling every ${options.pollIntervalMs}ms.`);
  await runContinuousScheduledCampaignWorker({
    pollIntervalMs: options.pollIntervalMs,
    maxIterations: options.maxIterations,
    shouldContinue: () => running,
    onResult: (result, iteration) => logResult(result, `SignalStack SMS worker iteration ${iteration}`)
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
