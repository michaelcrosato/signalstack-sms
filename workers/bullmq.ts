import { applyDemoSafeRuntimeDefaults } from "@/lib/env/defaults";
import { logger } from "@/lib/observability/logger";
import { startScheduledCampaignBullMqWorker } from "@/lib/queue/bullmq-worker";

applyDemoSafeRuntimeDefaults();

async function main() {
  const result = startScheduledCampaignBullMqWorker(process.env);
  if (!result.started) {
    logger.warn("bullmq_worker_blocked", { reason: result.reason });
    return;
  }

  logger.info("bullmq_worker_started");

  await new Promise<void>((resolve) => {
    const stop = async () => {
      await result.worker.close();
      resolve();
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

main().catch((error: unknown) => {
  logger.error("bullmq_worker_fatal_error", { error: error instanceof Error ? error.message : error });
  process.exit(1);
});
