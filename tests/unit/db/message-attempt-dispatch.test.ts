import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ withWorkerDispatchTransaction: vi.fn() }));
vi.mock("@/lib/db/tenant-context", () => ({
  withWorkerDispatchTransaction: mocks.withWorkerDispatchTransaction
}));

import {
  claimDueMessageAttempts,
  MESSAGE_ATTEMPT_PROCESSING_LEASE_MS,
  recoverExpiredMessageAttempts
} from "@/lib/db/message-attempt-dispatch";

describe("message attempt dispatch wrapper", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns bounded tenant identities with one opaque claim token", async () => {
    const query = vi.fn().mockResolvedValue([
      { attemptId: "attempt_1", orgId: "org_1" },
      { attemptId: "attempt_2", orgId: "org_2" }
    ]);
    mocks.withWorkerDispatchTransaction.mockImplementation((operation) => operation({ $queryRaw: query }));
    const now = new Date("2026-07-12T12:00:00.000Z");
    const token = "d9428888-122b-4f4e-8e77-9f6f8b2e9a11";
    const claims = await claimDueMessageAttempts(250, { processingToken: token, now: () => now });
    expect(claims).toEqual([
      {
        attemptId: "attempt_1",
        expectedOrgId: "org_1",
        processingToken: token,
        processingExpiresAt: new Date(now.getTime() + MESSAGE_ATTEMPT_PROCESSING_LEASE_MS)
      },
      {
        attemptId: "attempt_2",
        expectedOrgId: "org_2",
        processingToken: token,
        processingExpiresAt: new Date(now.getTime() + MESSAGE_ATTEMPT_PROCESSING_LEASE_MS)
      }
    ]);
  });

  it("returns recovered frontier ambiguities without claim authority", async () => {
    mocks.withWorkerDispatchTransaction.mockImplementation((operation) => operation({
      $queryRaw: vi.fn().mockResolvedValue([{ attemptId: "attempt_1", orgId: "org_1" }])
    }));
    await expect(recoverExpiredMessageAttempts(1)).resolves.toEqual([
      { attemptId: "attempt_1", expectedOrgId: "org_1" }
    ]);
  });

  it("rejects malformed, duplicate, excessive, and invalid-token evidence", async () => {
    for (const rows of [
      [{ attemptId: "", orgId: "org_1" }],
      [{ attemptId: "attempt_1", orgId: "org_1" }, { attemptId: "attempt_1", orgId: "org_1" }]
    ]) {
      mocks.withWorkerDispatchTransaction.mockImplementationOnce((operation) => operation({
        $queryRaw: vi.fn().mockResolvedValue(rows)
      }));
      await expect(claimDueMessageAttempts(2, {
        processingToken: "d9428888-122b-4f4e-8e77-9f6f8b2e9a11"
      })).rejects.toThrow("dispatch returned");
    }
    await expect(claimDueMessageAttempts(1, { processingToken: "not-a-token" }))
      .rejects.toThrow("token");
    await expect(claimDueMessageAttempts(Number.NaN)).rejects.toThrow("batch size");
  });
});
