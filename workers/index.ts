import {
  parseWorkerRuntimeOptions,
  processDueScheduledCampaignJobs,
  runContinuousScheduledCampaignWorker
} from "@/lib/queue/worker";
import { applyDemoSafeRuntimeDefaults } from "@/lib/env/defaults";
import { logger } from "@/lib/observability/logger";

applyDemoSafeRuntimeDefaults();

function logResult(result: Awaited<ReturnType<typeof processDueScheduledCampaignJobs>>, prefix = "SignalStack SMS worker") {
  if (result.blocked) {
    logger.warn(
      result.reason === "production-worker-blocked"
        ? `${prefix} blocked: worker execution is local/demo-only and disabled in production-like runtimes.`
        : `${prefix} blocked: only dummy provider with live messaging disabled is supported.`
    );
  } else {
    logger.info(`${prefix} processed ${result.processed} scheduled campaign job(s), skipped ${result.skipped}.`);
  }
}

async function main() {
  const options = parseWorkerRuntimeOptions({ argv: process.argv.slice(2), env: process.env });

  if (options.mode === "once") {
    logResult(await processDueScheduledCampaignJobs(new Date(), { maxJobsPerPoll: options.maxJobsPerPoll }));
    return;
  }

  let running = true;
  const stop = () => {
    running = false;
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  logger.info(`SignalStack SMS worker polling every ${options.pollIntervalMs}ms with up to ${options.maxJobsPerPoll} job(s) per poll.`);
  await runContinuousScheduledCampaignWorker({
    pollIntervalMs: options.pollIntervalMs,
    maxJobsPerPoll: options.maxJobsPerPoll,
    maxIterations: options.maxIterations,
    shouldContinue: () => running,
    onResult: (result, iteration) => logResult(result, `SignalStack SMS worker iteration ${iteration}`)
  });
}

main().catch((error: unknown) => {
  logger.error("scheduled_campaign_worker_fatal_error", {
    errorType: error instanceof Error ? error.name : "UnknownError"
  });
  process.exit(1);
});
