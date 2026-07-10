import { describe, bench } from "vitest";

describe("Worker blocked updates", () => {
  const job = { orgId: "org1" };

  const generateData = (numReasons: number, numIdsPerReason: number) => {
    const data = new Map<string, string[]>();
    for (let i = 0; i < numReasons; i++) {
      const reason = `REASON_${i}`;
      const ids: string[] = [];
      for (let j = 0; j < numIdsPerReason; j++) {
        ids.push(`id_${i}_${j}`);
      }
      data.set(reason, ids);
    }
    return data;
  };

  const data = generateData(10, 100);

  bench("baseline (for-loop with updateMany)", async () => {
    const mockPrisma = {
      campaignRecipient: {
        updateMany: async () => ({ count: 100 })
      }
    };

    const promises = [];
    for (const [reason, recipientIds] of data) {
      promises.push(mockPrisma.campaignRecipient.updateMany({
        where: { orgId: job.orgId, id: { in: recipientIds } },
        data: { status: "BLOCKED", blockReason: reason }
      }));
    }
    await Promise.all(promises);
  });

  bench("optimized (transaction)", async () => {
    const mockPrisma = {
      campaignRecipient: {
        updateMany: () => ({ count: 100 })
      },
      $transaction: async (queries: unknown[]) => queries.map((q) => (q as () => unknown)())
    };

    const updates = Array.from(data).map(([reason, recipientIds]) =>
      mockPrisma.campaignRecipient.updateMany({
        where: { orgId: job.orgId, id: { in: recipientIds } },
        data: { status: "BLOCKED", blockReason: reason }
      })
    );
    await mockPrisma.$transaction(updates);
  });
});
