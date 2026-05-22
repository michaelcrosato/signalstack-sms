import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  normalizeTwilioInbound,
  normalizeTwilioStatus,
  twilioStatusTransition,
  validateTwilioSignature
} from "@/lib/messaging/twilio-webhooks";

function sign(url: string, params: Record<string, string>, token: string) {
  const base = Object.keys(params)
    .sort()
    .reduce((value, key) => `${value}${key}${params[key]}`, url);
  return createHmac("sha1", token).update(base).digest("base64");
}

describe("Twilio webhook helpers", () => {
  it("validates form signatures with sorted parameters", () => {
    const url = "https://example.com/api/webhooks/twilio/inbound";
    const params = {
      From: "+15555550100",
      Body: "STOP",
      MessageSid: "SM123"
    };
    const signature = sign(url, params, "test_token");

    expect(validateTwilioSignature({ authToken: "test_token", signature, url, params })).toBe(true);
    expect(validateTwilioSignature({ authToken: "test_token", signature: "bad", url, params })).toBe(false);
  });

  it("normalizes inbound payloads without dropping unknown fields", () => {
    expect(
      normalizeTwilioInbound({
        From: "+15555550100",
        To: "+15555550199",
        Body: "HELP",
        MessageSid: "SM123",
        FutureField: "kept in raw payload"
      })
    ).toEqual({
      from: "+15555550100",
      to: "+15555550199",
      body: "HELP",
      providerMessageId: "SM123",
      idempotencyKey: "twilio:inbound:SM123"
    });
  });

  it("normalizes status payloads into idempotent event keys", () => {
    expect(
      normalizeTwilioStatus({
        MessageSid: "SM123",
        MessageStatus: "delivered"
      })
    ).toEqual({
      providerMessageId: "SM123",
      status: "delivered",
      errorCode: undefined,
      idempotencyKey: "twilio:status:SM123:delivered:none"
    });
  });

  it("normalizes status casing before deriving idempotent event keys", () => {
    expect(
      normalizeTwilioStatus({
        MessageSid: "SM123",
        MessageStatus: "DELIVERED"
      })
    ).toEqual({
      providerMessageId: "SM123",
      status: "delivered",
      errorCode: undefined,
      idempotencyKey: "twilio:status:SM123:delivered:none"
    });

    expect(
      normalizeTwilioStatus({
        MessageSid: "SM123",
        SmsStatus: "Undelivered",
        ErrorCode: "30007"
      })
    ).toEqual({
      providerMessageId: "SM123",
      status: "undelivered",
      errorCode: "30007",
      idempotencyKey: "twilio:status:SM123:undelivered:30007"
    });
  });

  it("maps provider statuses into local message transition fields", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");

    expect(twilioStatusTransition({ status: "delivered", now })).toEqual({
      providerStatus: "delivered",
      providerErrorCode: null,
      deliveredAt: now
    });
    expect(twilioStatusTransition({ status: "undelivered", errorCode: "30007", now })).toEqual({
      providerStatus: "undelivered",
      providerErrorCode: "30007",
      failedAt: now
    });
    expect(twilioStatusTransition({ status: "sent", now })).toEqual({
      providerStatus: "sent",
      providerErrorCode: null
    });
  });
});
