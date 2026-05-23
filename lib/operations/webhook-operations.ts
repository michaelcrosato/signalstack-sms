export const allowedWebhookOperationRouteLabels = Object.freeze(["Twilio inbound", "Twilio status"] as const);
export const allowedWebhookOperationEventTypes = Object.freeze(["inbound", "status"] as const);
export const allowedWebhookOperationCommandExecutionStates = Object.freeze(["none"] as const);
export const allowedWebhookOperationExternalImpactStates = Object.freeze(["none"] as const);
export const allowedWebhookOperationMutationStates = Object.freeze(["none"] as const);
export const allowedWebhookOperationSecretsDisplayedStates = Object.freeze([false] as const);

export type WebhookOperationRouteLabel = (typeof allowedWebhookOperationRouteLabels)[number];
export type WebhookOperationEventType = (typeof allowedWebhookOperationEventTypes)[number];
export type WebhookOperationCommandExecutionState = (typeof allowedWebhookOperationCommandExecutionStates)[number];
export type WebhookOperationExternalImpactState = (typeof allowedWebhookOperationExternalImpactStates)[number];
export type WebhookOperationMutationState = (typeof allowedWebhookOperationMutationStates)[number];
export type WebhookOperationSecretsDisplayedState = (typeof allowedWebhookOperationSecretsDisplayedStates)[number];

export type WebhookOperationRoute = {
  label: WebhookOperationRouteLabel;
  path: string;
  eventType: WebhookOperationEventType;
  behavior: string;
};

export type WebhookOperationsStatus = {
  routeCount: number;
  safetyBoundaryCount: number;
  commandExecution: WebhookOperationCommandExecutionState;
  externalImpact: WebhookOperationExternalImpactState;
  mutation: WebhookOperationMutationState;
  secretsDisplayed: WebhookOperationSecretsDisplayedState;
  routes: readonly WebhookOperationRoute[];
  eventTypes: readonly WebhookOperationEventType[];
  safetyBoundaries: readonly string[];
};

const webhookOperationRouteFields = ["label", "path", "eventType", "behavior"] as const;
const requiredWebhookBoundaryTerms = [
  "webhook replay",
  "provider calls",
  "outbound replies",
  "message mutations",
  "contact mutations",
  "notifications",
  "billing",
  "SMS",
  "secrets"
] as const;
const forbiddenCommandMetadataPatterns = [
  /\bnpm\s+run\b/i,
  /\bnpx\b/i,
  /\bpowershell\b/i,
  /\bcurl\b/i,
  /\bInvoke-WebRequest\b/i
] as const;
const forbiddenSecretMetadataPatterns = [
  /\bsk_(?:live|test)_[A-Za-z0-9]+/,
  /\bpk_live_[A-Za-z0-9]+/,
  /\bAC[a-fA-F0-9]{32}\b/,
  /\b(?:TWILIO_AUTH_TOKEN|STRIPE_SECRET_KEY|OPENAI_API_KEY|CLERK_SECRET_KEY)\s*=/,
  /\bBearer\s+[A-Za-z0-9._-]{12,}/
] as const;

const webhookOperationStatusSummary = Object.freeze({
  commandExecution: "none",
  externalImpact: "none",
  mutation: "none",
  secretsDisplayed: false
} satisfies Pick<WebhookOperationsStatus, "commandExecution" | "externalImpact" | "mutation" | "secretsDisplayed">);

function assertExactFields<T extends object>(value: T, fields: readonly string[], errorMessage: string) {
  const actualKeys = Reflect.ownKeys(value);

  if (actualKeys.length !== fields.length || actualKeys.some((key) => !fields.includes(String(key)))) {
    throw new Error(errorMessage);
  }
}

function assertNonblankString(value: unknown, errorMessage: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(errorMessage);
  }
}

function assertCleanCopy(value: string, errorMessage: string) {
  if (value !== value.trim() || value.includes("\n") || value.includes("\r") || value.includes("  ")) {
    throw new Error(errorMessage);
  }
}

function assertUniqueValues(values: readonly string[], errorMessage: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(errorMessage);
  }
}

function assertNoSecretLikeMetadata(value: string, errorMessage: string) {
  if (forbiddenSecretMetadataPatterns.some((pattern) => pattern.test(value))) {
    throw new Error(errorMessage);
  }
}

function assertNoCommandLikeMetadata(value: string, errorMessage: string) {
  if (forbiddenCommandMetadataPatterns.some((pattern) => pattern.test(value))) {
    throw new Error(errorMessage);
  }
}

function assertRoute(route: WebhookOperationRoute) {
  assertExactFields(route, webhookOperationRouteFields, "Invalid webhook operation route fields");
  assertNonblankString(route.label, "Invalid webhook operation route label");
  assertNonblankString(route.path, `Invalid webhook operation route path for ${route.label}`);
  assertNonblankString(route.eventType, `Invalid webhook operation event type for ${route.label}`);
  assertNonblankString(route.behavior, `Invalid webhook operation behavior for ${route.label}`);
  assertCleanCopy(route.label, `Whitespace-unsafe webhook operation route label for ${route.label}`);
  assertCleanCopy(route.path, `Whitespace-unsafe webhook operation route path for ${route.label}`);
  assertCleanCopy(route.eventType, `Whitespace-unsafe webhook operation event type for ${route.label}`);
  assertCleanCopy(route.behavior, `Whitespace-unsafe webhook operation behavior for ${route.label}`);
  assertNoSecretLikeMetadata(route.label, `Secret-like webhook operation route label for ${route.label}`);
  assertNoSecretLikeMetadata(route.path, `Secret-like webhook operation route path for ${route.label}`);
  assertNoSecretLikeMetadata(route.eventType, `Secret-like webhook operation event type for ${route.label}`);
  assertNoSecretLikeMetadata(route.behavior, `Secret-like webhook operation behavior for ${route.label}`);
  assertNoCommandLikeMetadata(route.label, `Command-like webhook operation route label for ${route.label}`);
  assertNoCommandLikeMetadata(route.path, `Command-like webhook operation route path for ${route.label}`);
  assertNoCommandLikeMetadata(route.eventType, `Command-like webhook operation event type for ${route.label}`);
  assertNoCommandLikeMetadata(route.behavior, `Command-like webhook operation behavior for ${route.label}`);

  if (!allowedWebhookOperationRouteLabels.includes(route.label)) {
    throw new Error(`Unsupported webhook operation route label for ${route.label}`);
  }

  if (!allowedWebhookOperationEventTypes.includes(route.eventType)) {
    throw new Error(`Unsupported webhook operation event type for ${route.label}`);
  }

  if (!route.path.startsWith("/api/webhooks/")) {
    throw new Error(`Invalid webhook operation route path shape for ${route.label}`);
  }
}

function freezeRoutes(routes: WebhookOperationRoute[]) {
  for (const route of routes) {
    assertRoute(route);
  }

  assertUniqueValues(
    routes.map((route) => route.path),
    "Duplicate webhook operation route paths"
  );
  assertUniqueValues(
    routes.map((route) => route.label),
    "Duplicate webhook operation route labels"
  );

  return Object.freeze(
    routes.map((route) =>
      Object.freeze({
        label: route.label,
        path: route.path,
        eventType: route.eventType,
        behavior: route.behavior
      })
    )
  );
}

function freezeSafetyBoundaries(boundaries: string[]) {
  for (const boundary of boundaries) {
    assertNonblankString(boundary, "Invalid webhook operation safety boundary");
    assertCleanCopy(boundary, "Whitespace-unsafe webhook operation safety boundary");
    assertNoSecretLikeMetadata(boundary, "Secret-like webhook operation safety boundary");
    assertNoCommandLikeMetadata(boundary, "Command-like webhook operation safety boundary");
  }

  assertUniqueValues(boundaries, "Duplicate webhook operation safety boundaries");

  const joinedBoundaries = boundaries.join(" ");
  const missingTerms = requiredWebhookBoundaryTerms.filter((term) => !joinedBoundaries.includes(term));

  if (missingTerms.length > 0) {
    throw new Error(`Missing webhook operation safety boundary terms: ${missingTerms.join(", ")}`);
  }

  return Object.freeze([...boundaries]);
}

function assertStatusSummary(
  summary: Pick<WebhookOperationsStatus, "commandExecution" | "externalImpact" | "mutation" | "secretsDisplayed">
) {
  if (!allowedWebhookOperationCommandExecutionStates.includes(summary.commandExecution)) {
    throw new Error(`Unsupported webhook operation command execution state: ${summary.commandExecution}`);
  }

  if (!allowedWebhookOperationExternalImpactStates.includes(summary.externalImpact)) {
    throw new Error(`Unsupported webhook operation external impact state: ${summary.externalImpact}`);
  }

  if (!allowedWebhookOperationMutationStates.includes(summary.mutation)) {
    throw new Error(`Unsupported webhook operation mutation state: ${summary.mutation}`);
  }

  if (!allowedWebhookOperationSecretsDisplayedStates.includes(summary.secretsDisplayed)) {
    throw new Error(`Unsupported webhook operation secrets-displayed state: ${summary.secretsDisplayed}`);
  }
}

export const webhookOperationRoutes = freezeRoutes([
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

export const webhookOperationSafetyBoundaries = freezeSafetyBoundaries([
  "This view reviews existing local webhook metadata only and does not replay webhooks.",
  "webhook replay, provider calls, outbound replies, billing, notifications, and SMS are unavailable here.",
  "message mutations and contact mutations stay in signed webhook handlers, not this read-only operations surface.",
  "No secrets, provider tokens, raw environment values, live messaging toggles, or live feature enablement are displayed."
]);

export function getWebhookOperationsStatus(): WebhookOperationsStatus {
  assertStatusSummary(webhookOperationStatusSummary);

  return Object.freeze({
    routeCount: webhookOperationRoutes.length,
    safetyBoundaryCount: webhookOperationSafetyBoundaries.length,
    commandExecution: webhookOperationStatusSummary.commandExecution,
    externalImpact: webhookOperationStatusSummary.externalImpact,
    mutation: webhookOperationStatusSummary.mutation,
    secretsDisplayed: webhookOperationStatusSummary.secretsDisplayed,
    routes: freezeRoutes(webhookOperationRoutes.map((route) => ({ ...route }))),
    eventTypes: Object.freeze([...allowedWebhookOperationEventTypes]),
    safetyBoundaries: freezeSafetyBoundaries([...webhookOperationSafetyBoundaries])
  });
}
