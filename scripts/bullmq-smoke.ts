import { Queue } from "bullmq";
import { redisConnectionFromUrl } from "../lib/queue/redis";

const smokeQueueName = "signalstack-bullmq-smoke";

async function main() {
  if (process.env.QUEUE_BACKEND !== "bullmq") {
    console.log("BullMQ smoke skipped: QUEUE_BACKEND is not bullmq.");
    return;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log("BullMQ smoke skipped: REDIS_URL is not configured.");
    return;
  }

  const queue = new Queue(smokeQueueName, {
    connection: redisConnectionFromUrl(redisUrl)
  });
  const jobId = `signalstack-bullmq-smoke:${process.pid}:${Date.now()}`;

  try {
    const job = await queue.add(
      "smoke",
      {
        version: 1,
        purpose: "bullmq-connectivity-smoke"
      },
      {
        jobId,
        removeOnComplete: true,
        removeOnFail: true
      }
    );
    const storedJob = await queue.getJob(job.id ?? jobId);

    if (!storedJob || storedJob.data.purpose !== "bullmq-connectivity-smoke") {
      throw new Error("BullMQ smoke job was not readable after enqueue.");
    }

    await storedJob.remove();
    console.log(`BullMQ smoke passed against ${smokeQueueName}.`);
  } finally {
    await queue.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "BullMQ smoke failed.");
  process.exit(1);
});
