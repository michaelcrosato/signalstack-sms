import { describe, expect, it } from "vitest";
import {
  allowedDeliveryOperationCommandExecutionStates,
  allowedDeliveryOperationExternalImpactStates,
  allowedDeliveryOperationMutationStates,
  allowedDeliveryOperationSecretsDisplayedStates,
  allowedDeliveryOperationStatusLabels,
  deliveryOperationCheckpoints,
  deliveryOperationSafetyBoundaries,
  getDeliveryOperationsStatus
} from "@/lib/operations/delivery-operations";

const publicCheckpointFields = ["name", "status", "boundary"];
const publicStatusFields = [
  "checkpointCount",
  "safetyBoundaryCount",
  "commandExecution",
  "externalImpact",
  "mutation",
  "secretsDisplayed",
  "checkpoints",
  "safetyBoundaries"
];

function sortedFields(value: object) {
  return Object.keys(value).sort();
}

describe("getDeliveryOperationsStatus", () => {
  it("reports required delivery checkpoints and read-only no-impact states", () => {
    const status = getDeliveryOperationsStatus();

    expect(status.checkpointCount).toBe(3);
    expect(status.safetyBoundaryCount).toBe(4);
    expect(status.commandExecution).toBe("none");
    expect(status.externalImpact).toBe("none");
    expect(status.mutation).toBe("none");
    expect(status.secretsDisplayed).toBe(false);
    expect(status.checkpoints.map((checkpoint) => checkpoint.name)).toEqual([
      "Message rows",
      "Provider status",
      "Delivery retry"
    ]);
  });

  it("exposes only public delivery operations fields", () => {
    const status = getDeliveryOperationsStatus();
    const expectedCheckpointFields = [...publicCheckpointFields].sort();

    expect(sortedFields(status)).toEqual([...publicStatusFields].sort());
    expect(
      deliveryOperationCheckpoints.every(
        (checkpoint) => sortedFields(checkpoint).join("|") === expectedCheckpointFields.join("|")
      )
    ).toBe(true);
    expect(
      status.checkpoints.every((checkpoint) => sortedFields(checkpoint).join("|") === expectedCheckpointFields.join("|"))
    ).toBe(true);
  });

  it("keeps exported and per-call delivery operations snapshots frozen", () => {
    const firstStatus = getDeliveryOperationsStatus();
    const secondStatus = getDeliveryOperationsStatus();
    const firstCheckpoint = firstStatus.checkpoints[0];

    expect(Object.isFrozen(deliveryOperationCheckpoints)).toBe(true);
    expect(deliveryOperationCheckpoints.every((checkpoint) => Object.isFrozen(checkpoint))).toBe(true);
    expect(Object.isFrozen(deliveryOperationSafetyBoundaries)).toBe(true);
    expect(Object.isFrozen(firstStatus)).toBe(true);
    expect(Object.isFrozen(firstStatus.checkpoints)).toBe(true);
    expect(Object.isFrozen(firstStatus.safetyBoundaries)).toBe(true);
    expect(firstStatus.checkpoints).not.toBe(secondStatus.checkpoints);
    expect(firstStatus.safetyBoundaries).not.toBe(secondStatus.safetyBoundaries);
    expect(firstStatus.checkpoints[0]).not.toBe(deliveryOperationCheckpoints[0]);
    expect(() => (firstStatus.checkpoints as unknown as Array<(typeof deliveryOperationCheckpoints)[number]>).pop()).toThrow(TypeError);
    expect(() => ((firstCheckpoint as { status: string }).status = "unsafe")).toThrow(TypeError);
    expect(getDeliveryOperationsStatus().checkpoints[0].status).toBe(deliveryOperationCheckpoints[0].status);
  });

  it("keeps delivery operation returned arrays detached while counts stay aligned", () => {
    const status = getDeliveryOperationsStatus();

    expect(status.checkpointCount).toBe(status.checkpoints.length);
    expect(status.safetyBoundaryCount).toBe(status.safetyBoundaries.length);
    expect(status.checkpoints).toEqual(deliveryOperationCheckpoints);
    expect(status.safetyBoundaries).toEqual(deliveryOperationSafetyBoundaries);
    expect(status.checkpoints).not.toBe(deliveryOperationCheckpoints);
    expect(status.safetyBoundaries).not.toBe(deliveryOperationSafetyBoundaries);
  });

  it("keeps delivery operation metadata in canonical local-only shape", () => {
    expect(deliveryOperationCheckpoints.map((checkpoint) => checkpoint.name).filter((name) => name.trim().length === 0)).toEqual([]);
    expect(deliveryOperationCheckpoints.map((checkpoint) => checkpoint.status).filter((status) => status.trim().length === 0)).toEqual([]);
    expect(deliveryOperationCheckpoints.map((checkpoint) => checkpoint.boundary).filter((boundary) => boundary.trim().length === 0)).toEqual([]);
    expect(deliveryOperationSafetyBoundaries.filter((boundary) => boundary.trim().length === 0)).toEqual([]);
  });

  it("keeps delivery operation static metadata whitespace-clean", () => {
    const staticCopy = [
      ...deliveryOperationCheckpoints.flatMap((checkpoint) => [checkpoint.name, checkpoint.status, checkpoint.boundary]),
      ...deliveryOperationSafetyBoundaries
    ];

    expect(staticCopy.filter((copy) => copy !== copy.trim())).toEqual([]);
    expect(staticCopy.filter((copy) => copy.includes("\n") || copy.includes("\r"))).toEqual([]);
    expect(staticCopy.filter((copy) => copy.includes("  "))).toEqual([]);
  });

  it("keeps delivery operation values inside documented no-impact boundaries", () => {
    expect(allowedDeliveryOperationStatusLabels).toEqual(["local only", "provider reported", "blocked"]);
    expect(Object.isFrozen(allowedDeliveryOperationStatusLabels)).toBe(true);
    expect(deliveryOperationCheckpoints.map((checkpoint) => checkpoint.status)).toEqual([
      "local only",
      "provider reported",
      "blocked"
    ]);

    const safetyCopy = deliveryOperationSafetyBoundaries.join(" ");

    expect(safetyCopy).toContain("SMS");
    expect(safetyCopy).toContain("retry");
    expect(safetyCopy).toContain("webhook");
    expect(safetyCopy).toContain("provider calls");
    expect(safetyCopy).toContain("billing");
    expect(safetyCopy).toContain("notifications");
    expect(safetyCopy).toContain("mutations");
    expect(safetyCopy).toContain("secrets");
  });

  it("keeps delivery operation summary states inside the no-impact vocabulary", () => {
    const status = getDeliveryOperationsStatus();

    expect(allowedDeliveryOperationCommandExecutionStates).toEqual(["none"]);
    expect(allowedDeliveryOperationExternalImpactStates).toEqual(["none"]);
    expect(allowedDeliveryOperationMutationStates).toEqual(["none"]);
    expect(allowedDeliveryOperationSecretsDisplayedStates).toEqual([false]);
    expect(Object.isFrozen(allowedDeliveryOperationCommandExecutionStates)).toBe(true);
    expect(Object.isFrozen(allowedDeliveryOperationExternalImpactStates)).toBe(true);
    expect(Object.isFrozen(allowedDeliveryOperationMutationStates)).toBe(true);
    expect(Object.isFrozen(allowedDeliveryOperationSecretsDisplayedStates)).toBe(true);
    expect(allowedDeliveryOperationCommandExecutionStates).toContain(status.commandExecution);
    expect(allowedDeliveryOperationExternalImpactStates).toContain(status.externalImpact);
    expect(allowedDeliveryOperationMutationStates).toContain(status.mutation);
    expect(allowedDeliveryOperationSecretsDisplayedStates).toContain(status.secretsDisplayed);
  });

  it("keeps exported delivery operation vocabularies frozen against caller mutation", () => {
    const vocabularies = [
      allowedDeliveryOperationStatusLabels,
      allowedDeliveryOperationCommandExecutionStates,
      allowedDeliveryOperationExternalImpactStates,
      allowedDeliveryOperationMutationStates,
      allowedDeliveryOperationSecretsDisplayedStates
    ];

    for (const vocabulary of vocabularies) {
      expect(Object.isFrozen(vocabulary)).toBe(true);
      expect(() => (vocabulary as unknown as unknown[]).push("unsafe")).toThrow(TypeError);
    }
  });

  it("keeps delivery operation inventory order stable for local review pages", () => {
    expect(deliveryOperationCheckpoints).toEqual([
      {
        name: "Message rows",
        status: "local only",
        boundary: "Existing message rows are counted and listed without changing delivery state or message bodies."
      },
      {
        name: "Provider status",
        status: "provider reported",
        boundary: "Stored provider status labels are displayed as local metadata without provider calls or lookups."
      },
      {
        name: "Delivery retry",
        status: "blocked",
        boundary: "Retry actions are unavailable here; local review cannot enqueue jobs, replay webhooks, or send SMS."
      }
    ]);
    expect(deliveryOperationSafetyBoundaries).toEqual([
      "This view reviews existing local delivery metadata only and does not send SMS or retry messages.",
      "webhook replay, provider calls, provider lookups, billing, notifications, and queue mutations are unavailable here.",
      "Message, campaign, contact, and delivery-status mutations stay outside this read-only operations surface.",
      "No secrets, provider tokens, raw environment values, live messaging toggles, or live feature enablement are displayed."
    ]);
  });

  it("keeps delivery operation identifiers unique before local review pages render them", () => {
    const checkpointNames = deliveryOperationCheckpoints.map((checkpoint) => checkpoint.name);

    expect(new Set(checkpointNames).size).toBe(checkpointNames.length);
    expect(new Set(deliveryOperationSafetyBoundaries).size).toBe(deliveryOperationSafetyBoundaries.length);
  });

  it("keeps delivery operation static metadata free of secret-like literals", () => {
    const staticCopy = [
      ...deliveryOperationCheckpoints.flatMap((checkpoint) => [checkpoint.name, checkpoint.status, checkpoint.boundary]),
      ...deliveryOperationSafetyBoundaries
    ];
    const secretLikePatterns = [
      /\bsk_(?:live|test)_[A-Za-z0-9]+/,
      /\bpk_live_[A-Za-z0-9]+/,
      /\bAC[a-fA-F0-9]{32}\b/,
      /\b(?:TWILIO_AUTH_TOKEN|STRIPE_SECRET_KEY|OPENAI_API_KEY|CLERK_SECRET_KEY)\s*=/,
      /\bBearer\s+[A-Za-z0-9._-]{12,}/
    ];

    expect(staticCopy.filter((copy) => secretLikePatterns.some((pattern) => pattern.test(copy)))).toEqual([]);
  });

  it("keeps delivery operation static metadata free of command-like literals", () => {
    const staticCopy = [
      ...deliveryOperationCheckpoints.flatMap((checkpoint) => [checkpoint.name, checkpoint.status, checkpoint.boundary]),
      ...deliveryOperationSafetyBoundaries
    ];
    const commandLikePatterns = [
      /\bnpm\s+run\b/i,
      /\bnpx\b/i,
      /\bpowershell\b/i,
      /\bcurl\b/i,
      /\bInvoke-WebRequest\b/i
    ];

    expect(staticCopy.filter((copy) => commandLikePatterns.some((pattern) => pattern.test(copy)))).toEqual([]);
  });
});
