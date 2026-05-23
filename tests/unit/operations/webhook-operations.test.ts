import { describe, expect, it } from "vitest";
import {
  allowedWebhookOperationCommandExecutionStates,
  allowedWebhookOperationEventTypes,
  allowedWebhookOperationExternalImpactStates,
  allowedWebhookOperationMutationStates,
  allowedWebhookOperationRouteLabels,
  allowedWebhookOperationSecretsDisplayedStates,
  getWebhookOperationsStatus,
  webhookOperationRoutes,
  webhookOperationSafetyBoundaries
} from "@/lib/operations/webhook-operations";

const publicRouteFields = ["label", "path", "eventType", "behavior"];
const publicStatusFields = [
  "routeCount",
  "safetyBoundaryCount",
  "commandExecution",
  "externalImpact",
  "mutation",
  "secretsDisplayed",
  "routes",
  "eventTypes",
  "safetyBoundaries"
];

function sortedFields(value: object) {
  return Object.keys(value).sort();
}

describe("getWebhookOperationsStatus", () => {
  it("reports Twilio webhook routes and read-only no-impact states", () => {
    const status = getWebhookOperationsStatus();

    expect(status.routeCount).toBe(2);
    expect(status.safetyBoundaryCount).toBe(4);
    expect(status.commandExecution).toBe("none");
    expect(status.externalImpact).toBe("none");
    expect(status.mutation).toBe("none");
    expect(status.secretsDisplayed).toBe(false);
    expect(status.routes.map((route) => route.path)).toEqual([
      "/api/webhooks/twilio/inbound",
      "/api/webhooks/twilio/status"
    ]);
  });

  it("exposes only public webhook operations fields", () => {
    const status = getWebhookOperationsStatus();
    const expectedRouteFields = [...publicRouteFields].sort();

    expect(sortedFields(status)).toEqual([...publicStatusFields].sort());
    expect(webhookOperationRoutes.every((route) => sortedFields(route).join("|") === expectedRouteFields.join("|"))).toBe(true);
    expect(status.routes.every((route) => sortedFields(route).join("|") === expectedRouteFields.join("|"))).toBe(true);
  });

  it("keeps exported and per-call webhook operations snapshots frozen", () => {
    const firstStatus = getWebhookOperationsStatus();
    const secondStatus = getWebhookOperationsStatus();
    const firstRoute = firstStatus.routes[0];

    expect(Object.isFrozen(webhookOperationRoutes)).toBe(true);
    expect(webhookOperationRoutes.every((route) => Object.isFrozen(route))).toBe(true);
    expect(Object.isFrozen(webhookOperationSafetyBoundaries)).toBe(true);
    expect(Object.isFrozen(firstStatus)).toBe(true);
    expect(Object.isFrozen(firstStatus.routes)).toBe(true);
    expect(Object.isFrozen(firstStatus.eventTypes)).toBe(true);
    expect(Object.isFrozen(firstStatus.safetyBoundaries)).toBe(true);
    expect(firstStatus.routes).not.toBe(secondStatus.routes);
    expect(firstStatus.safetyBoundaries).not.toBe(secondStatus.safetyBoundaries);
    expect(firstStatus.routes[0]).not.toBe(webhookOperationRoutes[0]);
    expect(() => (firstStatus.routes as unknown as Array<(typeof webhookOperationRoutes)[number]>).pop()).toThrow(TypeError);
    expect(() => ((firstRoute as { behavior: string }).behavior = "unsafe")).toThrow(TypeError);
    expect(getWebhookOperationsStatus().routes[0].behavior).toBe(webhookOperationRoutes[0].behavior);
  });

  it("keeps webhook operation returned arrays detached while counts stay aligned", () => {
    const status = getWebhookOperationsStatus();

    expect(status.routeCount).toBe(status.routes.length);
    expect(status.safetyBoundaryCount).toBe(status.safetyBoundaries.length);
    expect(status.routes).toEqual(webhookOperationRoutes);
    expect(status.eventTypes).toEqual(allowedWebhookOperationEventTypes);
    expect(status.safetyBoundaries).toEqual(webhookOperationSafetyBoundaries);
    expect(status.routes).not.toBe(webhookOperationRoutes);
    expect(status.eventTypes).not.toBe(allowedWebhookOperationEventTypes);
    expect(status.safetyBoundaries).not.toBe(webhookOperationSafetyBoundaries);
  });

  it("keeps webhook operation values inside supported vocabularies", () => {
    const status = getWebhookOperationsStatus();

    expect(allowedWebhookOperationRouteLabels).toEqual(["Twilio inbound", "Twilio status"]);
    expect(allowedWebhookOperationEventTypes).toEqual(["inbound", "status"]);
    expect(Object.isFrozen(allowedWebhookOperationRouteLabels)).toBe(true);
    expect(Object.isFrozen(allowedWebhookOperationEventTypes)).toBe(true);
    expect(status.routes.map((route) => route.label)).toEqual(allowedWebhookOperationRouteLabels);
    expect(status.routes.map((route) => route.eventType)).toEqual(allowedWebhookOperationEventTypes);
  });

  it("keeps webhook operation no-impact summary states inside supported vocabularies", () => {
    const status = getWebhookOperationsStatus();

    expect(allowedWebhookOperationCommandExecutionStates).toEqual(["none"]);
    expect(allowedWebhookOperationExternalImpactStates).toEqual(["none"]);
    expect(allowedWebhookOperationMutationStates).toEqual(["none"]);
    expect(allowedWebhookOperationSecretsDisplayedStates).toEqual([false]);
    expect(Object.isFrozen(allowedWebhookOperationCommandExecutionStates)).toBe(true);
    expect(Object.isFrozen(allowedWebhookOperationExternalImpactStates)).toBe(true);
    expect(Object.isFrozen(allowedWebhookOperationMutationStates)).toBe(true);
    expect(Object.isFrozen(allowedWebhookOperationSecretsDisplayedStates)).toBe(true);
    expect(allowedWebhookOperationCommandExecutionStates).toContain(status.commandExecution);
    expect(allowedWebhookOperationExternalImpactStates).toContain(status.externalImpact);
    expect(allowedWebhookOperationMutationStates).toContain(status.mutation);
    expect(allowedWebhookOperationSecretsDisplayedStates).toContain(status.secretsDisplayed);
  });

  it("keeps exported webhook operation vocabularies frozen against caller mutation", () => {
    const vocabularies = [
      allowedWebhookOperationRouteLabels,
      allowedWebhookOperationEventTypes,
      allowedWebhookOperationCommandExecutionStates,
      allowedWebhookOperationExternalImpactStates,
      allowedWebhookOperationMutationStates,
      allowedWebhookOperationSecretsDisplayedStates
    ];

    for (const vocabulary of vocabularies) {
      expect(Object.isFrozen(vocabulary)).toBe(true);
      expect(() => (vocabulary as unknown as unknown[]).push("unsafe")).toThrow(TypeError);
    }
  });

  it("keeps webhook operation inventory order stable for local review pages", () => {
    expect(webhookOperationRoutes).toEqual([
      {
        label: "Twilio inbound",
        path: "/api/webhooks/twilio/inbound",
        eventType: "inbound",
        behavior: "stores raw payloads and creates local inbound inbox messages"
      },
      {
        label: "Twilio status",
        path: "/api/webhooks/twilio/status",
        eventType: "status",
        behavior: "stores raw payloads and updates matching local delivery metadata"
      }
    ]);
    expect(webhookOperationSafetyBoundaries).toEqual([
      "This view reviews existing local webhook metadata only and does not replay webhooks.",
      "webhook replay, provider calls, outbound replies, billing, notifications, and SMS are unavailable here.",
      "message mutations and contact mutations stay in signed webhook handlers, not this read-only operations surface.",
      "No secrets, provider tokens, raw environment values, live messaging toggles, or live feature enablement are displayed."
    ]);
  });

  it("keeps webhook operation identifiers unique before local review pages render them", () => {
    const routeLabels = webhookOperationRoutes.map((route) => route.label);
    const routePaths = webhookOperationRoutes.map((route) => route.path);

    expect(new Set(routeLabels).size).toBe(routeLabels.length);
    expect(new Set(routePaths).size).toBe(routePaths.length);
    expect(new Set(webhookOperationSafetyBoundaries).size).toBe(webhookOperationSafetyBoundaries.length);
  });

  it("keeps webhook operation static metadata whitespace-clean", () => {
    const staticCopy = [
      ...webhookOperationRoutes.flatMap((route) => [route.label, route.path, route.eventType, route.behavior]),
      ...webhookOperationSafetyBoundaries
    ];

    expect(staticCopy.filter((copy) => copy !== copy.trim())).toEqual([]);
    expect(staticCopy.filter((copy) => copy.includes("\n") || copy.includes("\r"))).toEqual([]);
    expect(staticCopy.filter((copy) => copy.includes("  "))).toEqual([]);
  });

  it("keeps webhook operation safety boundaries explicit", () => {
    const safetyCopy = webhookOperationSafetyBoundaries.join(" ");

    expect(safetyCopy).toContain("webhook replay");
    expect(safetyCopy).toContain("provider calls");
    expect(safetyCopy).toContain("outbound replies");
    expect(safetyCopy).toContain("message mutations");
    expect(safetyCopy).toContain("contact mutations");
    expect(safetyCopy).toContain("notifications");
    expect(safetyCopy).toContain("billing");
    expect(safetyCopy).toContain("SMS");
    expect(safetyCopy).toContain("secrets");
  });

  it("keeps webhook operation static metadata free of secret-like literals", () => {
    const staticCopy = [
      ...webhookOperationRoutes.flatMap((route) => [route.label, route.path, route.eventType, route.behavior]),
      ...webhookOperationSafetyBoundaries
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

  it("keeps webhook operation static metadata free of command-like literals", () => {
    const staticCopy = [
      ...webhookOperationRoutes.flatMap((route) => [route.label, route.path, route.eventType, route.behavior]),
      ...webhookOperationSafetyBoundaries
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
