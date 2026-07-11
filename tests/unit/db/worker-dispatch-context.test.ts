import { beforeEach, describe, expect, it, vi } from "vitest";
import { withWorkerDispatchTransaction } from "@/lib/db/tenant-context";

const mocks = vi.hoisted(() => ({
  assertRuntimeDatabasePosture: vi.fn(),
  transaction: vi.fn(),
  baseQueryRaw: vi.fn(),
  executeRawUnsafe: vi.fn(),
  transactionQueryRaw: vi.fn()
}));

vi.mock("@/lib/db/runtime-posture", () => ({
  assertRuntimeDatabasePosture: mocks.assertRuntimeDatabasePosture,
  inspectRuntimeDatabasePostureForClient: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    $queryRaw: mocks.baseQueryRaw
  }
}));

describe("worker dispatch database context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertRuntimeDatabasePosture.mockResolvedValue(undefined);
    mocks.executeRawUnsafe.mockResolvedValue(0);
    mocks.transactionQueryRaw.mockResolvedValue([]);
    mocks.transaction.mockImplementation((callback) => callback({
      $executeRawUnsafe: mocks.executeRawUnsafe,
      $queryRaw: mocks.transactionQueryRaw
    }));
  });

  it("selects the fixed NOINHERIT worker role and clears every request context setting", async () => {
    const operation = vi.fn().mockResolvedValue("claimed");

    await expect(withWorkerDispatchTransaction(operation)).resolves.toBe("claimed");

    expect(mocks.assertRuntimeDatabasePosture).toHaveBeenCalledTimes(1);
    expect(mocks.executeRawUnsafe).toHaveBeenCalledWith("SET LOCAL ROLE signalstack_worker");
    const [template, ...values] = mocks.transactionQueryRaw.mock.calls[0];
    const statement = Array.from(template).join(" ");
    expect(statement).toContain("app.current_org_id");
    expect(statement).toContain("app.current_org_slug");
    expect(statement).toContain("app.current_user_id");
    expect(statement).toContain("app.current_session_hash");
    expect(statement).toContain("app.current_token_hash");
    expect(statement).toContain("app.current_login_email");
    expect(statement).toContain("app.control_purpose");
    expect(values).toEqual(["", "", "", "", "", "", ""]);
    expect(mocks.executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.transactionQueryRaw.mock.invocationCallOrder[0]
    );
    expect(mocks.transactionQueryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      operation.mock.invocationCallOrder[0]
    );
  });
});
