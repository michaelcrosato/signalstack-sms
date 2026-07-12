import type { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimDueScheduledCampaignQueueJobs } from "@/lib/db/queue-dispatch";
import { QUEUE_JOB_PROCESSING_LEASE_MS } from "@/lib/queue/claim-lease";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  withWorkerDispatchTransaction: vi.fn()
}));

vi.mock("@/lib/db/tenant-context", () => ({
  withWorkerDispatchTransaction: mocks.withWorkerDispatchTransaction
}));

describe("worker queue dispatch capability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withWorkerDispatchTransaction.mockImplementation((callback) =>
      callback({ $queryRaw: mocks.queryRaw } as unknown as Prisma.TransactionClient)
    );
  });

  it("returns only authoritative tenant identities tied to the database claim token", async () => {
    const now = new Date("2026-07-10T12:00:00.000Z");
    mocks.queryRaw.mockResolvedValue([
      { id: "job_1", orgId: "org_1" },
      { id: "job_2", orgId: "org_2" }
    ]);

    const claims = await claimDueScheduledCampaignQueueJobs(now, 2);

    expect(claims).toHaveLength(2);
    expect(claims.map(({ queueJobId, expectedOrgId }) => ({ queueJobId, expectedOrgId }))).toEqual([
      { queueJobId: "job_1", expectedOrgId: "org_1" },
      { queueJobId: "job_2", expectedOrgId: "org_2" }
    ]);
    expect(claims[0].processingToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(claims[1].processingToken).toBe(claims[0].processingToken);
    expect(claims[0].processingExpiresAt).toEqual(
      new Date(now.getTime() + QUEUE_JOB_PROCESSING_LEASE_MS)
    );
    expect(Object.isFrozen(claims)).toBe(true);
    expect(Object.isFrozen(claims[0])).toBe(true);

    const [template, maxJobs, queryNow, leaseMs, processingToken] = mocks.queryRaw.mock.calls[0];
    expect(Array.from(template).join(" ")).toContain("public.claim_due_queue_jobs");
    expect(maxJobs).toBe(2);
    expect(queryNow).toBe(now);
    expect(leaseMs).toBe(QUEUE_JOB_PROCESSING_LEASE_MS);
    expect(processingToken).toBe(claims[0].processingToken);
  });

  it.each([
    [[{ id: "", orgId: "org_1" }], /invalid queue job identity/i],
    [[{ id: "job_1", orgId: "" }], /invalid queue job identity/i],
    [
      [
        { id: "job_1", orgId: "org_1" },
        { id: "job_1", orgId: "org_1" }
      ],
      /duplicate queue job identity/i
    ]
  ])("fails closed on malformed dispatch rows %#", async (rows, expectedError) => {
    mocks.queryRaw.mockResolvedValue(rows);

    await expect(
      claimDueScheduledCampaignQueueJobs(new Date("2026-07-10T12:00:00.000Z"), 10)
    ).rejects.toThrow(expectedError);
  });
});
