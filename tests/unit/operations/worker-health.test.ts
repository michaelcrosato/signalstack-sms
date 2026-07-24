import { describe, expect, it, vi, beforeEach } from "vitest";
import { getWorkerHealthDiagnostics } from "@/lib/operations/worker-health";
import { QueueJobStatus, MessageAttemptStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  withAuthDatabaseContext: vi.fn()
}));

vi.mock("@/lib/db/tenant-context", () => ({
  withAuthDatabaseContext: mocks.withAuthDatabaseContext
}));

describe("worker health diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles database downtime gracefully and returns DOWN fallback status", async () => {
    mocks.withAuthDatabaseContext.mockRejectedValue(new Error("DB Connection Refused"));

    const diagnostics = await getWorkerHealthDiagnostics();

    expect(diagnostics).toEqual({
      queueLatencyMs: -1,
      throughputPerMinute: 0,
      heartbeatStatus: "OFFLINE",
      heartbeatLastSeenAt: null,
      dbPoolState: { status: "DOWN", latencyMs: -1 },
      failureMetrics: {
        totalFailed: 0,
        failureRatePercentage: 0,
        deadLetterCount: 0
      }
    });
    expect(Object.isFrozen(diagnostics)).toBe(true);
  });

  it("calculates ACTIVE heartbeat and correct latency & throughput when recent activity exists", async () => {
    const now = new Date();
    const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const sixMinsAgo = new Date(now.getTime() - 6 * 60 * 1000);

    const mockClient = {
      $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
      queueJob: {
        findMany: vi.fn().mockResolvedValue([
          { runAt: sixMinsAgo, updatedAt: fiveMinsAgo, createdAt: sixMinsAgo },
          { runAt: sixMinsAgo, updatedAt: fiveMinsAgo, createdAt: sixMinsAgo }
        ]),
        count: vi.fn().mockImplementation((args) => {
          if (args?.where?.status === QueueJobStatus.COMPLETED) return Promise.resolve(10);
          if (args?.where?.status === QueueJobStatus.FAILED) return Promise.resolve(2);
          return Promise.resolve(0);
        }),
        findFirst: vi.fn().mockResolvedValue({ updatedAt: fiveMinsAgo })
      },
      messageAttempt: {
        count: vi.fn().mockImplementation((args) => {
          if (args?.where?.status === MessageAttemptStatus.SUCCEEDED) return Promise.resolve(5);
          if (args?.where?.status === MessageAttemptStatus.FAILED) return Promise.resolve(3);
          return Promise.resolve(0);
        }),
        findFirst: vi.fn().mockResolvedValue({ createdAt: fiveMinsAgo })
      }
    };

    mocks.withAuthDatabaseContext.mockImplementation(async (_opts, callback) => {
      return callback(mockClient);
    });

    const diagnostics = await getWorkerHealthDiagnostics("org-123");

    expect(diagnostics.heartbeatStatus).toBe("ACTIVE");
    expect(diagnostics.dbPoolState.status).toBe("HEALTHY");
    expect(diagnostics.queueLatencyMs).toBe(60000); // 1 minute in ms
    expect(diagnostics.throughputPerMinute).toBe(1); // (10 + 5) / 15 = 1.0
    expect(diagnostics.failureMetrics.totalFailed).toBe(5); // 2 + 3
    expect(diagnostics.failureMetrics.deadLetterCount).toBe(2);
    // total attempts = 15 + 5 = 20. failure rate = (5/20)*100 = 25%
    expect(diagnostics.failureMetrics.failureRatePercentage).toBe(25);
  });

  it("marks heartbeat as DEGRADED when last seen between 10 and 60 minutes ago", async () => {
    const now = new Date();
    const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);

    const mockClient = {
      $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
      queueJob: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue({ updatedAt: thirtyMinsAgo })
      },
      messageAttempt: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null)
      }
    };

    mocks.withAuthDatabaseContext.mockImplementation(async (_opts, callback) => {
      return callback(mockClient);
    });

    const diagnostics = await getWorkerHealthDiagnostics();

    expect(diagnostics.heartbeatStatus).toBe("DEGRADED");
    expect(diagnostics.heartbeatLastSeenAt).toBe(thirtyMinsAgo.toISOString());
    expect(diagnostics.queueLatencyMs).toBe(0);
    expect(diagnostics.throughputPerMinute).toBe(0);
  });
});
