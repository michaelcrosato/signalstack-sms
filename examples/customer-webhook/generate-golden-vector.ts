import { signCustomerWebhookPayload } from "../../lib/integrations/customer-webhooks/signatures";

export const TEST_ONLY_CUSTOMER_WEBHOOK_SECRET =
  "whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

export function generateCustomerWebhookGoldenVector() {
  const timestamp = "1710000000";
  const secretVersion = 3;
  const eventId = "evt_example_01";
  const eventType = "message.delivered";
  const deliveryId = "delivery_example_01";
  const rawBody = Buffer.from(
    '{"apiVersion":"2026-07-10","id":"evt_example_01","type":"message.delivered","occurredAt":"2026-07-11T05:30:00.000Z","data":{"messageId":"msg_example_01","status":"delivered"}}\n',
    "utf8"
  );
  const signature = signCustomerWebhookPayload({
    secret: TEST_ONLY_CUSTOMER_WEBHOOK_SECRET,
    timestampSeconds: Number(timestamp),
    rawBody
  });
  return {
    purpose: "Public, deterministic, test-only cross-language customer-webhook vector.",
    secret: TEST_ONLY_CUSTOMER_WEBHOOK_SECRET,
    secretVersion,
    timestamp,
    nowSeconds: 1_710_000_120,
    toleranceSeconds: 300,
    eventId,
    eventType,
    deliveryId,
    rawBodyBase64: rawBody.toString("base64"),
    headers: {
      "Content-Type": "application/json",
      "X-SignalStack-Event-Id": eventId,
      "X-SignalStack-Event-Type": eventType,
      "X-SignalStack-Delivery-Id": deliveryId,
      "X-SignalStack-Timestamp": timestamp,
      "X-SignalStack-Secret-Version": String(secretVersion),
      "X-SignalStack-Signature": signature
    }
  } as const;
}

if (process.argv.includes("--print")) {
  console.log(JSON.stringify(generateCustomerWebhookGoldenVector(), null, 2));
}
