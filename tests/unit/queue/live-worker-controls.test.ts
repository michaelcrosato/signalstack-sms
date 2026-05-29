import { describe, expect, it } from "vitest";
import {
  liveWorkerControlArrayExposesOnlyIndexedEntries,
  liveWorkerControlEvidenceUsesFrozenDataDescriptors,
  liveWorkerControlIdsMatchRequiredChecklist,
  liveWorkerControlsAreFrozen,
  liveWorkerControlsAreImplemented,
  liveWorkerControlsExposeOnlyPublicFields,
  liveWorkerControlsUseSupportedStatuses,
  liveWorkerDeploymentClassIsAuthorized,
  productionLiveCampaignWorkerControls,
  reservedLiveWorkerDeploymentClass,
  supportedLiveWorkerControlStatuses
} from "@/lib/queue/live-worker-controls";
import { supportedWorkerDeploymentClasses, workerDeploymentClassIsAllowed } from "@/lib/queue/worker";

// The reserved `production-live-campaign` worker class is unimplemented. The security property is:
// the authorization gate denies it (and every malformed input) while the 11 controls are all
// "planned", and only authorizes a frozen, exact-shape, all-"implemented" controls array. This suite
// pins that property with representative cases instead of exhaustive proxy/reflection permutations.

const reserved = reservedLiveWorkerDeploymentClass;

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

function controlsWith(build: (control: { id: string; requirement: string }, index: number) => unknown) {
  return Object.freeze(productionLiveCampaignWorkerControls.map((control, index) => build(control, index)));
}

function implementedControls() {
  return controlsWith((control) =>
    Object.freeze({ id: control.id, status: "implemented", requirement: control.requirement })
  );
}

function unfrozenImplementedControls() {
  return productionLiveCampaignWorkerControls.map((control) =>
    Object.freeze({ id: control.id, status: "implemented", requirement: control.requirement })
  );
}

function onePlannedControls() {
  return controlsWith((control, index) =>
    Object.freeze({ id: control.id, status: index === 0 ? "planned" : "implemented", requirement: control.requirement })
  );
}

function statusControls(status: string) {
  return controlsWith((control) => Object.freeze({ id: control.id, status, requirement: control.requirement }));
}

function missingFieldControls() {
  return controlsWith((control) => Object.freeze({ id: control.id, status: "implemented" }));
}

function extraFieldControls() {
  return controlsWith((control) =>
    Object.freeze({ id: control.id, status: "implemented", requirement: control.requirement, extra: true })
  );
}

function reorderedControls() {
  return Object.freeze(implementedControls().slice().reverse());
}

function wrap(workerDeploymentClass: unknown, controls: unknown) {
  return Object.freeze({ workerDeploymentClass, controls });
}

function authorize(input: unknown) {
  return liveWorkerDeploymentClassIsAuthorized(input as Parameters<typeof liveWorkerDeploymentClassIsAuthorized>[0]);
}

function throwingProxy() {
  const trap = () => {
    throw new Error("hostile trap");
  };
  return new Proxy(
    {},
    { get: trap, getOwnPropertyDescriptor: trap, ownKeys: trap, getPrototypeOf: trap }
  );
}

function getterBackedWrapper() {
  const wrapper: Record<string, unknown> = {};
  Object.defineProperty(wrapper, "workerDeploymentClass", {
    get: () => reserved,
    enumerable: true,
    configurable: true
  });
  wrapper.controls = implementedControls();
  return Object.freeze(wrapper);
}

describe("production-live-campaign control metadata", () => {
  it("reserves the production-live-campaign class and frozen status vocabulary", () => {
    expect(reserved).toBe("production-live-campaign");
    expect(supportedLiveWorkerControlStatuses).toEqual(["planned", "implemented"]);
    expect(Object.isFrozen(supportedLiveWorkerControlStatuses)).toBe(true);
  });

  it("exposes the 11 required controls in order, all still planned and frozen", () => {
    expect(productionLiveCampaignWorkerControls.map((control) => control.id)).toEqual(requiredControlIds);
    expect(productionLiveCampaignWorkerControls.every((control) => control.status === "planned")).toBe(true);
    expect(Object.isFrozen(productionLiveCampaignWorkerControls)).toBe(true);
    expect(productionLiveCampaignWorkerControls.every((control) => Object.isFrozen(control))).toBe(true);
  });
});

describe("control-array predicates", () => {
  const predicates: Array<{ label: string; predicate: (controls: unknown) => boolean }> = [
    { label: "are frozen", predicate: liveWorkerControlsAreFrozen },
    { label: "expose only indexed entries", predicate: liveWorkerControlArrayExposesOnlyIndexedEntries },
    { label: "use frozen data descriptors", predicate: liveWorkerControlEvidenceUsesFrozenDataDescriptors },
    { label: "match the required ids", predicate: liveWorkerControlIdsMatchRequiredChecklist },
    { label: "expose only public fields", predicate: liveWorkerControlsExposeOnlyPublicFields },
    { label: "use supported statuses", predicate: liveWorkerControlsUseSupportedStatuses }
  ];

  it.each(predicates)("accepts the real checklist: $label", ({ predicate }) => {
    expect(predicate(productionLiveCampaignWorkerControls)).toBe(true);
  });

  it.each(predicates)("rejects a non-array: $label", ({ predicate }) => {
    expect(predicate(Object.freeze({}))).toBe(false);
  });
});

describe("liveWorkerControlsAreImplemented", () => {
  it("is false for the real (all-planned) checklist", () => {
    expect(liveWorkerControlsAreImplemented()).toBe(false);
  });

  it("is true only for a fully implemented frozen checklist", () => {
    expect(liveWorkerControlsAreImplemented(implementedControls())).toBe(true);
  });

  it("is false for a non-array", () => {
    expect(liveWorkerControlsAreImplemented(Object.freeze({}))).toBe(false);
  });
});

describe("liveWorkerDeploymentClassIsAuthorized", () => {
  it("authorizes the reserved production class only when every control is implemented", () => {
    expect(authorize(wrap(reserved, implementedControls()))).toBe(true);
    expect(authorize(wrap(reserved, productionLiveCampaignWorkerControls))).toBe(false);
    expect(authorize(wrap(reserved, onePlannedControls()))).toBe(false);
    expect(authorize(wrap("local-demo", implementedControls()))).toBe(false);
    expect(liveWorkerDeploymentClassIsAuthorized()).toBe(false);
  });

  it("requires the exact frozen control checklist", () => {
    expect(liveWorkerControlIdsMatchRequiredChecklist(reorderedControls())).toBe(false);
    expect(authorize(wrap(reserved, reorderedControls()))).toBe(false);
    expect(authorize(wrap(reserved, missingFieldControls()))).toBe(false);
  });

  it("keeps live-worker control statuses inside the exported vocabulary", () => {
    expect(liveWorkerControlsUseSupportedStatuses(productionLiveCampaignWorkerControls)).toBe(true);
    expect(liveWorkerControlsUseSupportedStatuses(statusControls("done"))).toBe(false);
    expect(authorize(wrap(reserved, statusControls("done")))).toBe(false);
  });

  it("rejects decorated control arrays before live-worker authorization", () => {
    expect(authorize(wrap(reserved, extraFieldControls()))).toBe(false);
    expect(authorize(getterBackedWrapper())).toBe(false);
  });

  it("rejects malformed authorization inputs without throwing", () => {
    expect(() => authorize(throwingProxy())).not.toThrow();
    expect(authorize(throwingProxy())).toBe(false);
    expect(authorize(Object.freeze([reserved, implementedControls()]))).toBe(false);
    expect(authorize(wrap(reserved, Object.freeze({})))).toBe(false);
    expect(authorize(Object.freeze({ workerDeploymentClass: reserved, controls: implementedControls(), rogue: true }))).toBe(false);
    expect(authorize(Object.freeze({ controls: implementedControls(), workerDeploymentClass: reserved }))).toBe(false);
  });

  it("requires frozen authorization wrapper data descriptors before live-worker authorization", () => {
    expect(authorize({ workerDeploymentClass: reserved, controls: implementedControls() })).toBe(false);
    expect(authorize(getterBackedWrapper())).toBe(false);
  });

  it("rejects control arrays with non-public fields before live-worker authorization", () => {
    expect(liveWorkerControlsExposeOnlyPublicFields(extraFieldControls())).toBe(false);
    expect(authorize(wrap(reserved, extraFieldControls()))).toBe(false);
  });

  it("requires frozen control arrays and entries before live-worker authorization", () => {
    expect(liveWorkerControlsAreFrozen(unfrozenImplementedControls())).toBe(false);
    expect(authorize(wrap(reserved, unfrozenImplementedControls()))).toBe(false);
  });
});

describe("workerDeploymentClassIsAllowed", () => {
  const allow = (workerDeploymentClass: unknown) =>
    workerDeploymentClassIsAllowed({ workerDeploymentClass } as Parameters<typeof workerDeploymentClassIsAllowed>[0]);

  it("only supports the local-demo class, frozen", () => {
    expect(supportedWorkerDeploymentClasses).toEqual(["local-demo"]);
    expect(Object.isFrozen(supportedWorkerDeploymentClasses)).toBe(true);
  });

  it.each([undefined, "", "local-demo"])("allows %j", (workerDeploymentClass) => {
    expect(allow(workerDeploymentClass)).toBe(true);
  });

  it.each(["production-live-campaign", "production", "staging", "prod"])("denies %j", (workerDeploymentClass) => {
    expect(allow(workerDeploymentClass)).toBe(false);
  });
});
