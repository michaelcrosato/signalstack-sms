import { describe, expect, it } from "vitest";
import { campaignMessageValues, localWorkerProviderIsAllowed, parseWorkerRuntimeOptions } from "@/lib/queue/worker";

describe("local queue worker", () => {
  it("only allows dummy provider processing while live messaging is disabled", () => {
    expect(localWorkerProviderIsAllowed({ liveMessagingEnabled: "false", messagingProvider: "dummy" })).toBe(true);
    expect(localWorkerProviderIsAllowed({ liveMessagingEnabled: "true", messagingProvider: "dummy" })).toBe(false);
    expect(localWorkerProviderIsAllowed({ liveMessagingEnabled: "false", messagingProvider: "twilio" })).toBe(false);
  });

  it("builds campaign template values without leaking nulls", () => {
    expect(
      campaignMessageValues({
        phone: "+15555550100",
        email: null,
        firstName: "Ada",
        lastName: null,
        displayName: null
      })
    ).toEqual({
      phone: "+15555550100",
      email: "",
      firstName: "Ada",
      lastName: "",
      displayName: "Ada"
    });
  });

  it("keeps one-shot mode as the default worker runtime", () => {
    expect(parseWorkerRuntimeOptions({ argv: [], env: {} }).mode).toBe("once");
    expect(parseWorkerRuntimeOptions({ argv: ["--watch"], env: {} }).mode).toBe("continuous");
    expect(parseWorkerRuntimeOptions({ argv: ["--watch", "--once"], env: {} }).mode).toBe("once");
  });

  it("clamps continuous worker polling and accepts bounded local loops", () => {
    expect(
      parseWorkerRuntimeOptions({
        argv: ["--watch"],
        env: { WORKER_POLL_INTERVAL_MS: "250", WORKER_MAX_ITERATIONS: "2" }
      })
    ).toEqual({
      mode: "continuous",
      pollIntervalMs: 1000,
      maxIterations: 2
    });
  });
});
