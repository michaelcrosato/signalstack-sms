import { QueueJobStatus, MessageAttemptStatus } from "@prisma/client";
import { withAuthDatabaseContext } from "@/lib/db/tenant-context";

export type WorkerHealthDiagnostics = {
  queueLatencyMs: number;
  throughputPerMinute: number;
  heartbeatStatus: "ACTIVE" | "DEGRADED" | "OFFLINE";
  heartbeatLastSeenAt: string | null;
  dbPoolState: {
    status: "HEALTHY" | "DEGRADED" | "DOWN";
    latencyMs: number;
  };
  failureMetrics: {
    totalFailed: number;
    failureRatePercentage: number;
    deadLetterCount: number;
  };
};

export async function getWorkerHealthDiagnostics(orgId?: string): Promise<WorkerHealthDiagnostics> {
  let dbLatency = 0;
  let dbStatus: "HEALTHY" | "DEGRADED" | "DOWN" = "HEALTHY";

  try {
    const pingStart = Date.now();
    await withAuthDatabaseContext({ purpose: "operator" }, async (client) => {
      await client.$queryRaw`SELECT 1`;
    });
    dbLatency = Date.now() - pingStart;
    if (dbLatency > 1000) {
      dbStatus = "DEGRADED";
    }
  } catch {
    dbStatus = "DOWN";
    dbLatency = -1;
  }

  if (dbStatus === "DOWN") {
    return Object.freeze({
      queueLatencyMs: -1,
      throughputPerMinute: 0,
      heartbeatStatus: "OFFLINE",
      heartbeatLastSeenAt: null,
      dbPoolState: Object.freeze({ status: "DOWN", latencyMs: -1 }),
      failureMetrics: Object.freeze({
        totalFailed: 0,
        failureRatePercentage: 0,
        deadLetterCount: 0
      })
    });
  }

  const now = new Date();
  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1_000);

  return withAuthDatabaseContext({ purpose: "operator" }, async (client) => {
    const orgWhereClause = orgId ? { orgId } : {};

    // 1. Queue Latency
    const recentJobs = await client.queueJob.findMany({
      where: {
        ...orgWhereClause,
        status: { in: [QueueJobStatus.COMPLETED, QueueJobStatus.PROCESSING, QueueJobStatus.FAILED] },
        updatedAt: { gte: fifteenMinutesAgo }
      },
      select: { runAt: true, updatedAt: true, createdAt: true },
      take: 50,
      orderBy: { updatedAt: "desc" }
    });

    let totalLatencyMs = 0;
    let latencyCount = 0;
    for (const job of recentJobs) {
      const diff = job.updatedAt.getTime() - job.runAt.getTime();
      if (diff >= 0) {
        totalLatencyMs += diff;
        latencyCount += 1;
      }
    }
    const queueLatencyMs = latencyCount > 0 ? Math.round(totalLatencyMs / latencyCount) : 0;

    // 2. Throughput
    const processedJobsCount = await client.queueJob.count({
      where: {
        ...orgWhereClause,
        status: QueueJobStatus.COMPLETED,
        updatedAt: { gte: fifteenMinutesAgo }
      }
    });
    const processedAttemptsCount = await client.messageAttempt.count({
      where: {
        ...orgWhereClause,
        status: MessageAttemptStatus.SUCCEEDED,
        createdAt: { gte: fifteenMinutesAgo }
      }
    });
    const totalProcessed = processedJobsCount + processedAttemptsCount;
    const throughputPerMinute = Math.round((totalProcessed / 15) * 100) / 100;

    // 3. Heartbeat Status
    const latestAttempt = await client.messageAttempt.findFirst({
      where: orgWhereClause,
      select: { createdAt: true },
      orderBy: { createdAt: "desc" }
    });
    const latestJob = await client.queueJob.findFirst({
      where: orgWhereClause,
      select: { updatedAt: true },
      orderBy: { updatedAt: "desc" }
    });

    let latestTimestamp: Date | null = null;
    if (latestAttempt?.createdAt && latestJob?.updatedAt) {
      latestTimestamp = latestAttempt.createdAt > latestJob.updatedAt ? latestAttempt.createdAt : latestJob.updatedAt;
    } else {
      latestTimestamp = latestAttempt?.createdAt ?? latestJob?.updatedAt ?? null;
    }

    let heartbeatStatus: "ACTIVE" | "DEGRADED" | "OFFLINE" = "OFFLINE";
    if (latestTimestamp) {
      const minutesSinceLastSeen = (now.getTime() - latestTimestamp.getTime()) / (60 * 1_000);
      if (minutesSinceLastSeen <= 10) {
        heartbeatStatus = "ACTIVE";
      } else if (minutesSinceLastSeen <= 60) {
        heartbeatStatus = "DEGRADED";
      }
    }

    // 4. Failure Metrics
    const failedJobsCount = await client.queueJob.count({
      where: {
        ...orgWhereClause,
        status: QueueJobStatus.FAILED,
        updatedAt: { gte: fifteenMinutesAgo }
      }
    });
    const failedAttemptsCount = await client.messageAttempt.count({
      where: {
        ...orgWhereClause,
        status: MessageAttemptStatus.FAILED,
        createdAt: { gte: fifteenMinutesAgo }
      }
    });
    const totalFailed = failedJobsCount + failedAttemptsCount;
    const totalAttempts = totalProcessed + totalFailed;
    const failureRatePercentage =
      totalAttempts > 0 ? Math.round((totalFailed / totalAttempts) * 10000) / 100 : 0;

    return Object.freeze({
      queueLatencyMs,
      throughputPerMinute,
      heartbeatStatus,
      heartbeatLastSeenAt: latestTimestamp?.toISOString() ?? null,
      dbPoolState: Object.freeze({
        status: dbStatus,
        latencyMs: dbLatency
      }),
      failureMetrics: Object.freeze({
        totalFailed,
        failureRatePercentage,
        deadLetterCount: failedJobsCount
      })
    });
  });
}
