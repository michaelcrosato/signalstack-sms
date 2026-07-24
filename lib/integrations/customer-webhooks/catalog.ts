export const CUSTOMER_WEBHOOK_EVENT_TYPES = [
  "contact.created",
  "contact.updated",
  "contact.archived",
  "contact.consent.updated",
  "message.accepted",
  "message.sent",
  "message.delivered",
  "message.failed",
  "message.received",
  "message.updated",
  "message.status.updated",
  "campaign.scheduled",
  "campaign.started",
  "campaign.completed",
  "campaign.failed",
  "campaign.canceled",
  "conversation.created",
  "conversation.updated",
  "webhook.endpoint.disabled"
] as const;

export type CustomerWebhookEventType = (typeof CUSTOMER_WEBHOOK_EVENT_TYPES)[number];

const customerWebhookEventTypeSet: ReadonlySet<string> = new Set(CUSTOMER_WEBHOOK_EVENT_TYPES);

export function isCustomerWebhookEventType(value: unknown): value is CustomerWebhookEventType {
  return typeof value === "string" && customerWebhookEventTypeSet.has(value);
}

export function normalizeCustomerWebhookEventTypes(values: readonly unknown[]): CustomerWebhookEventType[] {
  const normalized = new Set<CustomerWebhookEventType>();

  for (const value of values) {
    if (!isCustomerWebhookEventType(value)) {
      throw new TypeError("Invalid customer webhook event type.");
    }
    normalized.add(value);
  }

  return CUSTOMER_WEBHOOK_EVENT_TYPES.filter((eventType) => normalized.has(eventType));
}
