import { describe, expect, it } from "vitest";
import {
  directMessageLiveWorkerDeploymentClass,
  directMessageWorkerReadiness
} from "@/lib/messaging/outbox/readiness";

const masterKey = Buffer.alloc(32, 4).toString("base64");

describe("direct message worker readiness", () => {
  it("allows only the network-free dummy profile in local demo mode", () => {
    expect(directMessageWorkerReadiness({})).toEqual({ allowed: true, transport: "dummy" });
    for (const input of [
      { nodeEnv: "production" },
      { liveMessagingEnabled: "true" },
      { demoMode: "false" },
      { workerDeploymentClass: directMessageLiveWorkerDeploymentClass }
    ]) {
      expect(directMessageWorkerReadiness(input)).toEqual({
        allowed: false,
        reason: "demo-worker-invalid"
      });
    }
  });

  it("allows the explicit stored-credential live direct worker profile", () => {
    expect(directMessageWorkerReadiness({
      workerEnabled: "true",
      workerDeploymentClass: directMessageLiveWorkerDeploymentClass,
      runtimeProcess: "worker",
      demoMode: "false",
      liveMessagingEnabled: "true",
      messagingProvider: "twilio",
      appUrl: "https://sms.example.test",
      secretsMasterKey: masterKey,
      nodeEnv: "production"
    })).toEqual({ allowed: true, transport: "twilio" });
  });

  it("fails closed for every missing live prerequisite", () => {
    const ready = {
      workerEnabled: "true",
      workerDeploymentClass: directMessageLiveWorkerDeploymentClass,
      runtimeProcess: "worker",
      demoMode: "false",
      liveMessagingEnabled: "true",
      messagingProvider: "twilio",
      appUrl: "https://sms.example.test",
      secretsMasterKey: masterKey
    } as const;
    const cases = [
      { ...ready, workerEnabled: "false" },
      { ...ready, runtimeProcess: "web" },
      { ...ready, workerDeploymentClass: "local-demo" },
      { ...ready, demoMode: "true" },
      { ...ready, liveMessagingEnabled: "false" },
      { ...ready, messagingProvider: "dummy" },
      { ...ready, appUrl: "http://sms.example.test" },
      { ...ready, secretsMasterKey: "not-a-key" }
    ];
    for (const input of cases) {
      expect(directMessageWorkerReadiness(input).allowed).toBe(false);
    }
  });

  it("never authorizes the still-reserved campaign worker class", () => {
    expect(directMessageWorkerReadiness({
      workerEnabled: "true",
      workerDeploymentClass: "production-live-campaign",
      runtimeProcess: "worker",
      demoMode: "false",
      liveMessagingEnabled: "true",
      messagingProvider: "twilio",
      appUrl: "https://sms.example.test",
      secretsMasterKey: masterKey
    }).allowed).toBe(false);
  });
});
