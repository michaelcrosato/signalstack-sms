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
    const hiddenSymbolFieldControls = [...implementedControls];
    Object.defineProperty(hiddenSymbolFieldControls, Symbol("hidden-live-worker-array-bypass"), {
      value: true,
      enumerable: false
    });
    Object.freeze(hiddenSymbolFieldControls);
    const accessorIndexControls = [...implementedControls];
    Object.defineProperty(accessorIndexControls, "0", {
      enumerable: true,
      configurable: false,
      get: () => {
        throw new Error("control array index getter must not be read");
      }
    });
    Object.freeze(accessorIndexControls);
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
    expect(liveWorkerControlArrayExposesOnlyIndexedEntries(hiddenSymbolFieldControls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(hiddenSymbolFieldControls)).toBe(false);
    expect(() => liveWorkerControlArrayExposesOnlyIndexedEntries(accessorIndexControls)).not.toThrow();
    expect(() => liveWorkerControlsAreImplemented(accessorIndexControls)).not.toThrow();
    expect(liveWorkerControlArrayExposesOnlyIndexedEntries(accessorIndexControls)).toBe(false);
    expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(accessorIndexControls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(accessorIndexControls)).toBe(false);
    expect(liveWorkerControlArrayExposesOnlyIndexedEntries(nonEnumerableIndexControls)).toBe(false);
    expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(nonEnumerableIndexControls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(nonEnumerableIndexControls)).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, accessorIndexControls)
      )
    ).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, nonEnumerableIndexControls)
      )
    ).toBe(false);
  });

  it("rejects hidden string and symbol metadata on control arrays before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const hiddenStringMetadataControls = [...implementedControls];
    Object.defineProperty(hiddenStringMetadataControls, "reviewerBypass", {
      value: "unsafe",
      enumerable: false
    });
    Object.freeze(hiddenStringMetadataControls);
    const hiddenSymbolMetadataControls = [...implementedControls];
    Object.defineProperty(hiddenSymbolMetadataControls, Symbol("hidden-live-worker-array-bypass"), {
      value: "unsafe",
      enumerable: false
    });
    Object.freeze(hiddenSymbolMetadataControls);

    for (const controls of [hiddenStringMetadataControls, hiddenSymbolMetadataControls]) {
      expect(Object.isFrozen(controls)).toBe(true);
      expect(liveWorkerControlsAreFrozen(controls)).toBe(true);
      expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(controls)).toBe(true);
      expect(liveWorkerControlsExposeOnlyPublicFields(controls)).toBe(true);
      expect(liveWorkerControlsUseSupportedStatuses(controls)).toBe(true);
      expect(liveWorkerControlIdsMatchRequiredChecklist(controls)).toBe(true);
      expect(liveWorkerControlArrayExposesOnlyIndexedEntries(controls)).toBe(false);
      expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
      expect(
        liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
      ).toBe(false);
    }
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

  it("rejects tampered control-array prototypes before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const customPrototypeControls = [...implementedControls];
    Object.setPrototypeOf(customPrototypeControls, {
      reviewerBypass() {
        return true;
      }
    });
    Object.freeze(customPrototypeControls);
    const nullPrototypeControls = [...implementedControls];
    Object.setPrototypeOf(nullPrototypeControls, null);
    Object.freeze(nullPrototypeControls);

    for (const target of [customPrototypeControls, nullPrototypeControls]) {
      const controls = new Proxy(target, {
        get: () => {
          throw new Error("tampered control-array prototypes must deny before get traps run");
        },
        getOwnPropertyDescriptor: () => {
          throw new Error("tampered control-array prototypes must deny before indexed descriptors are inspected");
        },
        ownKeys: () => {
          throw new Error("tampered control-array prototypes must deny before reflected keys are inspected");
        }
      });

      expect(Array.isArray(controls)).toBe(true);
      expect(() => liveWorkerControlArrayExposesOnlyIndexedEntries(controls)).not.toThrow();
      expect(() => liveWorkerControlsAreFrozen(controls)).not.toThrow();
      expect(() => liveWorkerControlsAreImplemented(controls)).not.toThrow();
      expect(liveWorkerControlArrayExposesOnlyIndexedEntries(controls)).toBe(false);
      expect(liveWorkerControlsAreFrozen(controls)).toBe(false);
      expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
      expect(
        liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
      ).toBe(false);
    }
  });

  it("rejects inherited control-array index slots without reading prototype getters", () => {
    const implementedControls = implementedFrozenControls();
    const sparseControls = [...implementedControls];
    delete sparseControls[0];
    Object.freeze(sparseControls);
    const originalDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, "0");

    try {
      Object.defineProperty(Array.prototype, "0", {
        configurable: true,
        enumerable: true,
        get: () => {
          throw new Error("inherited control array index getter must not be read");
        }
      });

      expect(() => liveWorkerControlArrayExposesOnlyIndexedEntries(sparseControls)).not.toThrow();
      expect(() => liveWorkerControlsAreImplemented(sparseControls)).not.toThrow();
      expect(liveWorkerControlArrayExposesOnlyIndexedEntries(sparseControls)).toBe(false);
      expect(liveWorkerControlsAreImplemented(sparseControls)).toBe(false);
      expect(
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, sparseControls)
        )
      ).toBe(false);
    } finally {
      if (originalDescriptor === undefined) {
        delete Array.prototype[0];
      } else {
        Object.defineProperty(Array.prototype, "0", originalDescriptor);
      }
    }
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

  it("rejects writable or configurable indexed control-array descriptors before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const writableIndexControls = [...implementedControls];
    Object.defineProperty(writableIndexControls, "0", {
      value: implementedControls[0],
      enumerable: true,
      writable: true,
      configurable: false
    });
    Object.preventExtensions(writableIndexControls);

    const configurableIndexControls = [...implementedControls];
    Object.defineProperty(configurableIndexControls, "0", {
      value: implementedControls[0],
      enumerable: true,
      writable: false,
      configurable: true
    });
    Object.preventExtensions(configurableIndexControls);

    for (const controls of [writableIndexControls, configurableIndexControls]) {
      expect(liveWorkerControlArrayExposesOnlyIndexedEntries(controls)).toBe(true);
      expect(liveWorkerControlsExposeOnlyPublicFields(controls)).toBe(true);
      expect(liveWorkerControlsUseSupportedStatuses(controls)).toBe(true);
      expect(liveWorkerControlIdsMatchRequiredChecklist(controls)).toBe(true);
      expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(controls)).toBe(false);
      expect(liveWorkerControlsAreFrozen(controls)).toBe(false);
      expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
      expect(
        liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
      ).toBe(false);
    }
  });

  it("rejects non-enumerable indexed control-array descriptors before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const nonEnumerableIndexControls = [...implementedControls];
    Object.defineProperty(nonEnumerableIndexControls, "0", {
      value: implementedControls[0],
      enumerable: false,
      writable: false,
      configurable: false
    });
    Object.preventExtensions(nonEnumerableIndexControls);

    expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(nonEnumerableIndexControls)).toBe(false);
    expect(liveWorkerControlArrayExposesOnlyIndexedEntries(nonEnumerableIndexControls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(nonEnumerableIndexControls)).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, nonEnumerableIndexControls)
      )
    ).toBe(false);
  });

  it("rejects proxy-invalid indexed control-array descriptors without throwing", () => {
    const implementedControls = implementedFrozenControls();
    const invalidIndexedDescriptorControls = new Proxy(implementedControls, {
      getOwnPropertyDescriptor: (target, property) => {
        if (property === "0") {
          return {
            value: implementedControls[0],
            enumerable: true,
            writable: true,
            configurable: true
          };
        }

        return Reflect.getOwnPropertyDescriptor(target, property);
      }
    });

    expect(() => liveWorkerControlArrayExposesOnlyIndexedEntries(invalidIndexedDescriptorControls)).not.toThrow();
    expect(() => liveWorkerControlEvidenceUsesFrozenDataDescriptors(invalidIndexedDescriptorControls)).not.toThrow();
    expect(() => liveWorkerControlsAreImplemented(invalidIndexedDescriptorControls)).not.toThrow();
    expect(liveWorkerControlArrayExposesOnlyIndexedEntries(invalidIndexedDescriptorControls)).toBe(false);
    expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(invalidIndexedDescriptorControls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(invalidIndexedDescriptorControls)).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, invalidIndexedDescriptorControls)
      )
    ).toBe(false);
  });

  it("rejects writable control-array length descriptors before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const writableLengthControls = [...implementedControls];
    Object.preventExtensions(writableLengthControls);

    expect(Object.getOwnPropertyDescriptor(writableLengthControls, "length")).toMatchObject({
      enumerable: false,
      writable: true,
      configurable: false
    });
    expect(liveWorkerControlArrayExposesOnlyIndexedEntries(writableLengthControls)).toBe(true);
    expect(liveWorkerControlsExposeOnlyPublicFields(writableLengthControls)).toBe(true);
    expect(liveWorkerControlsUseSupportedStatuses(writableLengthControls)).toBe(true);
    expect(liveWorkerControlIdsMatchRequiredChecklist(writableLengthControls)).toBe(true);
    expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(writableLengthControls)).toBe(false);
    expect(liveWorkerControlsAreFrozen(writableLengthControls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(writableLengthControls)).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, writableLengthControls)
      )
    ).toBe(false);
  });

  it("rejects non-primitive control-array length descriptor values without coercion", () => {
    const implementedControls = implementedFrozenControls();
    const hostileLengthValue = {
      [Symbol.toPrimitive]: () => {
        throw new Error("control array length descriptor primitive conversion must not run");
      },
      valueOf: () => {
        throw new Error("control array length descriptor value must not be coerced");
      },
      toString: () => {
        throw new Error("control array length descriptor value must not be stringified");
      }
    };
    const boxedLengthValue = Object.freeze(new Number(implementedControls.length));

    for (const lengthValue of [hostileLengthValue, boxedLengthValue]) {
      const hostileLengthControls = new Proxy([...implementedControls], {
        getOwnPropertyDescriptor: (_target, property) => {
          if (property === "length") {
            return {
              value: lengthValue,
              enumerable: false,
              writable: false,
              configurable: false
            };
          }

          if (property === "0") {
            throw new Error("invalid length evidence must deny before reading indexed controls");
          }

          return Reflect.getOwnPropertyDescriptor(_target, property);
        }
      });

      expect(() => liveWorkerControlArrayExposesOnlyIndexedEntries(hostileLengthControls)).not.toThrow();
      expect(() => liveWorkerControlEvidenceUsesFrozenDataDescriptors(hostileLengthControls)).not.toThrow();
      expect(() => liveWorkerControlsAreImplemented(hostileLengthControls)).not.toThrow();
      expect(liveWorkerControlArrayExposesOnlyIndexedEntries(hostileLengthControls)).toBe(false);
      expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(hostileLengthControls)).toBe(false);
      expect(liveWorkerControlsAreImplemented(hostileLengthControls)).toBe(false);
      expect(
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, hostileLengthControls)
        )
      ).toBe(false);
    }
  });

  it("rejects malformed primitive control-array length descriptor values before indexed reads", () => {
    const implementedControls = implementedFrozenControls();
    const malformedLengthValues = [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "11",
      true,
      11n,
      Symbol("unsafe-live-worker-control-length")
    ];

    for (const lengthValue of malformedLengthValues) {
      const malformedLengthControls = new Proxy([...implementedControls], {
        getOwnPropertyDescriptor: (target, property) => {
          if (property === "length") {
            return {
              value: lengthValue,
              enumerable: false,
              writable: false,
              configurable: false
            };
          }

          if (property === "0") {
            throw new Error("malformed primitive length evidence must deny before reading indexed controls");
          }

          return Reflect.getOwnPropertyDescriptor(target, property);
        }
      });

      expect(() => liveWorkerControlArrayExposesOnlyIndexedEntries(malformedLengthControls)).not.toThrow();
      expect(() => liveWorkerControlEvidenceUsesFrozenDataDescriptors(malformedLengthControls)).not.toThrow();
      expect(() => liveWorkerControlsAreImplemented(malformedLengthControls)).not.toThrow();
      expect(liveWorkerControlArrayExposesOnlyIndexedEntries(malformedLengthControls)).toBe(false);
      expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(malformedLengthControls)).toBe(false);
      expect(liveWorkerControlsAreImplemented(malformedLengthControls)).toBe(false);
      expect(
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, malformedLengthControls)
        )
      ).toBe(false);
    }
  });

  it("rejects nullish control-array length descriptor values before indexed reads", () => {
    const implementedControls = implementedFrozenControls();

    for (const lengthValue of [null, undefined]) {
      const nullishLengthControls = new Proxy([...implementedControls], {
        getOwnPropertyDescriptor: (target, property) => {
          if (property === "length") {
            return {
              value: lengthValue,
              enumerable: false,
              writable: false,
              configurable: false
            };
          }

          if (property === "0") {
            throw new Error("nullish length evidence must deny before reading indexed controls");
          }

          return Reflect.getOwnPropertyDescriptor(target, property);
        }
      });

      expect(() => liveWorkerControlArrayExposesOnlyIndexedEntries(nullishLengthControls)).not.toThrow();
      expect(() => liveWorkerControlEvidenceUsesFrozenDataDescriptors(nullishLengthControls)).not.toThrow();
      expect(() => liveWorkerControlsAreImplemented(nullishLengthControls)).not.toThrow();
      expect(liveWorkerControlArrayExposesOnlyIndexedEntries(nullishLengthControls)).toBe(false);
      expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(nullishLengthControls)).toBe(false);
      expect(liveWorkerControlsAreImplemented(nullishLengthControls)).toBe(false);
      expect(
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, nullishLengthControls)
        )
      ).toBe(false);
    }
  });

  it("rejects missing or accessor-backed control-array length descriptors before indexed reads", () => {
    const implementedControls = implementedFrozenControls();
    const malformedLengthDescriptorControls = [
      new Proxy([...implementedControls], {
        getOwnPropertyDescriptor: (target, property) => {
          if (property === "length") {
            return undefined;
          }

          if (property === "0") {
            throw new Error("missing length evidence must deny before reading indexed controls");
          }

          return Reflect.getOwnPropertyDescriptor(target, property);
        }
      }),
      new Proxy([...implementedControls], {
        getOwnPropertyDescriptor: (target, property) => {
          if (property === "length") {
            return {
              enumerable: false,
              configurable: false,
              get: () => {
                throw new Error("accessor length evidence must not be read");
              }
            };
          }

          if (property === "0") {
            throw new Error("accessor length evidence must deny before reading indexed controls");
          }

          return Reflect.getOwnPropertyDescriptor(target, property);
        }
      }),
      new Proxy([...implementedControls], {
        getOwnPropertyDescriptor: (target, property) => {
          if (property === "length") {
            return {
              value: implementedControls.length,
              enumerable: false,
              writable: false,
              configurable: true
            };
          }

          if (property === "0") {
            throw new Error("invalid configurable length evidence must deny before reading indexed controls");
          }

          return Reflect.getOwnPropertyDescriptor(target, property);
        }
      }),
      new Proxy([...implementedControls], {
        getOwnPropertyDescriptor: (target, property) => {
          if (property === "length") {
            return {
              value: implementedControls.length,
              enumerable: true,
              writable: false,
              configurable: false
            };
          }

          if (property === "0") {
            throw new Error("invalid enumerable length evidence must deny before reading indexed controls");
          }

          return Reflect.getOwnPropertyDescriptor(target, property);
        }
      })
    ];

    for (const controls of malformedLengthDescriptorControls) {
      expect(() => liveWorkerControlArrayExposesOnlyIndexedEntries(controls)).not.toThrow();
      expect(() => liveWorkerControlEvidenceUsesFrozenDataDescriptors(controls)).not.toThrow();
      expect(() => liveWorkerControlsAreImplemented(controls)).not.toThrow();
      expect(liveWorkerControlArrayExposesOnlyIndexedEntries(controls)).toBe(false);
      expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(controls)).toBe(false);
      expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
      expect(
        liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
      ).toBe(false);
    }
  });

  it("rejects mismatched safe-integer control-array length descriptors before indexed reads", () => {
    const implementedControls = implementedFrozenControls();
    const mismatchedLengthValues = [
      0,
      implementedControls.length - 1,
      implementedControls.length + 1,
      Number.MAX_SAFE_INTEGER
    ];

    for (const lengthValue of mismatchedLengthValues) {
      const mismatchedLengthControls = new Proxy([...implementedControls], {
        getOwnPropertyDescriptor: (target, property) => {
          if (property === "length") {
            return {
              value: lengthValue,
              enumerable: false,
              writable: false,
              configurable: false
            };
          }

          if (property === "0") {
            throw new Error("mismatched length evidence must deny before trusting indexed controls");
          }

          return Reflect.getOwnPropertyDescriptor(target, property);
        }
      });

      expect(() => liveWorkerControlArrayExposesOnlyIndexedEntries(mismatchedLengthControls)).not.toThrow();
      expect(() => liveWorkerControlEvidenceUsesFrozenDataDescriptors(mismatchedLengthControls)).not.toThrow();
      expect(() => liveWorkerControlsAreImplemented(mismatchedLengthControls)).not.toThrow();
      expect(liveWorkerControlArrayExposesOnlyIndexedEntries(mismatchedLengthControls)).toBe(false);
      expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(mismatchedLengthControls)).toBe(false);
      expect(liveWorkerControlsAreImplemented(mismatchedLengthControls)).toBe(false);
      expect(
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, mismatchedLengthControls)
        )
      ).toBe(false);
    }
  });

  it("rejects control arrays with non-public fields before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const symbolField = Symbol("unsafe-live-worker-field");
    const hiddenSymbolField = Symbol("hidden-unsafe-live-worker-field");
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
    const nonEnumerableSymbolField = Object.freeze(
      Object.defineProperty(
        {
          ...implementedControls[0]
        },
        hiddenSymbolField,
        {
          value: "unsafe",
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
    expect(
      liveWorkerControlsAreImplemented(
        Object.freeze(
          implementedControls.map((control, index) =>
            index === 0 ? nonEnumerableSymbolField : Object.freeze({ ...control })
          )
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

  it("rejects non-primitive control public-field values without coercion", () => {
    const implementedControls = implementedFrozenControls();
    const hostileValue = Object.freeze({
      [Symbol.toPrimitive]: () => {
        throw new Error("control public-field values must not be coerced");
      },
      toString: () => {
        throw new Error("control public-field values must not be stringified");
      },
      valueOf: () => {
        throw new Error("control public-field values must not use valueOf");
      }
    });
    const malformedControls = [
      Object.freeze({
        id: hostileValue,
        status: "implemented" as const,
        requirement: implementedControls[0].requirement
      }),
      Object.freeze({
        id: Object.freeze(new String(implementedControls[0].id)) as unknown as string,
        status: "implemented" as const,
        requirement: implementedControls[0].requirement
      }),
      Object.freeze({
        id: implementedControls[0].id,
        status: Object.freeze(new String("implemented")) as LiveWorkerControl["status"],
        requirement: implementedControls[0].requirement
      }),
      Object.freeze({
        id: implementedControls[0].id,
        status: "implemented" as const,
        requirement: hostileValue
      }),
      Object.freeze({
        id: implementedControls[0].id,
        status: "implemented" as const,
        requirement: Object.freeze(new String(implementedControls[0].requirement)) as unknown as string
      })
    ];

    for (const malformedControl of malformedControls) {
      const controls = Object.freeze(
        implementedControls.map((control, index) => (index === 0 ? malformedControl : Object.freeze({ ...control })))
      );

      expect(() => liveWorkerControlIdsMatchRequiredChecklist(controls)).not.toThrow();
      expect(() => liveWorkerControlsUseSupportedStatuses(controls)).not.toThrow();
      expect(() => liveWorkerControlsAreImplemented(controls)).not.toThrow();
      expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
      expect(
        liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
      ).toBe(false);
    }
  });

  it("rejects malformed primitive control public-field values before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const malformedControls = [
      Object.freeze({
        id: 42 as unknown as string,
        status: "implemented" as const,
        requirement: implementedControls[0].requirement
      }),
      Object.freeze({
        id: Symbol("deploy-environment-allowlist") as unknown as string,
        status: "implemented" as const,
        requirement: implementedControls[0].requirement
      }),
      Object.freeze({
        id: implementedControls[0].id,
        status: "implemented" as const,
        requirement: true as unknown as string
      }),
      Object.freeze({
        id: implementedControls[0].id,
        status: "implemented" as const,
        requirement: 11n as unknown as string
      })
    ];

    for (const malformedControl of malformedControls) {
      const controls = Object.freeze(
        implementedControls.map((control, index) => (index === 0 ? malformedControl : Object.freeze({ ...control })))
      );

      expect(() => liveWorkerControlIdsMatchRequiredChecklist(controls)).not.toThrow();
      expect(() => liveWorkerControlsUseSupportedStatuses(controls)).not.toThrow();
      expect(() => liveWorkerControlsAreImplemented(controls)).not.toThrow();
      expect(liveWorkerControlsExposeOnlyPublicFields(controls)).toBe(true);
      expect(liveWorkerControlsUseSupportedStatuses(controls)).toBe(true);
      expect(liveWorkerControlIdsMatchRequiredChecklist(controls)).toBe(false);
      expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
      expect(
        liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
      ).toBe(false);
    }
  });

  it("rejects malformed primitive control status values before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const malformedControls = [
      Object.freeze({
        id: implementedControls[0].id,
        status: false as unknown as LiveWorkerControl["status"],
        requirement: implementedControls[0].requirement
      }),
      Object.freeze({
        id: implementedControls[0].id,
        status: 1n as unknown as LiveWorkerControl["status"],
        requirement: implementedControls[0].requirement
      }),
      Object.freeze({
        id: implementedControls[0].id,
        status: Symbol("implemented") as unknown as LiveWorkerControl["status"],
        requirement: implementedControls[0].requirement
      })
    ];

    for (const malformedControl of malformedControls) {
      const controls = Object.freeze(
        implementedControls.map((control, index) => (index === 0 ? malformedControl : Object.freeze({ ...control })))
      );

      expect(() => liveWorkerControlIdsMatchRequiredChecklist(controls)).not.toThrow();
      expect(() => liveWorkerControlsUseSupportedStatuses(controls)).not.toThrow();
      expect(() => liveWorkerControlsAreImplemented(controls)).not.toThrow();
      expect(liveWorkerControlsExposeOnlyPublicFields(controls)).toBe(true);
      expect(liveWorkerControlIdsMatchRequiredChecklist(controls)).toBe(true);
      expect(liveWorkerControlsUseSupportedStatuses(controls)).toBe(false);
      expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
      expect(
        liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
      ).toBe(false);
    }
  });

  it("rejects nullish control public-field values before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const malformedControls = [
      Object.freeze({
        id: null as unknown as string,
        status: "implemented" as const,
        requirement: implementedControls[0].requirement
      }),
      Object.freeze({
        id: undefined as unknown as string,
        status: "implemented" as const,
        requirement: implementedControls[0].requirement
      }),
      Object.freeze({
        id: implementedControls[0].id,
        status: null as unknown as LiveWorkerControl["status"],
        requirement: implementedControls[0].requirement
      }),
      Object.freeze({
        id: implementedControls[0].id,
        status: undefined as unknown as LiveWorkerControl["status"],
        requirement: implementedControls[0].requirement
      }),
      Object.freeze({
        id: implementedControls[0].id,
        status: "implemented" as const,
        requirement: null as unknown as string
      }),
      Object.freeze({
        id: implementedControls[0].id,
        status: "implemented" as const,
        requirement: undefined as unknown as string
      })
    ];

    for (const malformedControl of malformedControls) {
      const controls = Object.freeze(
        implementedControls.map((control, index) => (index === 0 ? malformedControl : Object.freeze({ ...control })))
      );

      expect(() => liveWorkerControlIdsMatchRequiredChecklist(controls)).not.toThrow();
      expect(() => liveWorkerControlsUseSupportedStatuses(controls)).not.toThrow();
      expect(() => liveWorkerControlsAreImplemented(controls)).not.toThrow();
      expect(liveWorkerControlsExposeOnlyPublicFields(controls)).toBe(true);
      expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
      expect(
        liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
      ).toBe(false);
    }
  });

  it("does not normalize control public strings before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const stringDriftControls = [
      Object.freeze({
        id: ` ${implementedControls[0].id}`,
        status: "implemented" as const,
        requirement: implementedControls[0].requirement
      }),
      Object.freeze({
        id: implementedControls[0].id.toUpperCase(),
        status: "implemented" as const,
        requirement: implementedControls[0].requirement
      }),
      Object.freeze({
        id: implementedControls[0].id,
        status: " implemented " as LiveWorkerControl["status"],
        requirement: implementedControls[0].requirement
      }),
      Object.freeze({
        id: implementedControls[0].id,
        status: "IMPLEMENTED" as LiveWorkerControl["status"],
        requirement: implementedControls[0].requirement
      }),
      Object.freeze({
        id: implementedControls[0].id,
        status: "implemented" as const,
        requirement: `${implementedControls[0].requirement} `
      }),
      Object.freeze({
        id: implementedControls[0].id,
        status: "implemented" as const,
        requirement: implementedControls[0].requirement.toUpperCase()
      })
    ];

    for (const driftedControl of stringDriftControls) {
      const controls = Object.freeze(
        implementedControls.map((control, index) => (index === 0 ? driftedControl : Object.freeze({ ...control })))
      );

      expect(liveWorkerControlsExposeOnlyPublicFields(controls)).toBe(true);
      expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(controls)).toBe(true);
      expect(liveWorkerControlIdsMatchRequiredChecklist(controls)).toBe(
        driftedControl.id === implementedControls[0].id && driftedControl.requirement === implementedControls[0].requirement
      );
      expect(liveWorkerControlsUseSupportedStatuses(controls)).toBe(driftedControl.status === "implemented");
      expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
      expect(
        liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
      ).toBe(false);
    }
  });

  it("rejects hidden string metadata on control entries before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const hiddenMetadataControl = Object.freeze(
      Object.defineProperty(
        {
          ...implementedControls[0]
        },
        "reviewerBypass",
        {
          value: "unsafe",
          enumerable: false
        }
      )
    );
    const controls = Object.freeze(
      implementedControls.map((control, index) =>
        index === 0 ? hiddenMetadataControl : Object.freeze({ ...control })
      )
    );

    expect(Object.isFrozen(hiddenMetadataControl)).toBe(true);
    expect(liveWorkerControlIdsMatchRequiredChecklist(controls)).toBe(true);
    expect(liveWorkerControlsUseSupportedStatuses(controls)).toBe(true);
    expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(controls)).toBe(true);
    expect(liveWorkerControlsExposeOnlyPublicFields(controls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
    expect(() =>
      liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
    ).not.toThrow();
    expect(
      liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
    ).toBe(false);
  });

  it("rejects hidden symbol metadata on control entries before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const hiddenMetadataControl = Object.freeze(
      Object.defineProperty(
        {
          ...implementedControls[0]
        },
        Symbol("hidden-live-worker-control-bypass"),
        {
          value: "unsafe",
          enumerable: false
        }
      )
    );
    const controls = Object.freeze(
      implementedControls.map((control, index) =>
        index === 0 ? hiddenMetadataControl : Object.freeze({ ...control })
      )
    );

    expect(Object.isFrozen(hiddenMetadataControl)).toBe(true);
    expect(liveWorkerControlIdsMatchRequiredChecklist(controls)).toBe(true);
    expect(liveWorkerControlsUseSupportedStatuses(controls)).toBe(true);
    expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(controls)).toBe(true);
    expect(liveWorkerControlsExposeOnlyPublicFields(controls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
    expect(() =>
      liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
    ).not.toThrow();
    expect(
      liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
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
    const hiddenRequiredFieldControls = (["id", "status", "requirement"] as const).map((hiddenField) =>
      Object.freeze(
        Object.defineProperties(
          {},
          {
            id: {
              value: implementedControls[0].id,
              enumerable: hiddenField !== "id"
            },
            status: {
              value: "implemented",
              enumerable: hiddenField !== "status"
            },
            requirement: {
              value: implementedControls[0].requirement,
              enumerable: hiddenField !== "requirement"
            }
          }
        )
      ) as LiveWorkerControl
    );

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
    for (const hiddenRequiredFieldControl of hiddenRequiredFieldControls) {
      const controls = Object.freeze(
        implementedControls.map((control, index) =>
          index === 0 ? hiddenRequiredFieldControl : Object.freeze({ ...control })
        )
      );

      expect(liveWorkerControlsExposeOnlyPublicFields(controls)).toBe(false);
      expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
      expect(
        liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
      ).toBe(false);
    }
  });

  it("rejects sealed but writable control entries before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const sealedWritableControl = Object.seal({
      id: implementedControls[0].id,
      status: "implemented" as const,
      requirement: implementedControls[0].requirement
    }) as LiveWorkerControl;
    const controls = Object.freeze(
      implementedControls.map((control, index) => (index === 0 ? sealedWritableControl : Object.freeze({ ...control })))
    );

    expect(Object.isSealed(sealedWritableControl)).toBe(true);
    expect(Object.isFrozen(sealedWritableControl)).toBe(false);
    expect(liveWorkerControlsExposeOnlyPublicFields(controls)).toBe(true);
    expect(liveWorkerControlIdsMatchRequiredChecklist(controls)).toBe(true);
    expect(liveWorkerControlsUseSupportedStatuses(controls)).toBe(true);
    expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(controls)).toBe(false);
    expect(liveWorkerControlsAreFrozen(controls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
    ).toBe(false);
  });

  it("rejects configurable control-entry public fields before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const configurableFieldControl = Object.defineProperties(
      {},
      {
        id: {
          value: implementedControls[0].id,
          enumerable: true,
          writable: false,
          configurable: true
        },
        status: {
          value: "implemented",
          enumerable: true,
          writable: false,
          configurable: false
        },
        requirement: {
          value: implementedControls[0].requirement,
          enumerable: true,
          writable: false,
          configurable: false
        }
      }
    ) as LiveWorkerControl;
    Object.preventExtensions(configurableFieldControl);
    const controls = Object.freeze(
      implementedControls.map((control, index) =>
        index === 0 ? configurableFieldControl : Object.freeze({ ...control })
      )
    );

    expect(Object.isExtensible(configurableFieldControl)).toBe(false);
    expect(Object.isFrozen(configurableFieldControl)).toBe(false);
    expect(liveWorkerControlsExposeOnlyPublicFields(controls)).toBe(true);
    expect(liveWorkerControlIdsMatchRequiredChecklist(controls)).toBe(true);
    expect(liveWorkerControlsUseSupportedStatuses(controls)).toBe(true);
    expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(controls)).toBe(false);
    expect(liveWorkerControlsAreFrozen(controls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
    ).toBe(false);
  });

  it("requires live-worker control public fields in exact order", () => {
    const implementedControls = implementedFrozenControls();
    const reorderedFieldControl = Object.freeze({
      status: "implemented" as const,
      id: implementedControls[0].id,
      requirement: implementedControls[0].requirement
    });
    const controls = Object.freeze(
      implementedControls.map((control, index) => (index === 0 ? reorderedFieldControl : Object.freeze({ ...control })))
    );

    expect(liveWorkerControlsExposeOnlyPublicFields(implementedControls)).toBe(true);
    expect(liveWorkerControlIdsMatchRequiredChecklist(controls)).toBe(true);
    expect(liveWorkerControlsUseSupportedStatuses(controls)).toBe(true);
    expect(liveWorkerControlsExposeOnlyPublicFields(controls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
    ).toBe(false);
  });

  it("rejects duplicate reflected control-entry keys without throwing", () => {
    const implementedControls = implementedFrozenControls();
    const duplicateKeyControl = new Proxy(Object.freeze({ ...implementedControls[0] }), {
      ownKeys: () => ["id", "id", "status", "requirement"]
    });
    const controls = Object.freeze(
      implementedControls.map((control, index) => (index === 0 ? duplicateKeyControl : Object.freeze({ ...control })))
    );

    expect(() => liveWorkerControlsExposeOnlyPublicFields(controls)).not.toThrow();
    expect(() => liveWorkerControlsAreImplemented(controls)).not.toThrow();
    expect(liveWorkerControlsExposeOnlyPublicFields(controls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
    ).toBe(false);
  });

  it("rejects proxy-invalid control-entry field descriptors without throwing", () => {
    const implementedControls = implementedFrozenControls();
    const invalidDescriptorControl = new Proxy(Object.freeze({ ...implementedControls[0] }), {
      getOwnPropertyDescriptor: (target, property) => {
        if (property === "id") {
          return {
            value: implementedControls[0].id,
            enumerable: true,
            writable: true,
            configurable: true
          };
        }

        return Reflect.getOwnPropertyDescriptor(target, property);
      }
    });
    const controls = Object.freeze(
      implementedControls.map((control, index) =>
        index === 0 ? invalidDescriptorControl : Object.freeze({ ...control })
      )
    );

    expect(() => liveWorkerControlIdsMatchRequiredChecklist(controls)).not.toThrow();
    expect(() => liveWorkerControlsExposeOnlyPublicFields(controls)).not.toThrow();
    expect(() => liveWorkerControlEvidenceUsesFrozenDataDescriptors(controls)).not.toThrow();
    expect(() => liveWorkerControlsAreImplemented(controls)).not.toThrow();
    expect(liveWorkerControlIdsMatchRequiredChecklist(controls)).toBe(false);
    expect(liveWorkerControlsExposeOnlyPublicFields(controls)).toBe(false);
    expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(controls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
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

  it("does not coerce malformed controls evidence before denying authorization", () => {
    const hostileControlsEvidence = Object.freeze({
      [Symbol.toPrimitive]: () => {
        throw new Error("controls evidence must not be coerced");
      },
      toString: () => {
        throw new Error("controls evidence toString must not be called");
      },
      valueOf: () => {
        throw new Error("controls evidence valueOf must not be called");
      }
    });

    expect(() =>
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, hostileControlsEvidence)
      )
    ).not.toThrow();
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, hostileControlsEvidence)
      )
    ).toBe(false);
  });

  it("rejects proxy-backed control evidence without throwing", () => {
    const implementedControls = implementedFrozenControls();
    const throwingArrayLengthDescriptorProxy = new Proxy([...implementedControls], {
      getOwnPropertyDescriptor: (_target, property) => {
        if (property === "length") {
          throw new Error("array length descriptor trap must not escape");
        }
        return Reflect.getOwnPropertyDescriptor(_target, property);
      }
    });
    const invalidArrayLengthDescriptorProxy = new Proxy([...implementedControls], {
      getOwnPropertyDescriptor: (_target, property) => {
        if (property === "length") {
          return {
            value: "not-a-safe-length",
            enumerable: false,
            configurable: false,
            writable: false
          };
        }
        return Reflect.getOwnPropertyDescriptor(_target, property);
      }
    });
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
    const duplicateArrayKeysProxy = new Proxy(implementedControls, {
      ownKeys: () => ["0", "0", "length", ...implementedControls.slice(1).map((_, index) => String(index + 1))]
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
      throwingArrayLengthDescriptorProxy,
      invalidArrayLengthDescriptorProxy,
      throwingArrayPrototypeProxy,
      throwingArrayDescriptorProxy,
      throwingArrayKeysProxy,
      reorderedArrayKeysProxy,
      duplicateArrayKeysProxy,
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

  it("rejects revoked proxy-backed control evidence without throwing", () => {
    const implementedControls = implementedFrozenControls();
    const { proxy: revokedArrayProxy, revoke: revokeArrayProxy } = Proxy.revocable([...implementedControls], {});
    const { proxy: revokedEntryProxy, revoke: revokeEntryProxy } = Proxy.revocable({ ...implementedControls[0] }, {});

    revokeArrayProxy();
    revokeEntryProxy();

    const controlsWithRevokedEntry = Object.freeze(
      implementedControls.map((control, index) => (index === 0 ? revokedEntryProxy : Object.freeze({ ...control })))
    );

    for (const controls of [revokedArrayProxy, controlsWithRevokedEntry]) {
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

  it("does not coerce malformed deployment class values before denying authorization", () => {
    const throwingEvidence = new Proxy([...implementedFrozenControls()], {
      getPrototypeOf: () => {
        throw new Error("coerced worker classes must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("coerced worker classes must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("coerced worker classes must not inspect control evidence");
      }
    });
    const primitiveThrowingClass = Object.freeze({
      [Symbol.toPrimitive]: () => {
        throw new Error("worker deployment class must not be coerced");
      },
      toString: () => {
        throw new Error("worker deployment class toString must not be called");
      },
      valueOf: () => {
        throw new Error("worker deployment class valueOf must not be called");
      }
    });
    const stringObjectClass = Object.freeze(new String(reservedLiveWorkerDeploymentClass));

    for (const workerDeploymentClass of [primitiveThrowingClass, stringObjectClass]) {
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

  it("does not normalize deployment class strings before denying authorization", () => {
    const throwingEvidence = new Proxy([...implementedFrozenControls()], {
      getPrototypeOf: () => {
        throw new Error("normalized worker classes must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("normalized worker classes must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("normalized worker classes must not inspect control evidence");
      }
    });

    for (const workerDeploymentClass of [
      ` ${reservedLiveWorkerDeploymentClass}`,
      `${reservedLiveWorkerDeploymentClass} `,
      reservedLiveWorkerDeploymentClass.toUpperCase(),
      "Production-Live-Campaign"
    ]) {
      expect(() =>
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(workerDeploymentClass, throwingEvidence)
        )
      ).not.toThrow();
      expect(
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(workerDeploymentClass, throwingEvidence)
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
    const throwingEvidence = new Proxy(implementedControls, {
      getPrototypeOf: () => {
        throw new Error("non-frozen wrapper descriptors must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("non-frozen wrapper descriptors must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("non-frozen wrapper descriptors must not inspect control evidence");
      }
    });
    const descriptorVariants = [
      {
        name: "writable worker class",
        workerDeploymentClass: {
          value: reservedLiveWorkerDeploymentClass,
          enumerable: true,
          writable: true,
          configurable: false
        },
        controls: {
          value: throwingEvidence,
          enumerable: true,
          writable: false,
          configurable: false
        }
      },
      {
        name: "writable controls",
        workerDeploymentClass: {
          value: reservedLiveWorkerDeploymentClass,
          enumerable: true,
          writable: false,
          configurable: false
        },
        controls: {
          value: throwingEvidence,
          enumerable: true,
          writable: true,
          configurable: false
        }
      },
      {
        name: "configurable worker class",
        workerDeploymentClass: {
          value: reservedLiveWorkerDeploymentClass,
          enumerable: true,
          writable: false,
          configurable: true
        },
        controls: {
          value: throwingEvidence,
          enumerable: true,
          writable: false,
          configurable: false
        }
      },
      {
        name: "configurable controls",
        workerDeploymentClass: {
          value: reservedLiveWorkerDeploymentClass,
          enumerable: true,
          writable: false,
          configurable: false
        },
        controls: {
          value: throwingEvidence,
          enumerable: true,
          writable: false,
          configurable: true
        }
      }
    ] satisfies Array<{
      name: string;
      workerDeploymentClass: PropertyDescriptor;
      controls: PropertyDescriptor;
    }>;

    for (const variant of descriptorVariants) {
      const wrapper = Object.preventExtensions(
        Object.defineProperties(
          {},
          {
            workerDeploymentClass: variant.workerDeploymentClass,
            controls: variant.controls
          }
        )
      );

      expect(Object.isFrozen(wrapper), variant.name).toBe(false);
      expect(() => liveWorkerDeploymentClassIsAuthorized(wrapper), variant.name).not.toThrow();
      expect(liveWorkerDeploymentClassIsAuthorized(wrapper), variant.name).toBe(false);
    }
  });

  it("rejects proxy-invalid authorization wrapper field descriptors without throwing", () => {
    const throwingEvidence = new Proxy(implementedFrozenControls(), {
      getPrototypeOf: () => {
        throw new Error("invalid wrapper field descriptors must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("invalid wrapper field descriptors must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("invalid wrapper field descriptors must not inspect control evidence");
      }
    });
    const invalidWrapperDescriptorInputs = [
      new Proxy(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, throwingEvidence), {
        getOwnPropertyDescriptor: (target, property) => {
          if (property === "workerDeploymentClass") {
            return {
              value: reservedLiveWorkerDeploymentClass,
              enumerable: true,
              writable: false,
              configurable: true
            };
          }

          return Reflect.getOwnPropertyDescriptor(target, property);
        }
      }),
      new Proxy(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, throwingEvidence), {
        getOwnPropertyDescriptor: (target, property) => {
          if (property === "controls") {
            return {
              value: throwingEvidence,
              enumerable: true,
              writable: false,
              configurable: true
            };
          }

          return Reflect.getOwnPropertyDescriptor(target, property);
        }
      })
    ];

    for (const input of invalidWrapperDescriptorInputs) {
      expect(() => liveWorkerDeploymentClassIsAuthorized(input)).not.toThrow();
      expect(liveWorkerDeploymentClassIsAuthorized(input)).toBe(false);
    }
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
    const hiddenRequiredFieldInput = Object.freeze(
      Object.defineProperties(
        {},
        {
          workerDeploymentClass: {
            value: reservedLiveWorkerDeploymentClass,
            enumerable: false,
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
      hiddenRequiredFieldInput,
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

    for (const input of [prototypeThrowingInput, descriptorThrowingInput, keysThrowingInput, frozenStateThrowingInput]) {
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

  it("rejects revoked proxy-backed authorization wrappers without throwing", () => {
    const { proxy: revokedWrapper, revoke } = Proxy.revocable(
      frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, implementedFrozenControls()),
      {}
    );

    revoke();

    expect(() => liveWorkerDeploymentClassIsAuthorized(revokedWrapper)).not.toThrow();
    expect(liveWorkerDeploymentClassIsAuthorized(revokedWrapper)).toBe(false);
  });

  it("rejects malformed authorization wrapper key evidence before inspecting controls", () => {
    const throwingEvidence = new Proxy(implementedFrozenControls(), {
      getPrototypeOf: () => {
        throw new Error("malformed wrapper keys must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("malformed wrapper keys must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("malformed wrapper keys must not inspect control evidence");
      }
    });
    const baseWrapper = Object.freeze({
      workerDeploymentClass: reservedLiveWorkerDeploymentClass,
      controls: throwingEvidence
    });
    const reorderedKeyWrapper = new Proxy(baseWrapper, {
      ownKeys: () => ["controls", "workerDeploymentClass"]
    });
    const reorderedFieldWrapper = Object.freeze({
      controls: throwingEvidence,
      workerDeploymentClass: reservedLiveWorkerDeploymentClass
    });
    const extraKeyWrapper = new Proxy(baseWrapper, {
      ownKeys: () => ["workerDeploymentClass", "controls", "reviewerBypass"]
    });
    const duplicateKeyWrapper = new Proxy(baseWrapper, {
      ownKeys: () => ["workerDeploymentClass", "workerDeploymentClass", "controls"]
    });
    const hiddenExtraKeyWrapper = Object.freeze(
      Object.defineProperty(
        {
          workerDeploymentClass: reservedLiveWorkerDeploymentClass,
          controls: throwingEvidence
        },
        "reviewerBypass",
        {
          value: true,
          enumerable: false
        }
      )
    );
    const hiddenStringExtraKeyWrapper = Object.freeze(
      Object.defineProperty(
        {
          workerDeploymentClass: reservedLiveWorkerDeploymentClass,
          controls: throwingEvidence
        },
        "hiddenLiveWorkerWrapperKey",
        {
          value: true,
          enumerable: false
        }
      )
    );
    const symbolExtraKeyWrapper = Object.freeze(
      Object.assign(
        {
          workerDeploymentClass: reservedLiveWorkerDeploymentClass,
          controls: throwingEvidence
        },
        { [Symbol("unsafe-live-worker-wrapper-key")]: true }
      )
    );
    const hiddenSymbolExtraKeyWrapper = Object.freeze(
      Object.defineProperty(
        {
          workerDeploymentClass: reservedLiveWorkerDeploymentClass,
          controls: throwingEvidence
        },
        Symbol("hidden-live-worker-wrapper-key"),
        {
          value: true,
          enumerable: false
        }
      )
    );

    for (const input of [
      reorderedKeyWrapper,
      reorderedFieldWrapper,
      extraKeyWrapper,
      duplicateKeyWrapper,
      hiddenExtraKeyWrapper,
      hiddenStringExtraKeyWrapper,
      symbolExtraKeyWrapper,
      hiddenSymbolExtraKeyWrapper
    ]) {
      expect(() => liveWorkerDeploymentClassIsAuthorized(input)).not.toThrow();
      expect(liveWorkerDeploymentClassIsAuthorized(input)).toBe(false);
    }
  });

  it("rejects malformed authorization wrapper shapes before inspecting controls", () => {
    const throwingEvidence = new Proxy(implementedFrozenControls(), {
      getPrototypeOf: () => {
        throw new Error("malformed wrapper shapes must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("malformed wrapper shapes must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("malformed wrapper shapes must not inspect control evidence");
      }
    });
    const mutableWrapper = {
      workerDeploymentClass: reservedLiveWorkerDeploymentClass,
      controls: throwingEvidence
    };
    const missingControlsWrapper = Object.freeze({
      workerDeploymentClass: reservedLiveWorkerDeploymentClass
    });
    const extraFieldWrapper = Object.freeze({
      workerDeploymentClass: reservedLiveWorkerDeploymentClass,
      controls: throwingEvidence,
      reviewerBypass: true
    });
    const hiddenClassWrapper = Object.freeze(
      Object.defineProperties(
        {},
        {
          workerDeploymentClass: {
            value: reservedLiveWorkerDeploymentClass,
            enumerable: false,
            writable: false,
            configurable: false
          },
          controls: {
            value: throwingEvidence,
            enumerable: true,
            writable: false,
            configurable: false
          }
        }
      )
    );
    const hiddenControlsWrapper = Object.freeze(
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
            value: throwingEvidence,
            enumerable: false,
            writable: false,
            configurable: false
          }
        }
      )
    );
    const inheritedControlsWrapper = Object.freeze(
      Object.create(
        { controls: throwingEvidence },
        {
          workerDeploymentClass: {
            value: reservedLiveWorkerDeploymentClass,
            enumerable: true,
            writable: false,
            configurable: false
          }
        }
      )
    );
    const inheritedClassWrapper = Object.freeze(
      Object.create(
        { workerDeploymentClass: reservedLiveWorkerDeploymentClass },
        {
          controls: {
            value: throwingEvidence,
            enumerable: true,
            writable: false,
            configurable: false
          }
        }
      )
    );
    const inheritedExtraFieldWrapper = Object.freeze(
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
            value: throwingEvidence,
            enumerable: true,
            writable: false,
            configurable: false
          }
        }
      )
    );
    const inheritedAccessorClassWrapper = Object.freeze(
      Object.create(
        {
          get workerDeploymentClass() {
            throw new Error("malformed wrapper shapes must not read inherited worker class getters");
          }
        },
        {
          controls: {
            value: throwingEvidence,
            enumerable: true,
            writable: false,
            configurable: false
          }
        }
      )
    );
    const inheritedAccessorControlsWrapper = Object.freeze(
      Object.create(
        {
          get controls() {
            throw new Error("malformed wrapper shapes must not read inherited controls getters");
          }
        },
        {
          workerDeploymentClass: {
            value: reservedLiveWorkerDeploymentClass,
            enumerable: true,
            writable: false,
            configurable: false
          }
        }
      )
    );
    const accessorClassWrapper = Object.freeze(
      Object.defineProperties(
        {},
        {
          workerDeploymentClass: {
            enumerable: true,
            get: () => {
              throw new Error("malformed wrapper shapes must not read worker class getters");
            }
          },
          controls: {
            value: throwingEvidence,
            enumerable: true,
            writable: false,
            configurable: false
          }
        }
      )
    );
    const accessorControlsWrapper = Object.freeze(
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
            enumerable: true,
            get: () => {
              throw new Error("malformed wrapper shapes must not read controls getters");
            }
          }
        }
      )
    );

    for (const input of [
      mutableWrapper,
      missingControlsWrapper,
      extraFieldWrapper,
      hiddenClassWrapper,
      hiddenControlsWrapper,
      inheritedControlsWrapper,
      inheritedClassWrapper,
      inheritedExtraFieldWrapper,
      inheritedAccessorClassWrapper,
      inheritedAccessorControlsWrapper,
      accessorClassWrapper,
      accessorControlsWrapper
    ]) {
      expect(() => liveWorkerDeploymentClassIsAuthorized(input)).not.toThrow();
      expect(liveWorkerDeploymentClassIsAuthorized(input)).toBe(false);
    }
  });

  it("rejects non-ordinary authorization wrappers before inspecting controls", () => {
    const throwingEvidence = new Proxy(implementedFrozenControls(), {
      getPrototypeOf: () => {
        throw new Error("non-ordinary wrappers must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("non-ordinary wrappers must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("non-ordinary wrappers must not inspect control evidence");
      }
    });
    const nullPrototypeWrapper = Object.freeze(
      Object.assign(Object.create(null) as Record<string, unknown>, {
        workerDeploymentClass: reservedLiveWorkerDeploymentClass,
        controls: throwingEvidence
      })
    );

    class AuthorizationWrapper {
      workerDeploymentClass = reservedLiveWorkerDeploymentClass;
      controls = throwingEvidence;
    }
    const classInstanceWrapper = Object.freeze(new AuthorizationWrapper());
    const arrayWrapper = Object.freeze(
      Object.assign([], {
        workerDeploymentClass: reservedLiveWorkerDeploymentClass,
        controls: throwingEvidence
      })
    );
    const dateWrapper = Object.freeze(
      Object.assign(new Date(0), {
        workerDeploymentClass: reservedLiveWorkerDeploymentClass,
        controls: throwingEvidence
      })
    );
    const functionWrapper = Object.freeze(
      Object.assign(() => reservedLiveWorkerDeploymentClass, {
        workerDeploymentClass: reservedLiveWorkerDeploymentClass,
        controls: throwingEvidence
      })
    );

    for (const input of [nullPrototypeWrapper, classInstanceWrapper, arrayWrapper, dateWrapper, functionWrapper]) {
      expect(() => liveWorkerDeploymentClassIsAuthorized(input)).not.toThrow();
      expect(liveWorkerDeploymentClassIsAuthorized(input)).toBe(false);
    }
  });

  it("does not execute authorization wrapper get traps while denying unsupported classes", () => {
    const throwingEvidence = new Proxy(implementedFrozenControls(), {
      get: () => {
        throw new Error("control evidence get trap must not be read");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("control evidence descriptor trap must not be inspected for unsupported classes");
      },
      ownKeys: () => {
        throw new Error("control evidence keys trap must not be inspected for unsupported classes");
      }
    });
    const unsupportedClassInput = new Proxy(
      Object.freeze({
        workerDeploymentClass: "production-live",
        controls: throwingEvidence
      }),
      {
        get: () => {
          throw new Error("authorization input get trap must not be read");
        }
      }
    );

    expect(() => liveWorkerDeploymentClassIsAuthorized(unsupportedClassInput)).not.toThrow();
    expect(liveWorkerDeploymentClassIsAuthorized(unsupportedClassInput)).toBe(false);
  });

  it("does not execute authorization wrapper get traps while authorizing exact frozen evidence", () => {
    const exactClassInput = new Proxy(
      frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, implementedFrozenControls()),
      {
        get: () => {
          throw new Error("authorization input get trap must not be read");
        }
      }
    );

    expect(() => liveWorkerDeploymentClassIsAuthorized(exactClassInput)).not.toThrow();
    expect(liveWorkerDeploymentClassIsAuthorized(exactClassInput)).toBe(true);
  });

  it("does not execute control evidence get traps while authorizing exact frozen evidence", () => {
    const implementedControlsWithEntryGetTraps = Object.freeze(
      implementedFrozenControls().map(
        (control) =>
          new Proxy(control, {
            get: () => {
              throw new Error("control entry get trap must not be read");
            }
          })
      )
    );
    const implementedControlsWithArrayGetTrap = new Proxy(implementedFrozenControls(), {
      get: () => {
        throw new Error("control array get trap must not be read");
      }
    });

    expect(() => liveWorkerControlsAreImplemented(implementedControlsWithEntryGetTraps)).not.toThrow();
    expect(liveWorkerControlsAreImplemented(implementedControlsWithEntryGetTraps)).toBe(true);
    expect(() => liveWorkerControlsAreImplemented(implementedControlsWithArrayGetTrap)).not.toThrow();
    expect(liveWorkerControlsAreImplemented(implementedControlsWithArrayGetTrap)).toBe(true);
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, implementedControlsWithEntryGetTraps)
      )
    ).toBe(true);
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, implementedControlsWithArrayGetTrap)
      )
    ).toBe(true);
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
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, productionLiveCampaignWorkerControls)
      )
    ).toBe(false);
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
        frozenAuthorizationWrapper(
          reservedLiveWorkerDeploymentClass,
          Object.freeze(
            productionLiveCampaignWorkerControls.map((control, index) =>
              Object.freeze({
                ...control,
                status: index === 0 ? "implemented" : control.status
              })
            )
          )
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
