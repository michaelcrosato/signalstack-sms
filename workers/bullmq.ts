import { applyDemoSafeRuntimeDefaults } from "@/lib/env/defaults";
import { startScheduledCampaignBullMqWorker } from "@/lib/queue/bullmq-worker";
import { logger } from "@/lib/observability/logger";

applyDemoSafeRuntimeDefaults();

async function main() {
  const result = startScheduledCampaignBullMqWorker(process.env);
  if (!result.started) {
    logger.info(`SignalStack SMS BullMQ worker blocked: ${result.reason}.`);
    return;
  }

  logger.info("SignalStack SMS BullMQ worker started for scheduled campaign jobs.");

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
  logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
