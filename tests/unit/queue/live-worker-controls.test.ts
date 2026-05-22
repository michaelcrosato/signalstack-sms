import { describe, expect, it } from "vitest";
import {
  liveWorkerControlsAreFrozen,
  liveWorkerControlArrayExposesOnlyIndexedEntries,
  liveWorkerControlEvidenceUsesFrozenDataDescriptors,
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

  function frozenAuthorizationWrapper(workerDeploymentClass: string, controls: unknown) {
    return Object.freeze({
      workerDeploymentClass,
      controls
    });
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

  it("rejects decorated control arrays before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const symbolField = Symbol("unsafe-live-worker-array-field");
    const extraStringFieldControls = Object.freeze(
      Object.assign([...implementedControls], {
        reviewerBypass: true
      })
    );
    const extraSymbolFieldControls = [...implementedControls];
    Object.defineProperty(extraSymbolFieldControls, symbolField, {
      value: true,
      enumerable: true
    });
    Object.freeze(extraSymbolFieldControls);
    const hiddenExtraFieldControls = [...implementedControls];
    Object.defineProperty(hiddenExtraFieldControls, "hiddenReviewerBypass", {
      value: true,
      enumerable: false
    });
    Object.freeze(hiddenExtraFieldControls);
    const nonEnumerableIndexControls = [...implementedControls];
    Object.defineProperty(nonEnumerableIndexControls, "0", {
      value: implementedControls[0],
      enumerable: false
    });
    Object.freeze(nonEnumerableIndexControls);

    expect(liveWorkerControlArrayExposesOnlyIndexedEntries(productionLiveCampaignWorkerControls)).toBe(true);
    expect(liveWorkerControlArrayExposesOnlyIndexedEntries(implementedControls)).toBe(true);
    expect(liveWorkerControlsAreImplemented(implementedControls)).toBe(true);
    expect(liveWorkerControlArrayExposesOnlyIndexedEntries(extraStringFieldControls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(extraStringFieldControls)).toBe(false);
    expect(liveWorkerControlArrayExposesOnlyIndexedEntries(extraSymbolFieldControls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(extraSymbolFieldControls)).toBe(false);
    expect(liveWorkerControlArrayExposesOnlyIndexedEntries(hiddenExtraFieldControls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(hiddenExtraFieldControls)).toBe(false);
    expect(liveWorkerControlArrayExposesOnlyIndexedEntries(nonEnumerableIndexControls)).toBe(false);
    expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(nonEnumerableIndexControls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(nonEnumerableIndexControls)).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, nonEnumerableIndexControls)
      )
    ).toBe(false);
  });

  it("rejects array subclass evidence before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();

    class LiveWorkerControlArray extends Array<LiveWorkerControl> {
      reviewerBypass() {
        return true;
      }
    }

    const subclassControls = new LiveWorkerControlArray(...implementedControls);
    Object.freeze(subclassControls);

    expect(Array.isArray(subclassControls)).toBe(true);
    expect(liveWorkerControlArrayExposesOnlyIndexedEntries(subclassControls)).toBe(false);
    expect(liveWorkerControlsAreFrozen(subclassControls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(subclassControls)).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, subclassControls)
      )
    ).toBe(false);
  });

  it("requires frozen data descriptors before live-worker authorization", () => {
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
    const frozenArrayWithMutableEntry = Object.freeze(
      implementedControls.map((control, index) =>
        index === 0
          ? {
              ...control
            }
          : Object.freeze({ ...control })
      )
    );

    expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(productionLiveCampaignWorkerControls)).toBe(true);
    expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(implementedControls)).toBe(true);
    expect(liveWorkerControlsAreImplemented(implementedControls)).toBe(true);
    expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(mutableImplementedControls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(mutableImplementedControls)).toBe(false);
    expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(mutableEntryControls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(mutableEntryControls)).toBe(false);
    expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(frozenArrayWithMutableEntry)).toBe(false);
    expect(liveWorkerControlsAreImplemented(frozenArrayWithMutableEntry)).toBe(false);
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

  it("rejects control entries missing public fields before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const withoutId = Object.freeze({
      status: "implemented" as const,
      requirement: implementedControls[0].requirement
    });
    const withoutStatus = Object.freeze({
      id: implementedControls[0].id,
      requirement: implementedControls[0].requirement
    });
    const withoutRequirement = Object.freeze({
      id: implementedControls[0].id,
      status: "implemented" as const
    });

    for (const malformedControl of [withoutId, withoutStatus, withoutRequirement]) {
      const controls = Object.freeze(
        implementedControls.map((control, index) => (index === 0 ? malformedControl : Object.freeze({ ...control })))
      );

      expect(liveWorkerControlsExposeOnlyPublicFields(controls)).toBe(false);
      expect(liveWorkerControlIdsMatchRequiredChecklist(controls)).toBe(malformedControl === withoutStatus);
      expect(liveWorkerControlsUseSupportedStatuses(controls)).toBe(malformedControl !== withoutStatus);
      expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
      expect(
        liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
      ).toBe(false);
    }
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

  it("rejects accessor-backed public fields without reading getters", () => {
    const implementedControls = implementedFrozenControls();
    const accessorBackedControl = Object.freeze(
      Object.defineProperties(
        {},
        {
          id: {
            enumerable: true,
            get: () => {
              throw new Error("id getter must not be read");
            }
          },
          status: {
            enumerable: true,
            get: () => {
              throw new Error("status getter must not be read");
            }
          },
          requirement: {
            enumerable: true,
            get: () => {
              throw new Error("requirement getter must not be read");
            }
          }
        }
      )
    ) as LiveWorkerControl;
    const controls = Object.freeze(
      implementedControls.map((control, index) => (index === 0 ? accessorBackedControl : Object.freeze({ ...control })))
    );

    expect(() => liveWorkerControlIdsMatchRequiredChecklist(controls)).not.toThrow();
    expect(() => liveWorkerControlsUseSupportedStatuses(controls)).not.toThrow();
    expect(() => liveWorkerControlsAreImplemented(controls)).not.toThrow();
    expect(liveWorkerControlIdsMatchRequiredChecklist(controls)).toBe(false);
    expect(liveWorkerControlsUseSupportedStatuses(controls)).toBe(false);
    expect(liveWorkerControlsExposeOnlyPublicFields(controls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
    ).toBe(false);
  });

  it("requires live-worker controls to be ordinary object records", () => {
    const implementedControls = implementedFrozenControls();
    const nullPrototypeControl = Object.create(null, {
      id: {
        value: implementedControls[0].id,
        enumerable: true
      },
      status: {
        value: "implemented",
        enumerable: true
      },
      requirement: {
        value: implementedControls[0].requirement,
        enumerable: true
      }
    }) as LiveWorkerControl;
    Object.freeze(nullPrototypeControl);

    class ControlRecord {
      id = implementedControls[0].id;
      status = "implemented" as const;
      requirement = implementedControls[0].requirement;
    }
    const classInstanceControl = Object.freeze(new ControlRecord()) as LiveWorkerControl;

    expect(liveWorkerControlsExposeOnlyPublicFields(implementedControls)).toBe(true);
    expect(
      liveWorkerControlsExposeOnlyPublicFields(
        Object.freeze(
          implementedControls.map((control, index) => (index === 0 ? nullPrototypeControl : Object.freeze({ ...control })))
        )
      )
    ).toBe(false);
    expect(
      liveWorkerControlsAreImplemented(
        Object.freeze(
          implementedControls.map((control, index) => (index === 0 ? nullPrototypeControl : Object.freeze({ ...control })))
        )
      )
    ).toBe(false);
    expect(
      liveWorkerControlsAreImplemented(
        Object.freeze(
          implementedControls.map((control, index) => (index === 0 ? classInstanceControl : Object.freeze({ ...control })))
        )
      )
    ).toBe(false);
  });

  it("rejects malformed control evidence without throwing", () => {
    const sparseControls = Array<LiveWorkerControl>(2);
    sparseControls[0] = Object.freeze({ ...productionLiveCampaignWorkerControls[0], status: "implemented" as const });
    const accessorSlotControls = Object.freeze(
      Object.defineProperty([...implementedFrozenControls()], "0", {
        enumerable: true,
        configurable: false,
        get: () => {
          throw new Error("array slot getter must not be read");
        }
      })
    );

    const malformedInputs = [
      null,
      undefined,
      "implemented",
      1,
      Object.freeze({ status: "implemented" }),
      Object.freeze([null]),
      Object.freeze(["implemented"]),
      Object.freeze(sparseControls),
      accessorSlotControls
    ];

    for (const controls of malformedInputs) {
      expect(liveWorkerControlsAreFrozen(controls)).toBe(false);
      expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(controls)).toBe(false);
      expect(liveWorkerControlsExposeOnlyPublicFields(controls)).toBe(false);
      expect(liveWorkerControlsUseSupportedStatuses(controls)).toBe(false);
      expect(liveWorkerControlIdsMatchRequiredChecklist(controls)).toBe(false);
      expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
      expect(
        liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
      ).toBe(false);
    }
  });

  it("rejects proxy-backed control evidence without throwing", () => {
    const implementedControls = implementedFrozenControls();
    const throwingArrayPrototypeProxy = new Proxy([...implementedControls], {
      getPrototypeOf: () => {
        throw new Error("array prototype trap must not escape");
      }
    });
    const throwingArrayDescriptorProxy = new Proxy([...implementedControls], {
      getOwnPropertyDescriptor: () => {
        throw new Error("array descriptor trap must not escape");
      }
    });
    const throwingArrayKeysProxy = new Proxy([...implementedControls], {
      ownKeys: () => {
        throw new Error("array keys trap must not escape");
      }
    });
    const reorderedArrayKeysProxy = new Proxy(implementedControls, {
      ownKeys: () => ["length", ...implementedControls.map((_, index) => String(index))]
    });
    const throwingArrayFrozenStateProxy = new Proxy([...implementedControls], {
      isExtensible: () => {
        throw new Error("array frozen-state trap must not escape");
      }
    });
    const throwingControlPrototypeProxy = new Proxy({ ...implementedControls[0] }, {
      getPrototypeOf: () => {
        throw new Error("control prototype trap must not escape");
      }
    });
    const throwingControlDescriptorProxy = new Proxy({ ...implementedControls[0] }, {
      getOwnPropertyDescriptor: () => {
        throw new Error("control descriptor trap must not escape");
      }
    });
    const throwingControlKeysProxy = new Proxy({ ...implementedControls[0] }, {
      ownKeys: () => {
        throw new Error("control keys trap must not escape");
      }
    });
    const throwingControlFrozenStateProxy = new Proxy({ ...implementedControls[0] }, {
      isExtensible: () => {
        throw new Error("control frozen-state trap must not escape");
      }
    });
    const proxyInputs = [
      throwingArrayPrototypeProxy,
      throwingArrayDescriptorProxy,
      throwingArrayKeysProxy,
      reorderedArrayKeysProxy,
      throwingArrayFrozenStateProxy,
      Object.freeze(
        implementedControls.map((control, index) =>
          index === 0 ? throwingControlPrototypeProxy : Object.freeze({ ...control })
        )
      ),
      Object.freeze(
        implementedControls.map((control, index) =>
          index === 0 ? throwingControlDescriptorProxy : Object.freeze({ ...control })
        )
      ),
      Object.freeze(
        implementedControls.map((control, index) =>
          index === 0 ? throwingControlKeysProxy : Object.freeze({ ...control })
        )
      ),
      Object.freeze(
        implementedControls.map((control, index) =>
          index === 0 ? throwingControlFrozenStateProxy : Object.freeze({ ...control })
        )
      )
    ];

    for (const controls of proxyInputs) {
      expect(() => liveWorkerControlsAreFrozen(controls)).not.toThrow();
      expect(() => liveWorkerControlEvidenceUsesFrozenDataDescriptors(controls)).not.toThrow();
      expect(() => liveWorkerControlArrayExposesOnlyIndexedEntries(controls)).not.toThrow();
      expect(() => liveWorkerControlsExposeOnlyPublicFields(controls)).not.toThrow();
      expect(() => liveWorkerControlsUseSupportedStatuses(controls)).not.toThrow();
      expect(() => liveWorkerControlIdsMatchRequiredChecklist(controls)).not.toThrow();
      expect(() => liveWorkerControlsAreImplemented(controls)).not.toThrow();
      expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
      expect(
        liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
      ).toBe(false);
    }
  });

  it("does not inspect supplied controls for unsupported deployment classes", () => {
    const throwingEvidence = new Proxy([...implementedFrozenControls()], {
      getPrototypeOf: () => {
        throw new Error("unsupported worker classes must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("unsupported worker classes must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("unsupported worker classes must not inspect control evidence");
      }
    });

    expect(() =>
      liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper("production-live", throwingEvidence))
    ).not.toThrow();
    expect(
      liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper("production-live", throwingEvidence))
    ).toBe(false);
  });

  it("does not inspect supplied controls for malformed deployment class values", () => {
    const throwingEvidence = new Proxy([...implementedFrozenControls()], {
      getPrototypeOf: () => {
        throw new Error("malformed worker classes must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("malformed worker classes must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("malformed worker classes must not inspect control evidence");
      }
    });

    const malformedClassValues = [
      null,
      undefined,
      42,
      true,
      Symbol("production-live-campaign"),
      Object.freeze(["production-live-campaign"]),
      Object.freeze({ value: reservedLiveWorkerDeploymentClass })
    ];

    for (const workerDeploymentClass of malformedClassValues) {
      expect(() =>
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(workerDeploymentClass as unknown as string, throwingEvidence)
        )
      ).not.toThrow();
      expect(
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(workerDeploymentClass as unknown as string, throwingEvidence)
        )
      ).toBe(false);
    }
  });

  it("requires frozen authorization wrapper data descriptors before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const mutableWrapper = {
      workerDeploymentClass: reservedLiveWorkerDeploymentClass,
      controls: implementedControls
    };
    const sealedWrapper = Object.seal({
      workerDeploymentClass: reservedLiveWorkerDeploymentClass,
      controls: implementedControls
    });
    const reorderedWrapper = Object.freeze({
      controls: implementedControls,
      workerDeploymentClass: reservedLiveWorkerDeploymentClass
    });
    const extensibleWrapperWithFrozenFields = Object.defineProperties(
      {},
      {
        workerDeploymentClass: {
          value: reservedLiveWorkerDeploymentClass,
          enumerable: true,
          writable: false,
          configurable: false
        },
        controls: {
          value: implementedControls,
          enumerable: true,
          writable: false,
          configurable: false
        }
      }
    );

    expect(liveWorkerDeploymentClassIsAuthorized(mutableWrapper)).toBe(false);
    expect(liveWorkerDeploymentClassIsAuthorized(sealedWrapper)).toBe(false);
    expect(liveWorkerDeploymentClassIsAuthorized(reorderedWrapper)).toBe(false);
    expect(Object.isFrozen(extensibleWrapperWithFrozenFields)).toBe(false);
    expect(liveWorkerDeploymentClassIsAuthorized(extensibleWrapperWithFrozenFields)).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, implementedControls)
      )
    ).toBe(true);
  });

  it("rejects non-frozen authorization wrapper descriptors before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const writableClassWrapper = Object.preventExtensions(
      Object.defineProperties(
        {},
        {
          workerDeploymentClass: {
            value: reservedLiveWorkerDeploymentClass,
            enumerable: true,
            writable: true,
            configurable: false
          },
          controls: {
            value: implementedControls,
            enumerable: true,
            writable: false,
            configurable: false
          }
        }
      )
    );
    const configurableControlsWrapper = Object.preventExtensions(
      Object.defineProperties(
        {},
        {
          workerDeploymentClass: {
            value: reservedLiveWorkerDeploymentClass,
            enumerable: true,
            writable: false,
            configurable: false
          },
          controls: {
            value: implementedControls,
            enumerable: true,
            writable: false,
            configurable: true
          }
        }
      )
    );

    expect(Object.isFrozen(writableClassWrapper)).toBe(false);
    expect(Object.isFrozen(configurableControlsWrapper)).toBe(false);
    expect(liveWorkerDeploymentClassIsAuthorized(writableClassWrapper)).toBe(false);
    expect(liveWorkerDeploymentClassIsAuthorized(configurableControlsWrapper)).toBe(false);
  });

  it("rejects malformed authorization inputs without throwing", () => {
    const implementedControls = implementedFrozenControls();
    const mutableInput = {
      workerDeploymentClass: reservedLiveWorkerDeploymentClass,
      controls: implementedControls
    };
    const accessorBackedInput = Object.freeze(
      Object.defineProperties(
        {},
        {
          workerDeploymentClass: {
            enumerable: true,
            get: () => {
              throw new Error("worker deployment class getter must not be read");
            }
          },
          controls: {
            enumerable: true,
            get: () => {
              throw new Error("controls getter must not be read");
            }
          }
        }
      )
    );
    const descriptorThrowingInput = new Proxy(
      {
        workerDeploymentClass: reservedLiveWorkerDeploymentClass,
        controls: implementedControls
      },
      {
        getOwnPropertyDescriptor: () => {
          throw new Error("authorization input descriptor trap must not escape");
        }
      }
    );
    const hiddenExtraFieldInput = Object.freeze(
      Object.defineProperty(
        {
          workerDeploymentClass: reservedLiveWorkerDeploymentClass,
          controls: implementedControls
        },
        "reviewerBypass",
        {
          value: true,
          enumerable: false
        }
      )
    );
    const symbolExtraFieldInput = Object.freeze(
      Object.assign(
        {
          workerDeploymentClass: reservedLiveWorkerDeploymentClass,
          controls: implementedControls
        },
        { [Symbol("unsafe-live-worker-authorization")]: true }
      )
    );
    const nullPrototypeInput = Object.freeze(
      Object.assign(Object.create(null) as Record<string, unknown>, {
        workerDeploymentClass: reservedLiveWorkerDeploymentClass,
        controls: implementedControls
      })
    );
    const inheritedFieldInput = Object.freeze(
      Object.create({
        workerDeploymentClass: reservedLiveWorkerDeploymentClass,
        controls: implementedControls
      })
    );
    const inheritedExtraFieldInput = Object.freeze(
      Object.create(
        { reviewerBypass: true },
        {
          workerDeploymentClass: {
            value: reservedLiveWorkerDeploymentClass,
            enumerable: true,
            writable: false,
            configurable: false
          },
          controls: {
            value: implementedControls,
            enumerable: true,
            writable: false,
            configurable: false
          }
        }
      )
    );
    class AuthorizationWrapper {
      workerDeploymentClass = reservedLiveWorkerDeploymentClass;
      controls = implementedControls;
    }

    const malformedInputs = [
      null,
      undefined,
      "production-live-campaign",
      reservedLiveWorkerDeploymentClass,
      mutableInput,
      Object.freeze({}),
      Object.freeze({
        workerDeploymentClass: reservedLiveWorkerDeploymentClass
      }),
      Object.freeze({
        workerDeploymentClass: reservedLiveWorkerDeploymentClass,
        controls: null
      }),
      Object.freeze({
        workerDeploymentClass: reservedLiveWorkerDeploymentClass,
        controls: undefined
      }),
      Object.freeze({
        workerDeploymentClass: reservedLiveWorkerDeploymentClass,
        controls: implementedControls,
        reviewerBypass: true
      }),
      hiddenExtraFieldInput,
      symbolExtraFieldInput,
      nullPrototypeInput,
      inheritedFieldInput,
      inheritedExtraFieldInput,
      Object.freeze(new AuthorizationWrapper()),
      accessorBackedInput,
      descriptorThrowingInput
    ];

    for (const input of malformedInputs) {
      expect(() =>
        liveWorkerDeploymentClassIsAuthorized(
          input as Parameters<typeof liveWorkerDeploymentClassIsAuthorized>[0]
        )
      ).not.toThrow();
      expect(
        liveWorkerDeploymentClassIsAuthorized(
          input as Parameters<typeof liveWorkerDeploymentClassIsAuthorized>[0]
        )
      ).toBe(false);
    }
  });

  it("rejects authorization wrapper proxy reflection traps without throwing", () => {
    const implementedControls = implementedFrozenControls();
    const prototypeThrowingInput = new Proxy(
      {
        workerDeploymentClass: reservedLiveWorkerDeploymentClass,
        controls: implementedControls
      },
      {
        getPrototypeOf: () => {
          throw new Error("authorization input prototype trap must not escape");
        }
      }
    );
    const keysThrowingInput = new Proxy(
      {
        workerDeploymentClass: reservedLiveWorkerDeploymentClass,
        controls: implementedControls
      },
      {
        ownKeys: () => {
          throw new Error("authorization input ownKeys trap must not escape");
        }
      }
    );
    const frozenStateThrowingInput = new Proxy(
      {
        workerDeploymentClass: reservedLiveWorkerDeploymentClass,
        controls: implementedControls
      },
      {
        isExtensible: () => {
          throw new Error("authorization input frozen-state trap must not escape");
        }
      }
    );

    for (const input of [prototypeThrowingInput, keysThrowingInput, frozenStateThrowingInput]) {
      expect(() =>
        liveWorkerDeploymentClassIsAuthorized(
          input as Parameters<typeof liveWorkerDeploymentClassIsAuthorized>[0]
        )
      ).not.toThrow();
      expect(
        liveWorkerDeploymentClassIsAuthorized(
          input as Parameters<typeof liveWorkerDeploymentClassIsAuthorized>[0]
        )
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
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(
          reservedLiveWorkerDeploymentClass,
          Object.freeze([
            Object.freeze({
              id: "deploy-environment-allowlist",
              status: "implemented",
              requirement: "Only one implemented control is not enough to authorize live worker execution."
            })
          ])
        )
      )
    ).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper("production-live", implementedFrozenControls())
      )
    ).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, implementedFrozenControls())
      )
    ).toBe(true);
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
  });
});
