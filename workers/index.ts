import {
  parseWorkerRuntimeOptions,
  processDueScheduledCampaignJobs,
  runContinuousScheduledCampaignWorker
} from "@/lib/queue/worker";
import { applyDemoSafeRuntimeDefaults } from "@/lib/env/defaults";
import { logger } from "@/lib/observability/logger";
import {
  processDueCustomerWebhookDeliveries,
  runContinuousCustomerWebhookWorker,
  type CustomerWebhookWorkerRunResult
} from "@/lib/integrations/customer-webhooks/worker";

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

function logWebhookResult(result: CustomerWebhookWorkerRunResult, prefix = "SignalStack customer webhook worker") {
  logger.info(
    `${prefix} claimed ${result.claimed}, delivered ${result.delivered}, retried ${result.retried}, failed ${result.failed}, skipped ${result.skipped}.`
  );
}

async function main() {
  const options = parseWorkerRuntimeOptions({ argv: process.argv.slice(2), env: process.env });

  if (options.mode === "once") {
    const [campaignResult, webhookResult] = await Promise.all([
      processDueScheduledCampaignJobs(new Date(), { maxJobsPerPoll: options.maxJobsPerPoll }),
      processDueCustomerWebhookDeliveries(options.maxJobsPerPoll)
    ]);
    logResult(campaignResult);
    logWebhookResult(webhookResult);
    return;
  }

  let running = true;
  const stop = () => {
    running = false;
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  logger.info(`SignalStack SMS worker polling every ${options.pollIntervalMs}ms with up to ${options.maxJobsPerPoll} job(s) per poll.`);
  await Promise.all([
    runContinuousScheduledCampaignWorker({
      pollIntervalMs: options.pollIntervalMs,
      maxJobsPerPoll: options.maxJobsPerPoll,
      maxIterations: options.maxIterations,
      shouldContinue: () => running,
      onResult: (result, iteration) => logResult(result, `SignalStack SMS worker iteration ${iteration}`)
    }),
    runContinuousCustomerWebhookWorker({
      pollIntervalMs: options.pollIntervalMs,
      maxDeliveriesPerPoll: options.maxJobsPerPoll,
      maxIterations: options.maxIterations,
      shouldContinue: () => running,
      onResult: (result, iteration) =>
        logWebhookResult(result, `SignalStack customer webhook worker iteration ${iteration}`)
    })
  ]);
}

main().catch((error: unknown) => {
  logger.error("signalstack_worker_fatal_error", {
    errorType: error instanceof Error ? error.name : "UnknownError"
  });
  process.exit(1);
});
