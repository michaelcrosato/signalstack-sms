import { describe, expect, it } from "vitest";
import {
  allowedNotificationOperationChannelStatuses,
  getNotificationOperationsStatus,
  notificationOperationChannels,
  notificationOperationControls,
  notificationOperationSafetyBoundaries
} from "@/lib/operations/notification-operations";

const publicChannelFields = ["name", "status", "boundary"];
const publicStatusFields = [
  "channelCount",
  "controlCount",
  "safetyBoundaryCount",
  "commandExecution",
  "externalImpact",
  "secretsDisplayed",
  "channels",
  "controls",
  "safetyBoundaries"
];

function sortedFields(value: object) {
  return Object.keys(value).sort();
}

describe("getNotificationOperationsStatus", () => {
  it("reports required notification channel inventory and read-only counts", () => {
    const status = getNotificationOperationsStatus();

    expect(status.channelCount).toBe(4);
    expect(status.controlCount).toBe(5);
    expect(status.safetyBoundaryCount).toBe(4);
    expect(status.commandExecution).toBe("none");
    expect(status.externalImpact).toBe("none");
    expect(status.secretsDisplayed).toBe(false);
    expect(status.channels.map((channel) => channel.name)).toEqual(["Email", "In-app", "SMS alerts", "Webhooks"]);
  });

  it("exposes only public notification operations fields", () => {
    const status = getNotificationOperationsStatus();
    const expectedChannelFields = [...publicChannelFields].sort();

    expect(sortedFields(status)).toEqual([...publicStatusFields].sort());
    expect(notificationOperationChannels.every((channel) => sortedFields(channel).join("|") === expectedChannelFields.join("|"))).toBe(true);
    expect(status.channels.every((channel) => sortedFields(channel).join("|") === expectedChannelFields.join("|"))).toBe(true);
  });

  it("keeps exported and per-call notification operations snapshots frozen", () => {
    const firstStatus = getNotificationOperationsStatus();
    const secondStatus = getNotificationOperationsStatus();
    const firstChannel = firstStatus.channels[0];

    expect(Object.isFrozen(notificationOperationChannels)).toBe(true);
    expect(notificationOperationChannels.every((channel) => Object.isFrozen(channel))).toBe(true);
    expect(Object.isFrozen(notificationOperationControls)).toBe(true);
    expect(Object.isFrozen(notificationOperationSafetyBoundaries)).toBe(true);
    expect(Object.isFrozen(firstStatus)).toBe(true);
    expect(Object.isFrozen(firstStatus.channels)).toBe(true);
    expect(Object.isFrozen(firstStatus.controls)).toBe(true);
    expect(Object.isFrozen(firstStatus.safetyBoundaries)).toBe(true);
    expect(firstStatus.channels).not.toBe(secondStatus.channels);
    expect(firstStatus.controls).not.toBe(secondStatus.controls);
    expect(firstStatus.safetyBoundaries).not.toBe(secondStatus.safetyBoundaries);
    expect(firstStatus.channels[0]).not.toBe(notificationOperationChannels[0]);
    expect(() => (firstStatus.channels as unknown as Array<(typeof notificationOperationChannels)[number]>).pop()).toThrow(TypeError);
    expect(() => ((firstChannel as { status: string }).status = "send enabled")).toThrow(TypeError);
    expect(getNotificationOperationsStatus().channels[0].status).toBe(notificationOperationChannels[0].status);
  });

  it("keeps notification operation metadata in canonical local-only shape", () => {
    expect(notificationOperationChannels.map((channel) => channel.name).filter((name) => name.trim().length === 0)).toEqual([]);
    expect(notificationOperationChannels.map((channel) => channel.status).filter((status) => status.trim().length === 0)).toEqual([]);
    expect(notificationOperationChannels.map((channel) => channel.boundary).filter((boundary) => boundary.trim().length === 0)).toEqual([]);
    expect(notificationOperationControls.filter((control) => control.trim().length === 0)).toEqual([]);
    expect(notificationOperationSafetyBoundaries.filter((boundary) => boundary.trim().length === 0)).toEqual([]);
  });

  it("keeps notification operation metadata whitespace-clean", () => {
    const staticCopy = [
      ...notificationOperationChannels.flatMap((channel) => [channel.name, channel.status, channel.boundary]),
      ...notificationOperationControls,
      ...notificationOperationSafetyBoundaries
    ];

    expect(staticCopy.filter((copy) => copy !== copy.trim())).toEqual([]);
    expect(staticCopy.filter((copy) => copy.includes("\n") || copy.includes("\r"))).toEqual([]);
    expect(staticCopy.filter((copy) => copy.includes("  "))).toEqual([]);
  });

  it("keeps notification operation values inside documented no-send boundaries", () => {
    expect(notificationOperationChannels.map((channel) => channel.name)).toEqual(["Email", "In-app", "SMS alerts", "Webhooks"]);
    expect(notificationOperationChannels.map((channel) => channel.status)).toEqual([
      "blocked",
      "not implemented",
      "blocked",
      "inbound only"
    ]);

    const controlCopy = notificationOperationControls.join(" ");
    const safetyCopy = notificationOperationSafetyBoundaries.join(" ");

    expect(controlCopy).toContain("LIVE_MESSAGING_ENABLED");
    expect(controlCopy).toContain("LIVE_BILLING_ENABLED");
    expect(controlCopy).toContain("API keys");
    expect(controlCopy).toContain("worker");
    expect(controlCopy).toContain("local");
    expect(safetyCopy).toContain("email");
    expect(safetyCopy).toContain("SMS");
    expect(safetyCopy).toContain("webhooks");
    expect(safetyCopy).toContain("provider calls");
    expect(safetyCopy).toContain("billing");
    expect(safetyCopy).toContain("mutations");
  });

  it("keeps notification operation statuses inside the supported local vocabulary", () => {
    expect(allowedNotificationOperationChannelStatuses).toEqual(["blocked", "not implemented", "inbound only"]);
    expect(notificationOperationChannels.map((channel) => channel.status).filter((status) => !allowedNotificationOperationChannelStatuses.includes(status))).toEqual([]);
  });

  it("keeps notification operation channel boundaries aligned with their no-send surfaces", () => {
    expect(Object.fromEntries(notificationOperationChannels.map((channel) => [channel.name, channel.boundary]))).toEqual({
      Email: "No SMTP, transactional email, invite email, or alert email provider is configured or called.",
      "In-app": "No live notification feed, browser push, or background notification job exists.",
      "SMS alerts": "Operational alerts cannot send SMS; messaging remains campaign and inbox data only under hard gates.",
      Webhooks: "Webhook routes receive provider events locally; they do not emit outbound notifications."
    });
  });

  it("keeps notification operation inventory order stable for local review pages", () => {
    expect(notificationOperationChannels.map((channel) => channel.name)).toEqual(["Email", "In-app", "SMS alerts", "Webhooks"]);
    expect(notificationOperationControls).toEqual([
      "LIVE_MESSAGING_ENABLED must remain false for local validation.",
      "LIVE_BILLING_ENABLED must remain false for local validation.",
      "No notification provider API keys are required for demo mode.",
      "No background notification worker is part of the current local gate.",
      "Operator review is limited to existing local pages and CSV links."
    ]);
    expect(notificationOperationSafetyBoundaries).toEqual([
      "This view does not create notification subscriptions, recipients, templates, jobs, or audit sends.",
      "Existing webhook routes are inbound persistence surfaces only and do not create automatic outbound replies.",
      "Existing billing and provider metadata pages do not send email, SMS, webhooks, provider calls, or live operational alerts.",
      "Future notification providers require explicit contracts, hard gates, tests, demo-safe defaults, and no mutations first."
    ]);
  });

  it("keeps notification operation identifiers unique before local review pages render them", () => {
    const channelNames = notificationOperationChannels.map((channel) => channel.name);

    expect(new Set(channelNames).size).toBe(channelNames.length);
    expect(new Set(notificationOperationControls).size).toBe(notificationOperationControls.length);
    expect(new Set(notificationOperationSafetyBoundaries).size).toBe(notificationOperationSafetyBoundaries.length);
  });

  it("keeps notification operation static metadata free of secret-like literals", () => {
    const staticCopy = [
      ...notificationOperationChannels.flatMap((channel) => [channel.name, channel.status, channel.boundary]),
      ...notificationOperationControls,
      ...notificationOperationSafetyBoundaries
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

  it("keeps notification operation static metadata free of command-like literals", () => {
    const staticCopy = [
      ...notificationOperationChannels.flatMap((channel) => [channel.name, channel.status, channel.boundary]),
      ...notificationOperationControls,
      ...notificationOperationSafetyBoundaries
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
