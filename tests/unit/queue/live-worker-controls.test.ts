import { describe, expect, it } from "vitest";
import {
  liveWorkerControlsAreFrozen,
  liveWorkerControlIdsMatchRequiredChecklist,
  liveWorkerControlsExposeOnlyPublicFields,
  liveWorkerControlsAreImplemented,
  liveWorkerControlsUseSupportedStatuses,
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

  function implementedFrozenControls() {
    return Object.freeze(
      productionLiveCampaignWorkerControls.map((control) =>
        Object.freeze({
          ...control,
          status: "implemented" as const
        })
      )
    );
  }

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
    expect(liveWorkerControlsUseSupportedStatuses(productionLiveCampaignWorkerControls)).toBe(true);
    expect(
      liveWorkerControlsUseSupportedStatuses(
        productionLiveCampaignWorkerControls.map((control, index) =>
          index === 0 ? { ...control, status: "waived" as LiveWorkerControl["status"] } : control
        )
      )
    ).toBe(false);
  });

  it("requires frozen control arrays and entries before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const mutableImplementedControls = productionLiveCampaignWorkerControls.map((control) => ({
      ...control,
      status: "implemented" as const
    }));
    const mutableEntryControls = Object.freeze(
      productionLiveCampaignWorkerControls.map((control) => ({
        ...control,
        status: "implemented" as const
      }))
    );

    expect(liveWorkerControlsAreFrozen(productionLiveCampaignWorkerControls)).toBe(true);
    expect(liveWorkerControlsAreFrozen(implementedControls)).toBe(true);
    expect(liveWorkerControlsAreFrozen(mutableImplementedControls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(mutableImplementedControls)).toBe(false);
    expect(liveWorkerControlsAreFrozen(mutableEntryControls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(mutableEntryControls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(implementedControls)).toBe(true);
  });

  it("rejects control arrays with non-public fields before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const symbolField = Symbol("unsafe-live-worker-field");
    const nonEnumerableField = Object.freeze(
      Object.defineProperty(
        {
          ...implementedControls[0]
        },
        "reviewerBypass",
        {
          value: true,
          enumerable: false
        }
      )
    );

    expect(liveWorkerControlsExposeOnlyPublicFields(productionLiveCampaignWorkerControls)).toBe(true);
    expect(liveWorkerControlsAreImplemented(implementedControls)).toBe(true);
    expect(
      liveWorkerControlsExposeOnlyPublicFields(
        implementedControls.map((control, index) =>
          index === 0 ? { ...control, reviewerBypass: true } : control
        ) as readonly LiveWorkerControl[]
      )
    ).toBe(false);
    expect(
      liveWorkerControlsAreImplemented(
        Object.freeze(
          implementedControls.map((control, index) =>
            Object.freeze(index === 0 ? { ...control, reviewerBypass: true } : { ...control })
          )
        ) as readonly LiveWorkerControl[]
      )
    ).toBe(false);
    expect(
      liveWorkerControlsAreImplemented(
        Object.freeze(
          implementedControls.map((control, index) =>
            Object.freeze(index === 0 ? Object.assign({ ...control }, { [symbolField]: "unsafe" }) : { ...control })
          )
        )
      )
    ).toBe(false);
    expect(
      liveWorkerControlsAreImplemented(
        Object.freeze(
          implementedControls.map((control, index) => (index === 0 ? nonEnumerableField : Object.freeze({ ...control })))
        )
      )
    ).toBe(false);
  });

  it("requires live-worker controls to expose own enumerable data fields", () => {
    const implementedControls = implementedFrozenControls();
    const accessorBackedControl = Object.freeze(
      Object.defineProperties(
        {},
        {
          id: {
            enumerable: true,
            get: () => implementedControls[0].id
          },
          status: {
            enumerable: true,
            get: () => "implemented"
          },
          requirement: {
            enumerable: true,
            get: () => implementedControls[0].requirement
          }
        }
      )
    ) as LiveWorkerControl;
    const prototypeBackedControl = Object.freeze(
      Object.create(implementedControls[0], {
        status: {
          value: "implemented",
          enumerable: true
        }
      })
    ) as LiveWorkerControl;

    expect(liveWorkerControlsExposeOnlyPublicFields(implementedControls)).toBe(true);
    expect(
      liveWorkerControlsExposeOnlyPublicFields(
        Object.freeze(
          implementedControls.map((control, index) => (index === 0 ? accessorBackedControl : Object.freeze({ ...control })))
        )
      )
    ).toBe(false);
    expect(
      liveWorkerControlsAreImplemented(
        Object.freeze(
          implementedControls.map((control, index) => (index === 0 ? accessorBackedControl : Object.freeze({ ...control })))
        )
      )
    ).toBe(false);
    expect(
      liveWorkerControlsAreImplemented(
        Object.freeze(
          implementedControls.map((control, index) => (index === 0 ? prototypeBackedControl : Object.freeze({ ...control })))
        )
      )
    ).toBe(false);
  });

  it("rejects malformed control evidence without throwing", () => {
    const sparseControls = Array<LiveWorkerControl>(2);
    sparseControls[0] = Object.freeze({ ...productionLiveCampaignWorkerControls[0], status: "implemented" as const });

    const malformedInputs = [
      null,
      undefined,
      "implemented",
      1,
      Object.freeze({ status: "implemented" }),
      Object.freeze([null]),
      Object.freeze(["implemented"]),
      Object.freeze(sparseControls)
    ];

    for (const controls of malformedInputs) {
      expect(liveWorkerControlsAreFrozen(controls)).toBe(false);
      expect(liveWorkerControlsExposeOnlyPublicFields(controls)).toBe(false);
      expect(liveWorkerControlsUseSupportedStatuses(controls)).toBe(false);
      expect(liveWorkerControlIdsMatchRequiredChecklist(controls)).toBe(false);
      expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
      expect(
        liveWorkerDeploymentClassIsAuthorized({
          workerDeploymentClass: reservedLiveWorkerDeploymentClass,
          controls
        })
      ).toBe(false);
    }
  });

  it("requires the exact frozen control checklist before controls can be treated as implemented", () => {
    const implementedControls = implementedFrozenControls();

    expect(liveWorkerControlIdsMatchRequiredChecklist(productionLiveCampaignWorkerControls)).toBe(true);
    expect(liveWorkerControlsAreImplemented(implementedControls)).toBe(true);
    expect(liveWorkerControlsAreImplemented(Object.freeze(implementedControls.slice(0, -1)))).toBe(false);
    expect(
      liveWorkerControlsAreImplemented(
        Object.freeze([
          Object.freeze({
            id: "deploy-environment-allowlist",
            status: "implemented",
            requirement: "Only one implemented control is not enough to authorize live worker execution."
          })
        ])
      )
    ).toBe(false);
    expect(
      liveWorkerControlsAreImplemented(
        Object.freeze([...implementedControls.slice(1), implementedControls[0]])
      )
    ).toBe(false);
    expect(
      liveWorkerControlsAreImplemented(
        Object.freeze(
          implementedControls.map((control, index) =>
            Object.freeze(index === 0 ? { ...control, id: "unexpected-live-worker-control" } : { ...control })
          )
        )
      )
    ).toBe(false);
    expect(
      liveWorkerControlsAreImplemented(
        Object.freeze(
          implementedControls.map((control, index) =>
            Object.freeze(
              index === 0
                ? {
                    ...control,
                    requirement: "Matching IDs with replaced requirement copy must not authorize live worker execution."
                  }
                : { ...control }
            )
          )
        )
      )
    ).toBe(false);
    expect(
      liveWorkerControlsAreImplemented(
        Object.freeze(
          implementedControls.map((control, index) =>
            Object.freeze(index === 0 ? { ...control, status: "waived" as LiveWorkerControl["status"] } : { ...control })
          )
        )
      )
    ).toBe(false);
  });

  it("authorizes the reserved production class only when every control is implemented", () => {
    expect(liveWorkerControlsAreImplemented()).toBe(false);
    expect(liveWorkerDeploymentClassIsAuthorized({ workerDeploymentClass: reservedLiveWorkerDeploymentClass })).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized({
        workerDeploymentClass: reservedLiveWorkerDeploymentClass,
        controls: Object.freeze([
          Object.freeze({
            id: "deploy-environment-allowlist",
            status: "implemented",
            requirement: "Only one implemented control is not enough to authorize live worker execution."
          })
        ])
      })
    ).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized({
        workerDeploymentClass: "production-live",
        controls: implementedFrozenControls()
      })
    ).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized({
        workerDeploymentClass: reservedLiveWorkerDeploymentClass,
        controls: implementedFrozenControls()
      })
    ).toBe(true);
  });
});
