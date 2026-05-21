export type NotificationOperationChannel = {
  name: string;
  status: string;
  boundary: string;
};

export type NotificationOperationsStatus = {
  channelCount: number;
  controlCount: number;
  safetyBoundaryCount: number;
  commandExecution: "none";
  externalImpact: "none";
  secretsDisplayed: false;
  channels: readonly NotificationOperationChannel[];
  controls: readonly string[];
  safetyBoundaries: readonly string[];
};

const notificationOperationChannelFields = ["name", "status", "boundary"] as const;
const allowedNotificationOperationChannelStatuses = ["blocked", "not implemented", "inbound only"] as const;
const requiredNotificationBoundaryTerms = ["email", "SMS", "webhooks", "provider calls", "billing", "mutations"] as const;
const forbiddenSecretMetadataPatterns = [
  /\bsk_(?:live|test)_[A-Za-z0-9]+/,
  /\bpk_live_[A-Za-z0-9]+/,
  /\bAC[a-fA-F0-9]{32}\b/,
  /\b(?:TWILIO_AUTH_TOKEN|STRIPE_SECRET_KEY|OPENAI_API_KEY|CLERK_SECRET_KEY)\s*=/,
  /\bBearer\s+[A-Za-z0-9._-]{12,}/
] as const;

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

function assertChannel(channel: NotificationOperationChannel) {
  assertExactFields(channel, notificationOperationChannelFields, "Invalid notification operation channel fields");
  assertNonblankString(channel.name, "Invalid notification operation channel name");
  assertNonblankString(channel.status, `Invalid notification operation status for ${channel.name}`);
  assertNonblankString(channel.boundary, `Invalid notification operation boundary for ${channel.name}`);
  assertNoSecretLikeMetadata(channel.name, `Secret-like notification operation channel name for ${channel.name}`);
  assertNoSecretLikeMetadata(channel.boundary, `Secret-like notification operation boundary for ${channel.name}`);

  if (!allowedNotificationOperationChannelStatuses.includes(channel.status as (typeof allowedNotificationOperationChannelStatuses)[number])) {
    throw new Error(`Unsupported notification operation status for ${channel.name}`);
  }
}

function freezeChannels(channels: NotificationOperationChannel[]) {
  for (const channel of channels) {
    assertChannel(channel);
  }

  assertUniqueValues(
    channels.map((channel) => channel.name),
    "Duplicate notification operation channel names"
  );

  return Object.freeze(
    channels.map((channel) =>
      Object.freeze({
        name: channel.name,
        status: channel.status,
        boundary: channel.boundary
      })
    )
  );
}

function freezeCopyList(values: string[], label: string) {
  for (const value of values) {
    assertNonblankString(value, `Invalid notification operation ${label}`);
    assertNoSecretLikeMetadata(value, `Secret-like notification operation ${label}`);
  }

  assertUniqueValues(values, `Duplicate notification operation ${label}s`);

  return Object.freeze([...values]);
}

function freezeSafetyBoundaries(boundaries: string[]) {
  const frozenBoundaries = freezeCopyList(boundaries, "safety boundary");
  const joinedBoundaries = frozenBoundaries.join(" ");
  const missingBoundaryTerms = requiredNotificationBoundaryTerms.filter((term) => !joinedBoundaries.includes(term));

  if (missingBoundaryTerms.length > 0) {
    throw new Error(`Missing notification operation safety boundary terms: ${missingBoundaryTerms.join(", ")}`);
  }

  return frozenBoundaries;
}

export const notificationOperationChannels = freezeChannels([
  {
    name: "Email",
    status: "blocked",
    boundary: "No SMTP, transactional email, invite email, or alert email provider is configured or called."
  },
  {
    name: "In-app",
    status: "not implemented",
    boundary: "No live notification feed, browser push, or background notification job exists."
  },
  {
    name: "SMS alerts",
    status: "blocked",
    boundary: "Operational alerts cannot send SMS; messaging remains campaign and inbox data only under hard gates."
  },
  {
    name: "Webhooks",
    status: "inbound only",
    boundary: "Webhook routes receive provider events locally; they do not emit outbound notifications."
  }
]);

export const notificationOperationControls = freezeCopyList(
  [
    "LIVE_MESSAGING_ENABLED must remain false for local validation.",
    "LIVE_BILLING_ENABLED must remain false for local validation.",
    "No notification provider API keys are required for demo mode.",
    "No background notification worker is part of the current local gate.",
    "Operator review is limited to existing local pages and CSV links."
  ],
  "control"
);

export const notificationOperationSafetyBoundaries = freezeSafetyBoundaries([
  "This view does not create notification subscriptions, recipients, templates, jobs, or audit sends.",
  "Existing webhook routes are inbound persistence surfaces only and do not create automatic outbound replies.",
  "Existing billing and provider metadata pages do not send email, SMS, webhooks, provider calls, or live operational alerts.",
  "Future notification providers require explicit contracts, hard gates, tests, demo-safe defaults, and no mutations first."
]);

export function getNotificationOperationsStatus(): NotificationOperationsStatus {
  return Object.freeze({
    channelCount: notificationOperationChannels.length,
    controlCount: notificationOperationControls.length,
    safetyBoundaryCount: notificationOperationSafetyBoundaries.length,
    commandExecution: "none",
    externalImpact: "none",
    secretsDisplayed: false,
    channels: freezeChannels(notificationOperationChannels.map((channel) => ({ ...channel }))),
    controls: freezeCopyList([...notificationOperationControls], "control"),
    safetyBoundaries: freezeSafetyBoundaries([...notificationOperationSafetyBoundaries])
  });
}
