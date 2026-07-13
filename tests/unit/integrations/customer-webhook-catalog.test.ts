import { describe, expect, it } from "vitest";

import {
  CUSTOMER_WEBHOOK_EVENT_TYPES,
  isCustomerWebhookEventType,
  normalizeCustomerWebhookEventTypes,
  type CustomerWebhookEventType
} from "@/lib/integrations/customer-webhooks/catalog";

describe("customer webhook event catalog", () => {
  it("freezes the exact subscription allowlist", () => {
    expect(CUSTOMER_WEBHOOK_EVENT_TYPES).toEqual([
      "contact.created",
      "contact.updated",
      "contact.archived",
      "message.accepted",
      "message.sent",
      "message.delivered",
      "message.failed",
      "message.received",
      "message.status.updated",
      "campaign.scheduled",
      "campaign.started",
      "campaign.completed",
      "campaign.failed",
      "campaign.canceled",
      "conversation.created",
      "conversation.updated",
      "webhook.endpoint.disabled"
    ] satisfies CustomerWebhookEventType[]);
  });

  it("recognizes exact event names only", () => {
    expect(isCustomerWebhookEventType("message.status.updated")).toBe(true);
    expect(isCustomerWebhookEventType("Message.Status.Updated")).toBe(false);
    expect(isCustomerWebhookEventType("message.*")).toBe(false);
    expect(isCustomerWebhookEventType({ type: "message.sent" })).toBe(false);
  });

  it("deduplicates subscriptions into canonical catalog order", () => {
    expect(
      normalizeCustomerWebhookEventTypes([
        "webhook.endpoint.disabled",
        "contact.created",
        "message.delivered",
        "contact.created"
      ])
    ).toEqual(["contact.created", "message.delivered", "webhook.endpoint.disabled"]);
  });

  it("rejects event names outside the allowlist", () => {
    expect(() => normalizeCustomerWebhookEventTypes(["contact.created", "credential.secret.created"])).toThrowError(
      "Invalid customer webhook event type."
    );
  });
});
