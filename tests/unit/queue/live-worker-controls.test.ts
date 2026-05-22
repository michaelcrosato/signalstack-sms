import { describe, expect, it } from "vitest";
import {
  liveWorkerControlsAreImplemented,
  liveWorkerDeploymentClassIsAuthorized,
  productionLiveCampaignWorkerControls,
  reservedLiveWorkerDeploymentClass,
  supportedLiveWorkerControlStatuses,
  type LiveWorkerControl
} from "@/lib/queue/live-worker-controls";
import { supportedWorkerDeploymentClasses, workerDeploymentClassIsAllowed } from "@/lib/queue/worker";

describe("production live campaign worker controls", () => {
  const requiredControlIds = [
    "deploy-environment-allowlist",
    "org-live-campaign-flag",
    "provider-mutation-hard-gate",
    "per-recipient-send-time-checks",
    "tenant-idempotency-contract",
    "worker-rate-limit-emergency-stop",
    "secret-manager-only-credentials",
    "redacted-observability",
    "billing-isolation",
    "rollback-runbook",
    "blocked-state-coverage"
  ];

  it("keeps the reserved production class outside the currently supported worker class list", () => {
    expect(reservedLiveWorkerDeploymentClass).toBe("production-live-campaign");
    expect(supportedWorkerDeploymentClasses).toEqual(["local-demo"]);
    expect(supportedWorkerDeploymentClasses).not.toContain(reservedLiveWorkerDeploymentClass);
    expect(workerDeploymentClassIsAllowed({ workerDeploymentClass: reservedLiveWorkerDeploymentClass })).toBe(false);
  });

  it("pins the future live-worker control checklist as frozen executable metadata", () => {
    expect(productionLiveCampaignWorkerControls.map((control) => control.id)).toEqual(requiredControlIds);
    expect(productionLiveCampaignWorkerControls.every((control) => control.status === "planned")).toBe(true);
    expect(productionLiveCampaignWorkerControls.every((control) => control.requirement.length > 40)).toBe(true);
    expect(Object.isFrozen(productionLiveCampaignWorkerControls)).toBe(true);
    expect(Object.isFrozen(productionLiveCampaignWorkerControls[0])).toBe(true);
    expect(() =>
      (productionLiveCampaignWorkerControls as unknown as LiveWorkerControl[]).push({
        id: "unsafe-shortcut",
        status: "implemented",
        requirement: "Enable live sends."
      })
    ).toThrow(TypeError);
    expect(() => ((productionLiveCampaignWorkerControls[0] as { status: string }).status = "implemented")).toThrow(TypeError);
  });

  it("keeps live-worker control statuses inside the exported vocabulary", () => {
    expect(supportedLiveWorkerControlStatuses).toEqual(["planned", "implemented"]);
    expect(() => ((supportedLiveWorkerControlStatuses as unknown as string[]).push("waived"))).toThrow(TypeError);
    expect(
      productionLiveCampaignWorkerControls.every((control) =>
        supportedLiveWorkerControlStatuses.includes(control.status)
      )
    ).toBe(true);
  });

  it("authorizes the reserved production class only when every control is implemented", () => {
    expect(liveWorkerControlsAreImplemented()).toBe(false);
    expect(liveWorkerDeploymentClassIsAuthorized({ workerDeploymentClass: reservedLiveWorkerDeploymentClass })).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized({
        workerDeploymentClass: "production-live",
        controls: productionLiveCampaignWorkerControls.map((control) => ({ ...control, status: "implemented" }))
      })
    ).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized({
        workerDeploymentClass: reservedLiveWorkerDeploymentClass,
        controls: productionLiveCampaignWorkerControls.map((control) => ({ ...control, status: "implemented" }))
      })
    ).toBe(true);
  });
});
