import { describe, expect, it } from "vitest";
import { ConsentStatus } from "@prisma/client";
import {
  campaignMessageValues,
  localWorkerProviderIsAllowed,
  localWorkerReadiness,
  parseWorkerRuntimeOptions,
  scheduledCampaignSendIsAllowed,
  supportedWorkerDeploymentClasses,
  workerDeploymentClassIsAllowed
} from "@/lib/queue/worker";

describe("local queue worker", () => {
  it("only allows dummy provider processing while live messaging is disabled", () => {
    expect(localWorkerProviderIsAllowed({ liveMessagingEnabled: "false", messagingProvider: "dummy" })).toBe(true);
    expect(localWorkerProviderIsAllowed({ liveMessagingEnabled: "true", messagingProvider: "dummy" })).toBe(false);
    expect(localWorkerProviderIsAllowed({ liveMessagingEnabled: "false", messagingProvider: "twilio" })).toBe(false);
  });

  it("blocks worker processing in production-like runtimes even with demo-safe provider defaults", () => {
    expect(
      localWorkerReadiness({
        nodeEnv: "production",
        liveMessagingEnabled: "false",
        messagingProvider: "dummy"
      })
    ).toEqual({ allowed: false, reason: "production-worker-blocked" });
    expect(
      localWorkerReadiness({
        appEnv: "prod",
        liveMessagingEnabled: "false",
        messagingProvider: "dummy"
      })
    ).toEqual({ allowed: false, reason: "production-worker-blocked" });
    expect(
      localWorkerReadiness({
        nodeEnv: "development",
        liveMessagingEnabled: "false",
        messagingProvider: "dummy"
      })
    ).toEqual({ allowed: true });
  });

  it("allows only the current local-demo worker deployment class", () => {
    expect(supportedWorkerDeploymentClasses).toEqual(["local-demo"]);
    expect(() => ((supportedWorkerDeploymentClasses as unknown as string[]).push("production-live"))).toThrow();
    expect(workerDeploymentClassIsAllowed({})).toBe(true);
    expect(workerDeploymentClassIsAllowed({ workerDeploymentClass: "local-demo" })).toBe(true);
    expect(workerDeploymentClassIsAllowed({ workerDeploymentClass: "production-live" })).toBe(false);
    expect(workerDeploymentClassIsAllowed({ workerDeploymentClass: "production-live-campaign" })).toBe(false);
    expect(
      localWorkerReadiness({
        workerDeploymentClass: "production-live",
        liveMessagingEnabled: "false",
        messagingProvider: "dummy"
      })
    ).toEqual({ allowed: false, reason: "production-worker-blocked" });
    expect(
      localWorkerReadiness({
        workerDeploymentClass: "production-live-campaign",
        liveMessagingEnabled: "false",
        messagingProvider: "dummy"
      })
    ).toEqual({ allowed: false, reason: "production-worker-blocked" });
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

  it("rechecks recipient consent and archive state before scheduled worker sends", () => {
    const sendableContact = {
      id: "contact_sendable",
      phone: "+15555550100",
      consentStatus: ConsentStatus.OPTED_IN,
      optedOutAt: null,
      archivedAt: null
    };

    expect(scheduledCampaignSendIsAllowed([sendableContact])).toBe(true);
    expect(
      scheduledCampaignSendIsAllowed([
        sendableContact,
        {
          id: "contact_stale_opt_out",
          phone: "+15555550101",
          consentStatus: ConsentStatus.OPTED_OUT,
          optedOutAt: new Date("2026-05-21T12:00:00.000Z"),
          archivedAt: null
        }
      ])
    ).toBe(false);
    expect(scheduledCampaignSendIsAllowed([{ ...sendableContact, archivedAt: new Date("2026-05-21T12:00:00.000Z") }])).toBe(
      false
    );
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
        env: { WORKER_POLL_INTERVAL_MS: "250", WORKER_MAX_ITERATIONS: "2", WORKER_MAX_JOBS_PER_POLL: "250" }
      })
    ).toEqual({
      mode: "continuous",
      pollIntervalMs: 1000,
      maxJobsPerPoll: 100,
      maxIterations: 2
    });
  });
});
