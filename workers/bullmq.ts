import { applyDemoSafeRuntimeDefaults } from "@/lib/env/defaults";
import { startScheduledCampaignBullMqWorker } from "@/lib/queue/bullmq-worker";

applyDemoSafeRuntimeDefaults();

async function main() {
  const result = startScheduledCampaignBullMqWorker(process.env);
  if (!result.started) {
    console.log(`SignalStack SMS BullMQ worker blocked: ${result.reason}.`);
    return;
  }

  console.log("SignalStack SMS BullMQ worker started for scheduled campaign jobs.");

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
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
