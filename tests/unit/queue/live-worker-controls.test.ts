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

  function whenSharedArrayBufferExists<T>(buildValue: () => T) {
    return typeof SharedArrayBuffer === "undefined" ? [] : [buildValue()];
  }

  function webPlatformBuiltInTargets() {
    const targets: object[] = [];

    if (typeof Blob !== "undefined") {
      targets.push(new Blob(["unsafe-controls"]));
    }

    if (typeof File !== "undefined") {
      targets.push(new File(["unsafe-controls"], "unsafe-controls.txt"));
    }

    if (typeof FormData !== "undefined") {
      targets.push(new FormData());
    }

    if (typeof Headers !== "undefined") {
      targets.push(new Headers([["x-signalstack", "unsafe-controls"]]));
    }

    if (typeof Request !== "undefined") {
      targets.push(new Request("https://signalstack.local/unsafe-controls"));
    }

    if (typeof Response !== "undefined") {
      targets.push(new Response("unsafe-controls"));
    }

    if (typeof AbortController !== "undefined") {
      targets.push(new AbortController());
      targets.push(new AbortController().signal);
    }

    if (typeof ReadableStream !== "undefined") {
      targets.push(new ReadableStream());
    }

    if (typeof WritableStream !== "undefined") {
      targets.push(new WritableStream());
    }

    if (typeof TransformStream !== "undefined") {
      targets.push(new TransformStream());
    }

    if (typeof TextEncoder !== "undefined") {
      targets.push(new TextEncoder());
    }

    if (typeof TextDecoder !== "undefined") {
      targets.push(new TextDecoder());
    }

    if (typeof TextEncoderStream !== "undefined") {
      targets.push(new TextEncoderStream());
    }

    if (typeof TextDecoderStream !== "undefined") {
      targets.push(new TextDecoderStream());
    }

    if (typeof EventTarget !== "undefined") {
      targets.push(new EventTarget());
    }

    if (typeof Event !== "undefined") {
      targets.push(new Event("unsafe-controls"));
    }

    if (typeof DOMException !== "undefined") {
      targets.push(new DOMException("unsafe-controls", "UnsafeControls"));
    }

    if (typeof MessageChannel !== "undefined") {
      const channel = new MessageChannel();
      channel.port1.close();
      channel.port2.close();
      targets.push(channel, channel.port1, channel.port2);
    }

    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("unsafe-controls");
      channel.close();
      targets.push(channel);
    }

    if (typeof CompressionStream !== "undefined") {
      targets.push(new CompressionStream("gzip"));
    }

    if (typeof DecompressionStream !== "undefined") {
      targets.push(new DecompressionStream("gzip"));
    }

    if (typeof CountQueuingStrategy !== "undefined") {
      targets.push(new CountQueuingStrategy({ highWaterMark: 1 }));
    }

    if (typeof ByteLengthQueuingStrategy !== "undefined") {
      targets.push(new ByteLengthQueuingStrategy({ highWaterMark: 1 }));
    }

    const URLPatternConstructor = (
      globalThis as typeof globalThis & {
        URLPattern?: new (init: { pathname: string }) => object;
      }
    ).URLPattern;

    if (URLPatternConstructor !== undefined) {
      targets.push(new URLPatternConstructor({ pathname: "/unsafe-controls" }));
    }

    if (typeof PerformanceObserver !== "undefined") {
      const observer = new PerformanceObserver(() => undefined);
      observer.disconnect();
      targets.push(observer);
    }

    return targets;
  }

  function webAssemblyBuiltInTargets() {
    const targets: object[] = [];

    if (typeof WebAssembly === "undefined") {
      return targets;
    }

    try {
      targets.push(new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])));
    } catch {
      // Runtime support varies; skip unsupported WebAssembly constructors.
    }

    try {
      targets.push(new WebAssembly.Memory({ initial: 1 }));
    } catch {
      // Runtime support varies; skip unsupported WebAssembly constructors.
    }

    try {
      targets.push(new WebAssembly.Global({ value: "i32", mutable: false }, 0));
    } catch {
      // Runtime support varies; skip unsupported WebAssembly constructors.
    }

    try {
      targets.push(new WebAssembly.Table({ initial: 0, element: "externref" }));
    } catch {
      // Runtime support varies; skip unsupported WebAssembly constructors.
    }

    return targets;
  }

  async function webCryptoBuiltInTargets() {
    const subtle = globalThis.crypto?.subtle;
    if (subtle === undefined) {
      return [];
    }

    try {
      return [
        await subtle.generateKey(
          {
            name: "HMAC",
            hash: "SHA-256"
          },
          false,
          ["sign"]
        )
      ];
    } catch {
      // Runtime support varies; skip unsupported Web Crypto constructors.
      return [];
    }
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

  it("rejects custom iterator metadata on control arrays without invoking it", () => {
    const implementedControls = implementedFrozenControls();
    const iteratorMetadataControls = [...implementedControls];
    Object.defineProperty(iteratorMetadataControls, Symbol.iterator, {
      enumerable: false,
      get: () => {
        throw new Error("custom control-array iterator must not be read");
      }
    });
    Object.freeze(iteratorMetadataControls);

    expect(Object.isFrozen(iteratorMetadataControls)).toBe(true);
    expect(() => liveWorkerControlsAreFrozen(iteratorMetadataControls)).not.toThrow();
    expect(() => liveWorkerControlEvidenceUsesFrozenDataDescriptors(iteratorMetadataControls)).not.toThrow();
    expect(() => liveWorkerControlArrayExposesOnlyIndexedEntries(iteratorMetadataControls)).not.toThrow();
    expect(() => liveWorkerControlsAreImplemented(iteratorMetadataControls)).not.toThrow();
    expect(liveWorkerControlsAreFrozen(iteratorMetadataControls)).toBe(true);
    expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(iteratorMetadataControls)).toBe(true);
    expect(liveWorkerControlArrayExposesOnlyIndexedEntries(iteratorMetadataControls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(iteratorMetadataControls)).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, iteratorMetadataControls)
      )
    ).toBe(false);
  });

  it("does not invoke inherited array iterators while evaluating exact frozen evidence", () => {
    const implementedControls = implementedFrozenControls();
    const originalIteratorDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator);

    try {
      Object.defineProperty(Array.prototype, Symbol.iterator, {
        configurable: true,
        get: () => {
          throw new Error("inherited control-array iterator must not be read");
        }
      });

      expect(() => liveWorkerControlArrayExposesOnlyIndexedEntries(implementedControls)).not.toThrow();
      expect(() => liveWorkerControlsAreFrozen(implementedControls)).not.toThrow();
      expect(() => liveWorkerControlEvidenceUsesFrozenDataDescriptors(implementedControls)).not.toThrow();
      expect(() => liveWorkerControlsAreImplemented(implementedControls)).not.toThrow();
      expect(liveWorkerControlArrayExposesOnlyIndexedEntries(implementedControls)).toBe(true);
      expect(liveWorkerControlsAreFrozen(implementedControls)).toBe(true);
      expect(liveWorkerControlEvidenceUsesFrozenDataDescriptors(implementedControls)).toBe(true);
      expect(liveWorkerControlsAreImplemented(implementedControls)).toBe(true);
      expect(
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, implementedControls)
        )
      ).toBe(true);
    } finally {
      if (originalIteratorDescriptor === undefined) {
        delete (Array.prototype as { [Symbol.iterator]?: Array<unknown>[typeof Symbol.iterator] })[Symbol.iterator];
      } else {
        Object.defineProperty(Array.prototype, Symbol.iterator, originalIteratorDescriptor);
      }
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

  it("rejects symbol-keyed control field impersonators before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const symbolKeyedControl = Object.freeze({
      [Symbol("id")]: implementedControls[0].id,
      [Symbol("status")]: "implemented",
      [Symbol("requirement")]: implementedControls[0].requirement
    }) as unknown as LiveWorkerControl;
    const controls = Object.freeze(
      implementedControls.map((control, index) =>
        index === 0 ? symbolKeyedControl : Object.freeze({ ...control })
      )
    );

    expect(() => liveWorkerControlsExposeOnlyPublicFields(controls)).not.toThrow();
    expect(() => liveWorkerControlIdsMatchRequiredChecklist(controls)).not.toThrow();
    expect(() => liveWorkerControlsUseSupportedStatuses(controls)).not.toThrow();
    expect(() => liveWorkerControlsAreImplemented(controls)).not.toThrow();
    expect(liveWorkerControlsExposeOnlyPublicFields(controls)).toBe(false);
    expect(liveWorkerControlIdsMatchRequiredChecklist(controls)).toBe(false);
    expect(liveWorkerControlsUseSupportedStatuses(controls)).toBe(false);
    expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
    expect(
      liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
    ).toBe(false);
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

  it("rejects non-ordinary object-shaped control entries before live-worker authorization", () => {
    const implementedControls = implementedFrozenControls();
    const entryFields = {
      id: implementedControls[0].id,
      status: "implemented" as const,
      requirement: implementedControls[0].requirement
    };
    const arrayEntry = Object.freeze(Object.assign([], entryFields)) as unknown as LiveWorkerControl;
    const dateEntry = Object.freeze(Object.assign(new Date(0), entryFields)) as unknown as LiveWorkerControl;
    const functionEntry = Object.freeze(
      Object.assign(() => "implemented", entryFields)
    ) as unknown as LiveWorkerControl;

    for (const controlEntry of [arrayEntry, dateEntry, functionEntry]) {
      const controls = Object.freeze(
        implementedControls.map((control, index) => (index === 0 ? controlEntry : control))
      );

      expect(() => liveWorkerControlsExposeOnlyPublicFields(controls)).not.toThrow();
      expect(() => liveWorkerControlsAreImplemented(controls)).not.toThrow();
      expect(liveWorkerControlsExposeOnlyPublicFields(controls)).toBe(false);
      expect(liveWorkerControlsUseSupportedStatuses(controls)).toBe(false);
      expect(liveWorkerControlIdsMatchRequiredChecklist(controls)).toBe(false);
      expect(liveWorkerControlsAreImplemented(controls)).toBe(false);
      expect(
        liveWorkerDeploymentClassIsAuthorized(frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls))
      ).toBe(false);
    }
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

  it("rejects malformed primitive control entries without coercion", () => {
    const implementedControls = implementedFrozenControls();

    for (const malformedControl of [
      null,
      undefined,
      false,
      0,
      1n,
      "implemented",
      Symbol("implemented-live-worker-control")
    ]) {
      const controls = Object.freeze(
        implementedControls.map((control, index) => (index === 0 ? malformedControl : control))
      );

      expect(() => liveWorkerControlEvidenceUsesFrozenDataDescriptors(controls)).not.toThrow();
      expect(() => liveWorkerControlsExposeOnlyPublicFields(controls)).not.toThrow();
      expect(() => liveWorkerControlsUseSupportedStatuses(controls)).not.toThrow();
      expect(() => liveWorkerControlIdsMatchRequiredChecklist(controls)).not.toThrow();
      expect(() => liveWorkerControlsAreImplemented(controls)).not.toThrow();
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

  it("rejects malformed wrapper controls evidence without fallback or coercion", () => {
    const hostileControlsEvidence = Object.freeze({
      [Symbol.toPrimitive]: () => {
        throw new Error("malformed wrapper controls evidence must not be coerced");
      },
      toString: () => {
        throw new Error("malformed wrapper controls evidence toString must not be called");
      },
      valueOf: () => {
        throw new Error("malformed wrapper controls evidence valueOf must not be called");
      }
    });

    for (const controls of [
      null,
      undefined,
      false,
      0,
      1n,
      "implemented",
      Symbol("implemented-live-worker-controls"),
      hostileControlsEvidence
    ]) {
      expect(() =>
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls)
        )
      ).not.toThrow();
      expect(
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls)
        )
      ).toBe(false);
    }
  });

  it("rejects object-shaped non-array controls evidence without reading entries", () => {
    const controlsEvidence = [
      Object.freeze(new Map([["0", implementedFrozenControls()[0]]])),
      Object.freeze(new Set(implementedFrozenControls())),
      Object.freeze(new WeakMap([[implementedFrozenControls()[0], "implemented"]])),
      Object.freeze(new WeakSet([implementedFrozenControls()[0]])),
      Object.freeze(new ArrayBuffer(8)),
      ...whenSharedArrayBufferExists(() => Object.freeze(new SharedArrayBuffer(8))),
      new Uint8Array([1, 2, 3]),
      new DataView(new ArrayBuffer(8)),
      Object.freeze(Promise.resolve(implementedFrozenControls())),
      Object.freeze(new String("implemented")),
      Object.freeze(new Number(productionLiveCampaignWorkerControls.length)),
      Object.freeze(new Boolean(true)),
      Object.freeze(Object(Symbol("implemented-controls"))),
      Object.freeze(Object(1n)),
      Object.freeze(new Date(0)),
      Object.freeze(/implemented/),
      Object.freeze(new Error("implemented controls")),
      Object.freeze(new URL("https://signalstack.local/implemented-controls")),
      Object.freeze(new URLSearchParams("controls=implemented")),
      Object.freeze(new WeakRef(implementedFrozenControls()[0])),
      Object.freeze(new FinalizationRegistry(() => undefined)),
      ...webAssemblyBuiltInTargets().map((target) => Object.freeze(target)),
      Object.freeze({
        0: implementedFrozenControls()[0],
        length: productionLiveCampaignWorkerControls.length
      })
    ];

    for (const controls of controlsEvidence) {
      expect(() =>
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls)
        )
      ).not.toThrow();
      expect(
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls)
        )
      ).toBe(false);
    }
  });

  it("rejects hostile array-like controls evidence without reading getters or iterators", () => {
    const hostileArrayLikeControls = Object.freeze(
      Object.defineProperties(
        {},
        {
          0: {
            enumerable: true,
            get: () => {
              throw new Error("array-like control index getter must not be read");
            }
          },
          length: {
            enumerable: true,
            get: () => {
              throw new Error("array-like control length getter must not be read");
            }
          },
          [Symbol.iterator]: {
            enumerable: true,
            get: () => {
              throw new Error("array-like controls iterator must not be read");
            }
          }
        }
      )
    );
    const arrayPrototypeImpostor = Object.freeze(
      Object.defineProperties(Object.create(Array.prototype) as Record<PropertyKey, unknown>, {
        0: {
          enumerable: true,
          get: () => {
            throw new Error("array-prototype impostor index getter must not be read");
          }
        },
        length: {
          enumerable: true,
          get: () => {
            throw new Error("array-prototype impostor length getter must not be read");
          }
        }
      })
    );
    const iterableObjectControls = Object.freeze({
      [Symbol.iterator]: () => {
        throw new Error("iterable object controls iterator must not be invoked");
      }
    });

    for (const controls of [hostileArrayLikeControls, arrayPrototypeImpostor, iterableObjectControls]) {
      expect(() =>
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls)
        )
      ).not.toThrow();
      expect(
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls)
        )
      ).toBe(false);
    }
  });

  it("rejects toStringTag array impostor controls evidence without reading spoofed fields", () => {
    const toStringTagArrayImpostor = Object.freeze(
      Object.defineProperties(
        {},
        {
          0: {
            enumerable: true,
            get: () => {
              throw new Error("toStringTag array impostor index getter must not be read");
            }
          },
          length: {
            enumerable: true,
            get: () => {
              throw new Error("toStringTag array impostor length getter must not be read");
            }
          },
          [Symbol.toStringTag]: {
            value: "Array",
            enumerable: false
          }
        }
      )
    );

    expect(Object.prototype.toString.call(toStringTagArrayImpostor)).toBe("[object Array]");
    expect(Array.isArray(toStringTagArrayImpostor)).toBe(false);
    expect(() =>
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, toStringTagArrayImpostor)
      )
    ).not.toThrow();
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, toStringTagArrayImpostor)
      )
    ).toBe(false);
  });

  it("rejects toStringTag accessor controls evidence without reading spoofed fields", () => {
    const toStringTagAccessorControls = Object.freeze(
      Object.defineProperties(
        {},
        {
          0: {
            enumerable: true,
            get: () => {
              throw new Error("toStringTag accessor controls index getter must not be read");
            }
          },
          length: {
            enumerable: true,
            get: () => {
              throw new Error("toStringTag accessor controls length getter must not be read");
            }
          },
          [Symbol.toStringTag]: {
            enumerable: false,
            get: () => {
              throw new Error("toStringTag accessor controls tag getter must not be read");
            }
          }
        }
      )
    );

    expect(Array.isArray(toStringTagAccessorControls)).toBe(false);
    expect(() =>
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, toStringTagAccessorControls)
      )
    ).not.toThrow();
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, toStringTagAccessorControls)
      )
    ).toBe(false);
  });

  it("rejects function-shaped controls evidence without invoking it", () => {
    const callableControls = Object.freeze(
      Object.assign(
        () => {
          throw new Error("function-shaped controls evidence must not be invoked");
        },
        {
          0: implementedFrozenControls()[0],
          [Symbol.iterator]: () => {
            throw new Error("function-shaped controls iterator must not be invoked");
          }
        }
      )
    );

    expect(() =>
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, callableControls)
      )
    ).not.toThrow();
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, callableControls)
      )
    ).toBe(false);
  });

  it("rejects proxy-backed non-array controls evidence without inspecting object traps", () => {
    const proxyControls = new Proxy(
      {
        0: implementedFrozenControls()[0],
        length: productionLiveCampaignWorkerControls.length
      },
      {
        get: () => {
          throw new Error("non-array controls get trap must not be read");
        },
        getPrototypeOf: () => {
          throw new Error("non-array controls prototype trap must not be read");
        },
        getOwnPropertyDescriptor: () => {
          throw new Error("non-array controls descriptor trap must not be read");
        },
        ownKeys: () => {
          throw new Error("non-array controls keys trap must not be read");
        }
      }
    );

    expect(() =>
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, proxyControls)
      )
    ).not.toThrow();
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, proxyControls)
      )
    ).toBe(false);
  });

  it("rejects proxy-backed array-prototype impostor controls evidence without inspecting object traps", () => {
    const arrayPrototypeImpostor = Object.create(Array.prototype) as Record<PropertyKey, unknown>;
    const proxyControls = new Proxy(arrayPrototypeImpostor, {
      get: () => {
        throw new Error("array-prototype proxy controls get trap must not be read");
      },
      getPrototypeOf: () => {
        throw new Error("array-prototype proxy controls prototype trap must not be read");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("array-prototype proxy controls descriptor trap must not be read");
      },
      ownKeys: () => {
        throw new Error("array-prototype proxy controls keys trap must not be read");
      }
    });

    expect(Array.isArray(arrayPrototypeImpostor)).toBe(false);
    expect(() =>
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, proxyControls)
      )
    ).not.toThrow();
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, proxyControls)
      )
    ).toBe(false);
  });

  it("rejects proxy-backed typed-array controls evidence without inspecting object traps", () => {
    const proxyControls = new Proxy(new Uint8Array([1, 2, 3]), {
      get: () => {
        throw new Error("typed-array proxy controls get trap must not be read");
      },
      getPrototypeOf: () => {
        throw new Error("typed-array proxy controls prototype trap must not be read");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("typed-array proxy controls descriptor trap must not be read");
      },
      ownKeys: () => {
        throw new Error("typed-array proxy controls keys trap must not be read");
      }
    });

    expect(() =>
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, proxyControls)
      )
    ).not.toThrow();
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, proxyControls)
      )
    ).toBe(false);
  });

  it("rejects proxy-backed data-view controls evidence without inspecting object traps", () => {
    const proxyControls = new Proxy(new DataView(new ArrayBuffer(8)), {
      get: () => {
        throw new Error("data-view proxy controls get trap must not be read");
      },
      getPrototypeOf: () => {
        throw new Error("data-view proxy controls prototype trap must not be read");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("data-view proxy controls descriptor trap must not be read");
      },
      ownKeys: () => {
        throw new Error("data-view proxy controls keys trap must not be read");
      }
    });

    expect(() =>
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, proxyControls)
      )
    ).not.toThrow();
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, proxyControls)
      )
    ).toBe(false);
  });

  it("rejects proxy-backed array-buffer controls evidence without inspecting object traps", () => {
    const proxyControls = new Proxy(new ArrayBuffer(8), {
      get: () => {
        throw new Error("array-buffer proxy controls get trap must not be read");
      },
      getPrototypeOf: () => {
        throw new Error("array-buffer proxy controls prototype trap must not be read");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("array-buffer proxy controls descriptor trap must not be read");
      },
      ownKeys: () => {
        throw new Error("array-buffer proxy controls keys trap must not be read");
      }
    });

    expect(() =>
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, proxyControls)
      )
    ).not.toThrow();
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, proxyControls)
      )
    ).toBe(false);
  });

  it("rejects proxy-backed shared-array-buffer controls evidence without inspecting object traps", () => {
    if (typeof SharedArrayBuffer !== "function") {
      expect(typeof SharedArrayBuffer).toBe("undefined");
      return;
    }

    const proxyControls = new Proxy(new SharedArrayBuffer(8), {
      get: () => {
        throw new Error("shared-array-buffer proxy controls get trap must not be read");
      },
      getPrototypeOf: () => {
        throw new Error("shared-array-buffer proxy controls prototype trap must not be read");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("shared-array-buffer proxy controls descriptor trap must not be read");
      },
      ownKeys: () => {
        throw new Error("shared-array-buffer proxy controls keys trap must not be read");
      }
    });

    expect(() =>
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, proxyControls)
      )
    ).not.toThrow();
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, proxyControls)
      )
    ).toBe(false);
  });

  it("rejects proxy-backed promise controls evidence without inspecting object traps", () => {
    const proxyControls = new Proxy(Promise.resolve(implementedFrozenControls()), {
      get: () => {
        throw new Error("promise proxy controls get trap must not be read");
      },
      getPrototypeOf: () => {
        throw new Error("promise proxy controls prototype trap must not be read");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("promise proxy controls descriptor trap must not be read");
      },
      ownKeys: () => {
        throw new Error("promise proxy controls keys trap must not be read");
      }
    });

    expect(() =>
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, proxyControls)
      )
    ).not.toThrow();
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, proxyControls)
      )
    ).toBe(false);
  });

  it("rejects proxy-backed boxed primitive controls evidence without inspecting object traps", () => {
    const proxyControlsEvidence = [
      new String("unsafe-controls"),
      new Number(productionLiveCampaignWorkerControls.length),
      new Boolean(true),
      Object(Symbol("unsafe-controls")),
      Object(1n)
    ].map(
      (target) =>
        new Proxy(target, {
          get: () => {
            throw new Error("boxed primitive proxy controls get trap must not be read");
          },
          getPrototypeOf: () => {
            throw new Error("boxed primitive proxy controls prototype trap must not be read");
          },
          getOwnPropertyDescriptor: () => {
            throw new Error("boxed primitive proxy controls descriptor trap must not be read");
          },
          ownKeys: () => {
            throw new Error("boxed primitive proxy controls keys trap must not be read");
          }
        })
    );

    for (const proxyControls of proxyControlsEvidence) {
      expect(() =>
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, proxyControls)
        )
      ).not.toThrow();
      expect(
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, proxyControls)
        )
      ).toBe(false);
    }
  });

  it("rejects proxy-backed built-in object controls evidence without inspecting object traps", () => {
    const proxyControlsEvidence = [
      new Proxy(new Date(0), {
        get: () => {
          throw new Error("date proxy controls get trap must not be read");
        },
        getPrototypeOf: () => {
          throw new Error("date proxy controls prototype trap must not be read");
        },
        getOwnPropertyDescriptor: () => {
          throw new Error("date proxy controls descriptor trap must not be read");
        },
        ownKeys: () => {
          throw new Error("date proxy controls keys trap must not be read");
        }
      }),
      new Proxy(/unsafe-controls/, {
        get: () => {
          throw new Error("regexp proxy controls get trap must not be read");
        },
        getPrototypeOf: () => {
          throw new Error("regexp proxy controls prototype trap must not be read");
        },
        getOwnPropertyDescriptor: () => {
          throw new Error("regexp proxy controls descriptor trap must not be read");
        },
        ownKeys: () => {
          throw new Error("regexp proxy controls keys trap must not be read");
        }
      }),
      new Proxy(new Error("unsafe controls"), {
        get: () => {
          throw new Error("error proxy controls get trap must not be read");
        },
        getPrototypeOf: () => {
          throw new Error("error proxy controls prototype trap must not be read");
        },
        getOwnPropertyDescriptor: () => {
          throw new Error("error proxy controls descriptor trap must not be read");
        },
        ownKeys: () => {
          throw new Error("error proxy controls keys trap must not be read");
        }
      }),
      new Proxy(new URL("https://signalstack.local/unsafe-controls"), {
        get: () => {
          throw new Error("url proxy controls get trap must not be read");
        },
        getPrototypeOf: () => {
          throw new Error("url proxy controls prototype trap must not be read");
        },
        getOwnPropertyDescriptor: () => {
          throw new Error("url proxy controls descriptor trap must not be read");
        },
        ownKeys: () => {
          throw new Error("url proxy controls keys trap must not be read");
        }
      }),
      new Proxy(new URLSearchParams("controls=unsafe"), {
        get: () => {
          throw new Error("url-search-params proxy controls get trap must not be read");
        },
        getPrototypeOf: () => {
          throw new Error("url-search-params proxy controls prototype trap must not be read");
        },
        getOwnPropertyDescriptor: () => {
          throw new Error("url-search-params proxy controls descriptor trap must not be read");
        },
        ownKeys: () => {
          throw new Error("url-search-params proxy controls keys trap must not be read");
        }
      }),
      new Proxy(new WeakRef(implementedFrozenControls()[0]), {
        get: () => {
          throw new Error("weakref proxy controls get trap must not be read");
        },
        getPrototypeOf: () => {
          throw new Error("weakref proxy controls prototype trap must not be read");
        },
        getOwnPropertyDescriptor: () => {
          throw new Error("weakref proxy controls descriptor trap must not be read");
        },
        ownKeys: () => {
          throw new Error("weakref proxy controls keys trap must not be read");
        }
      }),
      new Proxy(new FinalizationRegistry(() => undefined), {
        get: () => {
          throw new Error("finalization registry proxy controls get trap must not be read");
        },
        getPrototypeOf: () => {
          throw new Error("finalization registry proxy controls prototype trap must not be read");
        },
        getOwnPropertyDescriptor: () => {
          throw new Error("finalization registry proxy controls descriptor trap must not be read");
        },
        ownKeys: () => {
          throw new Error("finalization registry proxy controls keys trap must not be read");
        }
      }),
      ...webAssemblyBuiltInTargets().map(
        (target) =>
          new Proxy(target, {
            get: () => {
              throw new Error("webassembly proxy controls get trap must not be read");
            },
            getPrototypeOf: () => {
              throw new Error("webassembly proxy controls prototype trap must not be read");
            },
            getOwnPropertyDescriptor: () => {
              throw new Error("webassembly proxy controls descriptor trap must not be read");
            },
            ownKeys: () => {
              throw new Error("webassembly proxy controls keys trap must not be read");
            }
          })
      )
    ];

    for (const controls of proxyControlsEvidence) {
      expect(() =>
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls)
        )
      ).not.toThrow();
      expect(
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls)
        )
      ).toBe(false);
    }
  });

  it("rejects proxy-backed collection controls evidence without inspecting object traps", () => {
    const collectionControls = [
      { name: "map", target: new Map([["0", implementedFrozenControls()[0]]]) },
      { name: "set", target: new Set(implementedFrozenControls()) },
      { name: "weakmap", target: new WeakMap([[implementedFrozenControls()[0], "implemented"]]) },
      { name: "weakset", target: new WeakSet([implementedFrozenControls()[0]]) }
    ];

    for (const { name, target } of collectionControls) {
      const proxyControls = new Proxy(target, {
        get: () => {
          throw new Error(`${name} proxy controls get trap must not be read`);
        },
        getPrototypeOf: () => {
          throw new Error(`${name} proxy controls prototype trap must not be read`);
        },
        getOwnPropertyDescriptor: () => {
          throw new Error(`${name} proxy controls descriptor trap must not be read`);
        },
        ownKeys: () => {
          throw new Error(`${name} proxy controls keys trap must not be read`);
        }
      });

      expect(() =>
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, proxyControls)
        )
      ).not.toThrow();
      expect(
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, proxyControls)
        )
      ).toBe(false);
    }
  });

  it("rejects revoked proxy-backed array-prototype impostor controls evidence without throwing", () => {
    const arrayPrototypeImpostor = Object.create(Array.prototype) as Record<PropertyKey, unknown>;
    const { proxy: revokedProxyControls, revoke } = Proxy.revocable(arrayPrototypeImpostor, {
      get: () => {
        throw new Error("revoked array-prototype proxy controls get trap must not be read");
      },
      getPrototypeOf: () => {
        throw new Error("revoked array-prototype proxy controls prototype trap must not be read");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("revoked array-prototype proxy controls descriptor trap must not be read");
      },
      ownKeys: () => {
        throw new Error("revoked array-prototype proxy controls keys trap must not be read");
      }
    });

    revoke();

    expect(() =>
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, revokedProxyControls)
      )
    ).not.toThrow();
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, revokedProxyControls)
      )
    ).toBe(false);
  });

  it("rejects revoked proxy-backed non-array controls evidence without throwing", () => {
    const { proxy: revokedProxyControls, revoke } = Proxy.revocable(
      {
        0: implementedFrozenControls()[0],
        length: productionLiveCampaignWorkerControls.length
      },
      {}
    );

    revoke();

    expect(() =>
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, revokedProxyControls)
      )
    ).not.toThrow();
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, revokedProxyControls)
      )
    ).toBe(false);
  });

  it("rejects revoked proxy-backed built-in controls evidence without throwing", () => {
    const builtInTargets: object[] = [
      new Date(0),
      /unsafe-controls/,
      new Error("unsafe controls"),
      new Map([["0", implementedFrozenControls()[0]]]),
      new Set(implementedFrozenControls()),
      new WeakMap([[implementedFrozenControls()[0], "implemented"]]),
      new WeakSet([implementedFrozenControls()[0]]),
      new Uint8Array([1, 2, 3]),
      new DataView(new ArrayBuffer(8)),
      new String("unsafe-controls"),
      new Number(productionLiveCampaignWorkerControls.length),
      new Boolean(true),
      Object(Symbol("unsafe-controls")),
      Object(1n),
      Promise.resolve(implementedFrozenControls()),
      new URL("https://signalstack.local/unsafe-controls"),
      new URLSearchParams("controls=unsafe"),
      new WeakRef(implementedFrozenControls()[0]),
      new FinalizationRegistry(() => undefined),
      new ArrayBuffer(8),
      ...webPlatformBuiltInTargets(),
      ...webAssemblyBuiltInTargets()
    ];

    if (typeof SharedArrayBuffer === "function") {
      builtInTargets.push(new SharedArrayBuffer(8));
    }

    for (const target of builtInTargets) {
      const { proxy: revokedProxyControls, revoke } = Proxy.revocable(target, {
        get: () => {
          throw new Error("revoked built-in proxy controls get trap must not be read");
        },
        getPrototypeOf: () => {
          throw new Error("revoked built-in proxy controls prototype trap must not be read");
        },
        getOwnPropertyDescriptor: () => {
          throw new Error("revoked built-in proxy controls descriptor trap must not be read");
        },
        ownKeys: () => {
          throw new Error("revoked built-in proxy controls keys trap must not be read");
        }
      });

      revoke();

      expect(() =>
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, revokedProxyControls)
        )
      ).not.toThrow();
      expect(
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, revokedProxyControls)
        )
      ).toBe(false);
    }
  });

  it("rejects runtime-supported Web Crypto controls evidence without authorizing", async () => {
    const cryptoTargets = await webCryptoBuiltInTargets();

    for (const controls of cryptoTargets) {
      expect(() =>
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, Object.freeze(controls))
        )
      ).not.toThrow();
      expect(
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, Object.freeze(controls))
        )
      ).toBe(false);
    }
  });

  it("rejects proxy-backed Web Crypto controls evidence without inspecting object traps", async () => {
    const proxyControlsEvidence = (await webCryptoBuiltInTargets()).map(
      (target) =>
        new Proxy(target, {
          get: () => {
            throw new Error("web crypto proxy controls get trap must not be read");
          },
          getPrototypeOf: () => {
            throw new Error("web crypto proxy controls prototype trap must not be read");
          },
          getOwnPropertyDescriptor: () => {
            throw new Error("web crypto proxy controls descriptor trap must not be read");
          },
          ownKeys: () => {
            throw new Error("web crypto proxy controls keys trap must not be read");
          }
        })
    );

    for (const controls of proxyControlsEvidence) {
      expect(() =>
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls)
        )
      ).not.toThrow();
      expect(
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls)
        )
      ).toBe(false);
    }
  });

  it("rejects revoked proxy-backed Web Crypto controls evidence without throwing", async () => {
    const revokedProxyControlsEvidence = (await webCryptoBuiltInTargets()).map((target) => {
      const { proxy, revoke } = Proxy.revocable(target, {
        get: () => {
          throw new Error("revoked web crypto proxy controls get trap must not be read");
        }
      });
      revoke();
      return proxy;
    });

    for (const controls of revokedProxyControlsEvidence) {
      expect(() =>
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls)
        )
      ).not.toThrow();
      expect(
        liveWorkerDeploymentClassIsAuthorized(
          frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, controls)
        )
      ).toBe(false);
    }
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
      42n,
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

  it("rejects object-shaped deployment class impostors before inspecting supplied controls", () => {
    const throwingEvidence = new Proxy([...implementedFrozenControls()], {
      getPrototypeOf: () => {
        throw new Error("object-shaped worker classes must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("object-shaped worker classes must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("object-shaped worker classes must not inspect control evidence");
      }
    });
    const functionClass = Object.freeze(() => reservedLiveWorkerDeploymentClass);
    const taggedObjectClass = Object.freeze({
      [Symbol.toStringTag]: reservedLiveWorkerDeploymentClass
    });
    const promiseClass = Object.freeze(Promise.resolve(reservedLiveWorkerDeploymentClass));

    for (const workerDeploymentClass of [
      Object.freeze(new Boolean(true)),
      Object.freeze(new Number(1)),
      Object.freeze(Object(Symbol("production-live-campaign"))),
      Object.freeze(Object(1n)),
      Object.freeze(new Date(0)),
      Object.freeze(new Map([["workerDeploymentClass", reservedLiveWorkerDeploymentClass]])),
      Object.freeze(new Set([reservedLiveWorkerDeploymentClass])),
      Object.freeze(new WeakMap([[{}, reservedLiveWorkerDeploymentClass]])),
      Object.freeze(new WeakSet([{}])),
      Object.freeze(new ArrayBuffer(8)),
      ...whenSharedArrayBufferExists(() => Object.freeze(new SharedArrayBuffer(8))),
      Object.freeze(new Uint8Array(0)),
      Object.freeze(new DataView(new ArrayBuffer(8))),
      promiseClass,
      Object.freeze(/production-live-campaign/),
      Object.freeze(new Error("production-live-campaign")),
      Object.freeze(new URL("https://signalstack.local/production-live-campaign")),
      Object.freeze(new URLSearchParams("workerDeploymentClass=production-live-campaign")),
      Object.freeze(new WeakRef(implementedFrozenControls()[0])),
      Object.freeze(new FinalizationRegistry(() => undefined)),
      functionClass,
      taggedObjectClass
    ]) {
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

  it("does not read deployment class toStringTag accessors before denying authorization", () => {
    const throwingEvidence = new Proxy([...implementedFrozenControls()], {
      getPrototypeOf: () => {
        throw new Error("tagged worker classes must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("tagged worker classes must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("tagged worker classes must not inspect control evidence");
      }
    });
    const taggedAccessorClass = Object.freeze(
      Object.defineProperty({}, Symbol.toStringTag, {
        enumerable: false,
        get: () => {
          throw new Error("worker deployment class toStringTag getter must not be read");
        }
      })
    );

    expect(() =>
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(taggedAccessorClass as unknown as string, throwingEvidence)
      )
    ).not.toThrow();
    expect(
      liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(taggedAccessorClass as unknown as string, throwingEvidence)
      )
    ).toBe(false);
  });

  it("rejects runtime-supported platform deployment class impostors before inspecting supplied controls", async () => {
    const throwingEvidence = new Proxy([...implementedFrozenControls()], {
      getPrototypeOf: () => {
        throw new Error("platform worker classes must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("platform worker classes must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("platform worker classes must not inspect control evidence");
      }
    });
    const platformClassImpostors = [
      ...webPlatformBuiltInTargets(),
      ...webAssemblyBuiltInTargets(),
      ...(await webCryptoBuiltInTargets())
    ];

    for (const workerDeploymentClass of platformClassImpostors) {
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

  it("rejects proxy-backed deployment class impostors before inspecting supplied controls", () => {
    const throwingEvidence = new Proxy([...implementedFrozenControls()], {
      getPrototypeOf: () => {
        throw new Error("proxy-backed worker classes must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("proxy-backed worker classes must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("proxy-backed worker classes must not inspect control evidence");
      }
    });
    const proxyClass = new Proxy(
      { workerDeploymentClass: reservedLiveWorkerDeploymentClass },
      {
        get: () => {
          throw new Error("proxy-backed worker class value must not be read");
        },
        getPrototypeOf: () => {
          throw new Error("proxy-backed worker class prototype must not be read");
        },
        getOwnPropertyDescriptor: () => {
          throw new Error("proxy-backed worker class descriptors must not be read");
        },
        ownKeys: () => {
          throw new Error("proxy-backed worker class keys must not be read");
        }
      }
    );
    const { proxy: revokedProxyClass, revoke } = Proxy.revocable(
      { workerDeploymentClass: reservedLiveWorkerDeploymentClass },
      {
        get: () => {
          throw new Error("revoked worker class value must not be read");
        }
      }
    );
    revoke();

    for (const workerDeploymentClass of [proxyClass, revokedProxyClass]) {
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
      `\t${reservedLiveWorkerDeploymentClass}`,
      `${reservedLiveWorkerDeploymentClass}\n`,
      `\r${reservedLiveWorkerDeploymentClass}`,
      `${reservedLiveWorkerDeploymentClass}\r\n`,
      `\v${reservedLiveWorkerDeploymentClass}`,
      `${reservedLiveWorkerDeploymentClass}\f`,
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

  it("rejects invisible unicode-padded deployment class strings before inspecting supplied controls", () => {
    const throwingEvidence = new Proxy([...implementedFrozenControls()], {
      getPrototypeOf: () => {
        throw new Error("unicode-padded worker classes must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("unicode-padded worker classes must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("unicode-padded worker classes must not inspect control evidence");
      }
    });

    for (const workerDeploymentClass of [
      `\u00a0${reservedLiveWorkerDeploymentClass}`,
      `${reservedLiveWorkerDeploymentClass}\u2007`,
      `\u202f${reservedLiveWorkerDeploymentClass}`,
      `${reservedLiveWorkerDeploymentClass}\ufeff`,
      `\u200b${reservedLiveWorkerDeploymentClass}\u200b`,
      `\u2028${reservedLiveWorkerDeploymentClass}`,
      `${reservedLiveWorkerDeploymentClass}\u2029`
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

  it("rejects blank deployment class strings before inspecting supplied controls", () => {
    const throwingEvidence = new Proxy([...implementedFrozenControls()], {
      getPrototypeOf: () => {
        throw new Error("blank worker classes must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("blank worker classes must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("blank worker classes must not inspect control evidence");
      }
    });

    for (const workerDeploymentClass of ["", " ", "\t", "\n", "\r", "\r\n", "\v", "\f"]) {
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

  it("rejects extensible authorization wrappers before inspecting controls", () => {
    const throwingEvidence = new Proxy(implementedFrozenControls(), {
      getPrototypeOf: () => {
        throw new Error("extensible authorization wrappers must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("extensible authorization wrappers must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("extensible authorization wrappers must not inspect control evidence");
      }
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
          value: throwingEvidence,
          enumerable: true,
          writable: false,
          configurable: false
        }
      }
    );

    expect(Object.isFrozen(extensibleWrapperWithFrozenFields)).toBe(false);
    expect(() => liveWorkerDeploymentClassIsAuthorized(extensibleWrapperWithFrozenFields)).not.toThrow();
    expect(liveWorkerDeploymentClassIsAuthorized(extensibleWrapperWithFrozenFields)).toBe(false);
  });

  it("rejects sealed-but-writable authorization wrappers before inspecting controls", () => {
    const throwingEvidence = new Proxy(implementedFrozenControls(), {
      getPrototypeOf: () => {
        throw new Error("sealed authorization wrappers must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("sealed authorization wrappers must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("sealed authorization wrappers must not inspect control evidence");
      }
    });
    const sealedWrapper = Object.seal({
      workerDeploymentClass: reservedLiveWorkerDeploymentClass,
      controls: throwingEvidence
    });

    expect(Object.isExtensible(sealedWrapper)).toBe(false);
    expect(Object.isFrozen(sealedWrapper)).toBe(false);
    expect(() => liveWorkerDeploymentClassIsAuthorized(sealedWrapper)).not.toThrow();
    expect(liveWorkerDeploymentClassIsAuthorized(sealedWrapper)).toBe(false);
  });

  it("rejects tagged authorization wrappers before inspecting controls or reading tag accessors", () => {
    const throwingEvidence = new Proxy(implementedFrozenControls(), {
      getPrototypeOf: () => {
        throw new Error("tagged authorization wrappers must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("tagged authorization wrappers must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("tagged authorization wrappers must not inspect control evidence");
      }
    });
    const taggedWrapper = Object.freeze(
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
            enumerable: true,
            writable: false,
            configurable: false
          },
          [Symbol.toStringTag]: {
            enumerable: false,
            configurable: false,
            get: () => {
              throw new Error("authorization wrapper toStringTag getter must not be read");
            }
          }
        }
      )
    );

    expect(Object.isFrozen(taggedWrapper)).toBe(true);
    expect(() => liveWorkerDeploymentClassIsAuthorized(taggedWrapper)).not.toThrow();
    expect(liveWorkerDeploymentClassIsAuthorized(taggedWrapper)).toBe(false);
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

  it("rejects non-enumerable authorization wrapper public fields before inspecting controls", () => {
    const throwingEvidence = new Proxy(implementedFrozenControls(), {
      getPrototypeOf: () => {
        throw new Error("non-enumerable wrapper fields must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("non-enumerable wrapper fields must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("non-enumerable wrapper fields must not inspect control evidence");
      }
    });
    const descriptorVariants = [
      {
        name: "non-enumerable worker class",
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
      },
      {
        name: "non-enumerable controls",
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

      expect(Object.isFrozen(wrapper), variant.name).toBe(true);
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
    const symbolKeyedPublicFieldWrapper = Object.freeze({
      [Symbol("workerDeploymentClass")]: reservedLiveWorkerDeploymentClass,
      [Symbol("controls")]: throwingEvidence
    });

    for (const input of [
      reorderedKeyWrapper,
      reorderedFieldWrapper,
      extraKeyWrapper,
      duplicateKeyWrapper,
      hiddenExtraKeyWrapper,
      hiddenStringExtraKeyWrapper,
      symbolExtraKeyWrapper,
      hiddenSymbolExtraKeyWrapper,
      symbolKeyedPublicFieldWrapper
    ]) {
      const authorizationInput = input as { workerDeploymentClass?: unknown; controls?: unknown };
      expect(() => liveWorkerDeploymentClassIsAuthorized(authorizationInput)).not.toThrow();
      expect(liveWorkerDeploymentClassIsAuthorized(authorizationInput)).toBe(false);
    }
  });

  it("rejects mixed symbol-keyed authorization wrapper public-field impersonators before inspecting controls", () => {
    const throwingEvidence = new Proxy(implementedFrozenControls(), {
      getPrototypeOf: () => {
        throw new Error("mixed symbol wrapper fields must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("mixed symbol wrapper fields must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("mixed symbol wrapper fields must not inspect control evidence");
      }
    });
    const symbolClassWrapper = Object.freeze({
      [Symbol("workerDeploymentClass")]: reservedLiveWorkerDeploymentClass,
      controls: throwingEvidence
    });
    const symbolControlsWrapper = Object.freeze({
      workerDeploymentClass: reservedLiveWorkerDeploymentClass,
      [Symbol("controls")]: throwingEvidence
    });

    for (const input of [symbolClassWrapper, symbolControlsWrapper]) {
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

  it("rejects exact-field non-ordinary authorization wrappers before inspecting controls", () => {
    const throwingEvidence = new Proxy(implementedFrozenControls(), {
      getPrototypeOf: () => {
        throw new Error("exact-field non-ordinary wrappers must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("exact-field non-ordinary wrappers must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("exact-field non-ordinary wrappers must not inspect control evidence");
      }
    });
    const defineExactWrapperFields = <T extends object>(target: T) =>
      Object.freeze(
        Object.defineProperties(target, {
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
        })
      );
    const nullPrototypeWrapper = defineExactWrapperFields(Object.create(null) as Record<string, unknown>);

    class AuthorizationWrapper {}

    const classInstanceWrapper = defineExactWrapperFields(new AuthorizationWrapper());
    const arrayWrapper = defineExactWrapperFields([]);
    const functionWrapper = defineExactWrapperFields(() => reservedLiveWorkerDeploymentClass);

    for (const input of [nullPrototypeWrapper, classInstanceWrapper, arrayWrapper, functionWrapper]) {
      expect(Object.isFrozen(input)).toBe(true);
      expect(() => liveWorkerDeploymentClassIsAuthorized(input)).not.toThrow();
      expect(liveWorkerDeploymentClassIsAuthorized(input)).toBe(false);
    }
  });

  it("rejects proxy-backed non-ordinary authorization wrappers before inspecting controls", () => {
    const throwingEvidence = new Proxy(implementedFrozenControls(), {
      getPrototypeOf: () => {
        throw new Error("proxy-backed non-ordinary wrappers must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("proxy-backed non-ordinary wrappers must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("proxy-backed non-ordinary wrappers must not inspect control evidence");
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
    const proxyBackedNonOrdinaryWrappers = [nullPrototypeWrapper, classInstanceWrapper].map(
      (target) =>
        new Proxy(target, {
          get: () => {
            throw new Error("proxy-backed non-ordinary wrapper fields must not be read");
          }
        })
    );

    for (const input of proxyBackedNonOrdinaryWrappers) {
      expect(() => liveWorkerDeploymentClassIsAuthorized(input)).not.toThrow();
      expect(liveWorkerDeploymentClassIsAuthorized(input)).toBe(false);
    }
  });

  it("rejects revoked proxy-backed non-ordinary authorization wrappers before inspecting controls", () => {
    const throwingEvidence = new Proxy(implementedFrozenControls(), {
      getPrototypeOf: () => {
        throw new Error("revoked non-ordinary wrappers must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("revoked non-ordinary wrappers must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("revoked non-ordinary wrappers must not inspect control evidence");
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
    const revokedProxyBackedNonOrdinaryWrappers = [nullPrototypeWrapper, classInstanceWrapper].map((target) => {
      const { proxy, revoke } = Proxy.revocable(target, {
        get: () => {
          throw new Error("revoked non-ordinary wrapper fields must not be read");
        }
      });
      revoke();
      return proxy;
    });

    for (const input of revokedProxyBackedNonOrdinaryWrappers) {
      expect(() => liveWorkerDeploymentClassIsAuthorized(input)).not.toThrow();
      expect(liveWorkerDeploymentClassIsAuthorized(input)).toBe(false);
    }
  });

  it("rejects built-in object authorization-wrapper impostors before inspecting controls", () => {
    const throwingEvidence = new Proxy(implementedFrozenControls(), {
      getPrototypeOf: () => {
        throw new Error("built-in wrapper impostors must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("built-in wrapper impostors must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("built-in wrapper impostors must not inspect control evidence");
      }
    });
    const wrapperFields = {
      workerDeploymentClass: reservedLiveWorkerDeploymentClass,
      controls: throwingEvidence
    };
    const builtInWrapperImpostors = [
      Object.freeze(Object.assign(new Map(), wrapperFields)),
      Object.freeze(Object.assign(new Set(), wrapperFields)),
      Object.freeze(Object.assign(new WeakMap(), wrapperFields)),
      Object.freeze(Object.assign(new WeakSet(), wrapperFields)),
      Object.freeze(Object.assign(new ArrayBuffer(8), wrapperFields)),
      ...whenSharedArrayBufferExists(() => Object.freeze(Object.assign(new SharedArrayBuffer(8), wrapperFields))),
      Object.freeze(Object.assign(new Uint8Array(0), wrapperFields)),
      Object.freeze(Object.assign(new DataView(new ArrayBuffer(8)), wrapperFields)),
      Object.freeze(Object.assign(Promise.resolve(implementedFrozenControls()), wrapperFields)),
      Object.freeze(Object.assign(new String(reservedLiveWorkerDeploymentClass), wrapperFields)),
      Object.freeze(Object.assign(new Number(1), wrapperFields)),
      Object.freeze(Object.assign(new Boolean(true), wrapperFields)),
      Object.freeze(Object.assign(Object(Symbol("production-live-campaign")), wrapperFields)),
      Object.freeze(Object.assign(Object(1n), wrapperFields)),
      Object.freeze(Object.assign(new Date(0), wrapperFields)),
      Object.freeze(Object.assign(/production-live-campaign/, wrapperFields)),
      Object.freeze(Object.assign(new Error("production-live-campaign"), wrapperFields)),
      Object.freeze(Object.assign(new URL("https://signalstack.local/production-live-campaign"), wrapperFields)),
      Object.freeze(Object.assign(new URLSearchParams("workerDeploymentClass=production-live-campaign"), wrapperFields)),
      Object.freeze(Object.assign(new WeakRef(implementedFrozenControls()[0]), wrapperFields)),
      Object.freeze(Object.assign(new FinalizationRegistry(() => undefined), wrapperFields)),
      ...webPlatformBuiltInTargets().map((target) => Object.freeze(Object.assign(target, wrapperFields))),
      ...webAssemblyBuiltInTargets().map((target) => Object.freeze(Object.assign(target, wrapperFields)))
    ];

    for (const input of builtInWrapperImpostors) {
      expect(() => liveWorkerDeploymentClassIsAuthorized(input)).not.toThrow();
      expect(liveWorkerDeploymentClassIsAuthorized(input)).toBe(false);
    }
  });

  it("rejects exact-field built-in authorization-wrapper impostors before inspecting controls", () => {
    const throwingEvidence = new Proxy(implementedFrozenControls(), {
      getPrototypeOf: () => {
        throw new Error("exact-field built-in wrapper impostors must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("exact-field built-in wrapper impostors must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("exact-field built-in wrapper impostors must not inspect control evidence");
      }
    });
    const defineWrapperFields = <T extends object>(target: T) =>
      Object.freeze(
        Object.defineProperties(target, {
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
        })
      );
    const exactFieldBuiltInWrapperImpostors = [
      defineWrapperFields(new Map()),
      defineWrapperFields(new Set()),
      defineWrapperFields(new WeakMap()),
      defineWrapperFields(new WeakSet()),
      defineWrapperFields(new ArrayBuffer(8)),
      ...whenSharedArrayBufferExists(() => defineWrapperFields(new SharedArrayBuffer(8))),
      defineWrapperFields(new Uint8Array(0)),
      defineWrapperFields(new DataView(new ArrayBuffer(8))),
      defineWrapperFields(Promise.resolve(implementedFrozenControls())),
      defineWrapperFields(new String(reservedLiveWorkerDeploymentClass)),
      defineWrapperFields(new Number(1)),
      defineWrapperFields(new Boolean(true)),
      defineWrapperFields(Object(Symbol("production-live-campaign"))),
      defineWrapperFields(Object(1n)),
      defineWrapperFields(new Date(0)),
      defineWrapperFields(/production-live-campaign/),
      defineWrapperFields(new Error("production-live-campaign")),
      defineWrapperFields(new URL("https://signalstack.local/production-live-campaign")),
      defineWrapperFields(new URLSearchParams("workerDeploymentClass=production-live-campaign")),
      defineWrapperFields(new WeakRef(implementedFrozenControls()[0])),
      defineWrapperFields(new FinalizationRegistry(() => undefined)),
      ...webPlatformBuiltInTargets().map(defineWrapperFields),
      ...webAssemblyBuiltInTargets().map(defineWrapperFields)
    ];

    for (const input of exactFieldBuiltInWrapperImpostors) {
      const authorizationInput = input as { workerDeploymentClass?: unknown; controls?: unknown };
      expect(Object.isFrozen(input)).toBe(true);
      expect(() => liveWorkerDeploymentClassIsAuthorized(authorizationInput)).not.toThrow();
      expect(liveWorkerDeploymentClassIsAuthorized(authorizationInput)).toBe(false);
    }
  });

  it("rejects proxy-backed built-in authorization-wrapper impostors before inspecting controls", () => {
    const throwingEvidence = new Proxy(implementedFrozenControls(), {
      getPrototypeOf: () => {
        throw new Error("proxy-backed built-in wrapper impostors must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("proxy-backed built-in wrapper impostors must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("proxy-backed built-in wrapper impostors must not inspect control evidence");
      }
    });
    const wrapperFields = {
      workerDeploymentClass: reservedLiveWorkerDeploymentClass,
      controls: throwingEvidence
    };
    const proxyBackedBuiltInWrapperImpostors = [
      Object.assign(new Map(), wrapperFields),
      Object.assign(new Set(), wrapperFields),
      Object.assign(new WeakMap(), wrapperFields),
      Object.assign(new WeakSet(), wrapperFields),
      Object.assign(new ArrayBuffer(8), wrapperFields),
      ...whenSharedArrayBufferExists(() => Object.assign(new SharedArrayBuffer(8), wrapperFields)),
      Object.assign(new Uint8Array(0), wrapperFields),
      Object.assign(new DataView(new ArrayBuffer(8)), wrapperFields),
      Object.assign(Promise.resolve(implementedFrozenControls()), wrapperFields),
      Object.assign(new String(reservedLiveWorkerDeploymentClass), wrapperFields),
      Object.assign(new Number(1), wrapperFields),
      Object.assign(new Boolean(true), wrapperFields),
      Object.assign(Object(Symbol("production-live-campaign")), wrapperFields),
      Object.assign(Object(1n), wrapperFields),
      Object.assign(new Date(0), wrapperFields),
      Object.assign(/production-live-campaign/, wrapperFields),
      Object.assign(new Error("production-live-campaign"), wrapperFields),
      Object.assign(new URL("https://signalstack.local/production-live-campaign"), wrapperFields),
      Object.assign(new URLSearchParams("workerDeploymentClass=production-live-campaign"), wrapperFields),
      Object.assign(new WeakRef(implementedFrozenControls()[0]), wrapperFields),
      Object.assign(new FinalizationRegistry(() => undefined), wrapperFields),
      ...webPlatformBuiltInTargets().map((target) => Object.assign(target, wrapperFields)),
      ...webAssemblyBuiltInTargets().map((target) => Object.assign(target, wrapperFields))
    ].map(
      (target) =>
        new Proxy(Object.freeze(target), {
          get: () => {
            throw new Error("proxy-backed built-in wrapper fields must not be read");
          }
        })
    );

    for (const input of proxyBackedBuiltInWrapperImpostors) {
      expect(() => liveWorkerDeploymentClassIsAuthorized(input)).not.toThrow();
      expect(liveWorkerDeploymentClassIsAuthorized(input)).toBe(false);
    }
  });

  it("rejects reflection-trapped built-in authorization-wrapper impostors without inspecting controls", () => {
    const throwingEvidence = new Proxy(implementedFrozenControls(), {
      getPrototypeOf: () => {
        throw new Error("reflection-trapped built-in wrappers must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("reflection-trapped built-in wrappers must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("reflection-trapped built-in wrappers must not inspect control evidence");
      }
    });
    const wrapperFields = {
      workerDeploymentClass: reservedLiveWorkerDeploymentClass,
      controls: throwingEvidence
    };
    const reflectionTrappedBuiltInWrapperImpostors = [
      Object.assign(new Map(), wrapperFields),
      Object.assign(new Set(), wrapperFields),
      Object.assign(new WeakMap(), wrapperFields),
      Object.assign(new WeakSet(), wrapperFields),
      Object.assign(new ArrayBuffer(8), wrapperFields),
      ...whenSharedArrayBufferExists(() => Object.assign(new SharedArrayBuffer(8), wrapperFields)),
      Object.assign(new Uint8Array(0), wrapperFields),
      Object.assign(new DataView(new ArrayBuffer(8)), wrapperFields),
      Object.assign(Promise.resolve(implementedFrozenControls()), wrapperFields),
      Object.assign(new String(reservedLiveWorkerDeploymentClass), wrapperFields),
      Object.assign(new Number(1), wrapperFields),
      Object.assign(new Boolean(true), wrapperFields),
      Object.assign(Object(Symbol("production-live-campaign")), wrapperFields),
      Object.assign(Object(1n), wrapperFields),
      Object.assign(new Date(0), wrapperFields),
      Object.assign(/production-live-campaign/, wrapperFields),
      Object.assign(new Error("production-live-campaign"), wrapperFields),
      Object.assign(new URL("https://signalstack.local/production-live-campaign"), wrapperFields),
      Object.assign(new URLSearchParams("workerDeploymentClass=production-live-campaign"), wrapperFields),
      Object.assign(new WeakRef(implementedFrozenControls()[0]), wrapperFields),
      Object.assign(new FinalizationRegistry(() => undefined), wrapperFields),
      ...webPlatformBuiltInTargets().map((target) => Object.assign(target, wrapperFields)),
      ...webAssemblyBuiltInTargets().map((target) => Object.assign(target, wrapperFields))
    ].map(
      (target) =>
        new Proxy(target, {
          get: () => {
            throw new Error("reflection-trapped built-in wrapper fields must not be read");
          },
          getPrototypeOf: () => {
            throw new Error("reflection-trapped built-in wrapper prototypes must not escape");
          },
          getOwnPropertyDescriptor: () => {
            throw new Error("reflection-trapped built-in wrapper descriptors must not escape");
          },
          ownKeys: () => {
            throw new Error("reflection-trapped built-in wrapper keys must not escape");
          },
          isExtensible: () => {
            throw new Error("reflection-trapped built-in wrapper frozen-state checks must not escape");
          }
        })
    );

    for (const input of reflectionTrappedBuiltInWrapperImpostors) {
      expect(() => liveWorkerDeploymentClassIsAuthorized(input)).not.toThrow();
      expect(liveWorkerDeploymentClassIsAuthorized(input)).toBe(false);
    }
  });

  it("rejects revoked proxy-backed built-in authorization-wrapper impostors without inspecting controls", () => {
    const throwingEvidence = new Proxy(implementedFrozenControls(), {
      getPrototypeOf: () => {
        throw new Error("revoked built-in wrapper impostors must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("revoked built-in wrapper impostors must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("revoked built-in wrapper impostors must not inspect control evidence");
      }
    });
    const wrapperFields = {
      workerDeploymentClass: reservedLiveWorkerDeploymentClass,
      controls: throwingEvidence
    };
    const revokedProxyBackedBuiltInWrapperImpostors = [
      Object.assign(new Map(), wrapperFields),
      Object.assign(new Set(), wrapperFields),
      Object.assign(new WeakMap(), wrapperFields),
      Object.assign(new WeakSet(), wrapperFields),
      Object.assign(new ArrayBuffer(8), wrapperFields),
      ...whenSharedArrayBufferExists(() => Object.assign(new SharedArrayBuffer(8), wrapperFields)),
      Object.assign(new Uint8Array(0), wrapperFields),
      Object.assign(new DataView(new ArrayBuffer(8)), wrapperFields),
      Object.assign(Promise.resolve(implementedFrozenControls()), wrapperFields),
      Object.assign(new String(reservedLiveWorkerDeploymentClass), wrapperFields),
      Object.assign(new Number(1), wrapperFields),
      Object.assign(new Boolean(true), wrapperFields),
      Object.assign(Object(Symbol("production-live-campaign")), wrapperFields),
      Object.assign(Object(1n), wrapperFields),
      Object.assign(new Date(0), wrapperFields),
      Object.assign(/production-live-campaign/, wrapperFields),
      Object.assign(new Error("production-live-campaign"), wrapperFields),
      Object.assign(new URL("https://signalstack.local/production-live-campaign"), wrapperFields),
      Object.assign(new URLSearchParams("workerDeploymentClass=production-live-campaign"), wrapperFields),
      Object.assign(new WeakRef(implementedFrozenControls()[0]), wrapperFields),
      Object.assign(new FinalizationRegistry(() => undefined), wrapperFields),
      ...webPlatformBuiltInTargets().map((target) => Object.assign(target, wrapperFields)),
      ...webAssemblyBuiltInTargets().map((target) => Object.assign(target, wrapperFields))
    ].map((target) => {
      const { proxy, revoke } = Proxy.revocable(Object.freeze(target), {
        get: () => {
          throw new Error("revoked built-in wrapper fields must not be read");
        }
      });
      revoke();
      return proxy;
    });

    for (const input of revokedProxyBackedBuiltInWrapperImpostors) {
      expect(() => liveWorkerDeploymentClassIsAuthorized(input)).not.toThrow();
      expect(liveWorkerDeploymentClassIsAuthorized(input)).toBe(false);
    }
  });

  it("rejects runtime-supported Web Crypto authorization-wrapper impostors before inspecting controls", async () => {
    const throwingEvidence = new Proxy(implementedFrozenControls(), {
      getPrototypeOf: () => {
        throw new Error("web crypto wrapper impostors must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("web crypto wrapper impostors must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("web crypto wrapper impostors must not inspect control evidence");
      }
    });
    const wrapperFields = {
      workerDeploymentClass: reservedLiveWorkerDeploymentClass,
      controls: throwingEvidence
    };

    const ordinaryWrapperImpostors = (await webCryptoBuiltInTargets()).map((target) =>
      Object.freeze(Object.assign(target, wrapperFields))
    );
    const exactFieldWrapperImpostors = (await webCryptoBuiltInTargets()).map((target) =>
      Object.freeze(
        Object.defineProperties(target, {
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
        })
      )
    );
    const proxyBackedWrapperImpostors = (await webCryptoBuiltInTargets()).map(
      (target) =>
        new Proxy(Object.freeze(Object.assign(target, wrapperFields)), {
          get: () => {
            throw new Error("proxy-backed web crypto wrapper fields must not be read");
          }
        })
    );
    const reflectionTrappedWrapperImpostors = (await webCryptoBuiltInTargets()).map(
      (target) =>
        new Proxy(Object.assign(target, wrapperFields), {
          get: () => {
            throw new Error("reflection-trapped web crypto wrapper fields must not be read");
          },
          getPrototypeOf: () => {
            throw new Error("reflection-trapped web crypto wrapper prototypes must not escape");
          },
          getOwnPropertyDescriptor: () => {
            throw new Error("reflection-trapped web crypto wrapper descriptors must not escape");
          },
          ownKeys: () => {
            throw new Error("reflection-trapped web crypto wrapper keys must not escape");
          },
          isExtensible: () => {
            throw new Error("reflection-trapped web crypto wrapper frozen-state checks must not escape");
          }
        })
    );
    const revokedWrapperImpostors = (await webCryptoBuiltInTargets()).map((target) => {
      const { proxy, revoke } = Proxy.revocable(Object.freeze(Object.assign(target, wrapperFields)), {
        get: () => {
          throw new Error("revoked web crypto wrapper fields must not be read");
        }
      });
      revoke();
      return proxy;
    });

    for (const input of [
      ...ordinaryWrapperImpostors,
      ...exactFieldWrapperImpostors,
      ...proxyBackedWrapperImpostors,
      ...reflectionTrappedWrapperImpostors,
      ...revokedWrapperImpostors
    ]) {
      const authorizationInput = input as { workerDeploymentClass?: unknown; controls?: unknown };
      expect(() => liveWorkerDeploymentClassIsAuthorized(authorizationInput)).not.toThrow();
      expect(liveWorkerDeploymentClassIsAuthorized(authorizationInput)).toBe(false);
    }
  });

  it("rejects tampered authorization wrapper prototypes before inspecting controls", () => {
    const throwingEvidence = new Proxy(implementedFrozenControls(), {
      getPrototypeOf: () => {
        throw new Error("tampered wrapper prototypes must not inspect control evidence");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("tampered wrapper prototypes must not inspect control evidence");
      },
      ownKeys: () => {
        throw new Error("tampered wrapper prototypes must not inspect control evidence");
      }
    });
    const customPrototypeWrapper = Object.freeze(
      Object.create(
        {
          reviewerBypass() {
            return true;
          }
        },
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

    expect(Object.isFrozen(customPrototypeWrapper)).toBe(true);
    expect(() => liveWorkerDeploymentClassIsAuthorized(customPrototypeWrapper)).not.toThrow();
    expect(liveWorkerDeploymentClassIsAuthorized(customPrototypeWrapper)).toBe(false);
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

  it("does not read inherited authorization wrapper accessors while evaluating wrapper evidence", () => {
    const objectPrototype = Object.prototype as Record<string, unknown>;
    const originalClassDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, "workerDeploymentClass");
    const originalControlsDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, "controls");

    try {
      Object.defineProperties(Object.prototype, {
        workerDeploymentClass: {
          configurable: true,
          get: () => {
            throw new Error("inherited workerDeploymentClass getter must not be read");
          }
        },
        controls: {
          configurable: true,
          get: () => {
            throw new Error("inherited controls getter must not be read");
          }
        }
      });

      const exactClassInput = frozenAuthorizationWrapper(
        reservedLiveWorkerDeploymentClass,
        implementedFrozenControls()
      );
      const missingControlsInput = Object.freeze({
        workerDeploymentClass: reservedLiveWorkerDeploymentClass
      });

      expect(() => liveWorkerDeploymentClassIsAuthorized(exactClassInput)).not.toThrow();
      expect(liveWorkerDeploymentClassIsAuthorized(exactClassInput)).toBe(true);
      expect(() => liveWorkerDeploymentClassIsAuthorized(missingControlsInput)).not.toThrow();
      expect(liveWorkerDeploymentClassIsAuthorized(missingControlsInput)).toBe(false);
    } finally {
      if (originalClassDescriptor === undefined) {
        delete objectPrototype.workerDeploymentClass;
      } else {
        Object.defineProperty(Object.prototype, "workerDeploymentClass", originalClassDescriptor);
      }

      if (originalControlsDescriptor === undefined) {
        delete objectPrototype.controls;
      } else {
        Object.defineProperty(Object.prototype, "controls", originalControlsDescriptor);
      }
    }
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

  it("does not read inherited control-entry accessors while evaluating exact frozen evidence", () => {
    const implementedControls = implementedFrozenControls();
    const objectPrototype = Object.prototype as Record<string, unknown>;
    const originalIdDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, "id");
    const originalStatusDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, "status");
    const originalRequirementDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, "requirement");

    let implementedResult: boolean;
    let authorizedResult: boolean;

    try {
      Object.defineProperties(Object.prototype, {
        id: {
          configurable: true,
          get: () => {
            throw new Error("inherited control-entry id getter must not be read");
          }
        },
        status: {
          configurable: true,
          get: () => {
            throw new Error("inherited control-entry status getter must not be read");
          }
        },
        requirement: {
          configurable: true,
          get: () => {
            throw new Error("inherited control-entry requirement getter must not be read");
          }
        }
      });

      implementedResult = liveWorkerControlsAreImplemented(implementedControls);
      authorizedResult = liveWorkerDeploymentClassIsAuthorized(
        frozenAuthorizationWrapper(reservedLiveWorkerDeploymentClass, implementedControls)
      );
    } finally {
      if (originalIdDescriptor === undefined) {
        delete objectPrototype.id;
      } else {
        Object.defineProperty(Object.prototype, "id", originalIdDescriptor);
      }

      if (originalStatusDescriptor === undefined) {
        delete objectPrototype.status;
      } else {
        Object.defineProperty(Object.prototype, "status", originalStatusDescriptor);
      }

      if (originalRequirementDescriptor === undefined) {
        delete objectPrototype.requirement;
      } else {
        Object.defineProperty(Object.prototype, "requirement", originalRequirementDescriptor);
      }
    }

    expect(implementedResult!).toBe(true);
    expect(authorizedResult!).toBe(true);
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
