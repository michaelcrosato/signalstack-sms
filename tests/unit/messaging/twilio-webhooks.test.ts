import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  formDataToRecord,
  normalizeTwilioInbound,
  normalizeTwilioStatus,
  readTwilioFormPayload,
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
  it("returns null for unsupported request body formats before signature validation", async () => {
    const request = new Request("https://example.com/api/webhooks/twilio/inbound", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ From: "+15555550100", Body: "HELP", MessageSid: "SM123" })
    });

    await expect(readTwilioFormPayload(request)).resolves.toBeNull();
  });

  it("parses URL-encoded Twilio form payloads without dropping unknown fields", async () => {
    const form = new URLSearchParams({
      From: "+15555550100",
      Body: "HELP",
      MessageSid: "SM123",
      FutureField: "kept"
    });
    const request = new Request("https://example.com/api/webhooks/twilio/inbound", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form
    });

    await expect(readTwilioFormPayload(request)).resolves.toEqual({
      From: "+15555550100",
      Body: "HELP",
      MessageSid: "SM123",
      FutureField: "kept"
    });
  });

  it("rejects non-string form fields before signature validation", () => {
    const formData = new FormData();
    formData.append("From", "+15555550100");
    formData.append("Body", "HELP");
    formData.append("MessageSid", "SM123");
    formData.append("Media", new Blob(["not-url-encoded"]), "upload.txt");

    expect(formDataToRecord(formData)).toBeNull();
  });

  it("rejects duplicate form fields before signature validation", () => {
    const formData = new FormData();
    formData.append("From", "+15555550100");
    formData.append("Body", "HELP");
    formData.append("MessageSid", "SM123");
    formData.append("Body", "STOP");

    expect(formDataToRecord(formData)).toBeNull();
  });

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

  it("includes unknown provider fields in signature validation", () => {
    const url = "https://example.com/api/webhooks/twilio/inbound";
    const params = {
      From: "+15555550100",
      Body: "HELP",
      MessageSid: "SM123",
      FutureField: "must affect signature"
    };
    const signature = sign(url, params, "test_token");

    expect(validateTwilioSignature({ authToken: "test_token", signature, url, params })).toBe(true);
    expect(
      validateTwilioSignature({
        authToken: "test_token",
        signature,
        url,
        params: {
          From: params.From,
          Body: params.Body,
          MessageSid: params.MessageSid
        }
      })
    ).toBe(false);
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

  it("normalizes status whitespace before deriving idempotent event keys", () => {
    expect(
      normalizeTwilioStatus({
        MessageSid: "SM123",
        MessageStatus: " delivered "
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
        MessageStatus: " \t "
      })
    ).toBeNull();
  });

  it("normalizes status message IDs and error-code whitespace before deriving idempotent event keys", () => {
    expect(
      normalizeTwilioStatus({
        MessageSid: " SM123 ",
        MessageStatus: " undelivered ",
        ErrorCode: " 30007 "
      })
    ).toEqual({
      providerMessageId: "SM123",
      status: "undelivered",
      errorCode: "30007",
      idempotencyKey: "twilio:status:SM123:undelivered:30007"
    });

    expect(
      normalizeTwilioStatus({
        SmsSid: "SM123",
        SmsStatus: "failed",
        ErrorCode: " \t "
      })
    ).toEqual({
      providerMessageId: "SM123",
      status: "failed",
      errorCode: undefined,
      idempotencyKey: "twilio:status:SM123:failed:none"
    });

    expect(
      normalizeTwilioStatus({
        MessageSid: " \t ",
        MessageStatus: "delivered"
      })
    ).toBeNull();
  });

  it("falls back to nonblank status alias fields before deriving idempotent event keys", () => {
    expect(
      normalizeTwilioStatus({
        MessageSid: " \t ",
        SmsSid: " SM123 ",
        MessageStatus: " \t ",
        SmsStatus: " DELIVERED "
      })
    ).toEqual({
      providerMessageId: "SM123",
      status: "delivered",
      errorCode: undefined,
      idempotencyKey: "twilio:status:SM123:delivered:none"
    });
  });

  it("normalizes inbound provider message IDs for idempotent event keys", () => {
    expect(
      normalizeTwilioInbound({
        From: "+15555550100",
        To: "+15555550199",
        Body: "HELP",
        MessageSid: " SM123 "
      })
    ).toEqual({
      from: "+15555550100",
      to: "+15555550199",
      body: "HELP",
      providerMessageId: "SM123",
      idempotencyKey: "twilio:inbound:SM123"
    });

    expect(
      normalizeTwilioInbound({
        From: "+15555550100",
        Body: "HELP",
        MessageSid: " \t "
      })
    ).toBeNull();
  });

  it("falls back to nonblank inbound message ID aliases before deriving idempotent event keys", () => {
    expect(
      normalizeTwilioInbound({
        From: "+15555550100",
        Body: "HELP",
        MessageSid: " \t ",
        SmsSid: " SM123 "
      })
    ).toEqual({
      from: "+15555550100",
      to: undefined,
      body: "HELP",
      providerMessageId: "SM123",
      idempotencyKey: "twilio:inbound:SM123"
    });
  });

  it("normalizes inbound address whitespace before local message creation", () => {
    expect(
      normalizeTwilioInbound({
        From: " +15555550100 ",
        To: " +15555550199 ",
        Body: "HELP",
        MessageSid: "SM123"
      })
    ).toEqual({
      from: "+15555550100",
      to: "+15555550199",
      body: "HELP",
      providerMessageId: "SM123",
      idempotencyKey: "twilio:inbound:SM123"
    });

    expect(
      normalizeTwilioInbound({
        From: " \t ",
        Body: "HELP",
        MessageSid: "SM123"
      })
    ).toBeNull();
  });

  it("rejects whitespace-only inbound bodies without trimming stored message text", () => {
    expect(
      normalizeTwilioInbound({
        From: "+15555550100",
        Body: "  HELP  ",
        MessageSid: "SM123"
      })
    ).toEqual({
      from: "+15555550100",
      to: undefined,
      body: "  HELP  ",
      providerMessageId: "SM123",
      idempotencyKey: "twilio:inbound:SM123"
    });

    expect(
      normalizeTwilioInbound({
        From: "+15555550100",
        Body: " \t ",
        MessageSid: "SM123"
      })
    ).toBeNull();
  });

  it("maps provider statuses into local message transition fields", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");

    expect(twilioStatusTransition({ status: "delivered", now })).toEqual({
      providerStatus: "delivered",
      providerErrorCode: null,
      deliveredAt: now,
      failedAt: null
    });
    expect(twilioStatusTransition({ status: "undelivered", errorCode: "30007", now })).toEqual({
      providerStatus: "undelivered",
      providerErrorCode: "30007",
      deliveredAt: null,
      failedAt: now
    });
    expect(twilioStatusTransition({ status: "sent", now })).toEqual({
      providerStatus: "sent",
      providerErrorCode: null
    });
    expect(twilioStatusTransition({ status: " FAILED ", errorCode: " 30008 ", now })).toEqual({
      providerStatus: "failed",
      providerErrorCode: "30008",
      deliveredAt: null,
      failedAt: now
    });
  });

  it("keeps terminal delivery transitions mutually exclusive when applied to stale local metadata", () => {
    const deliveredAt = new Date("2026-01-01T00:00:00.000Z");
    const failedAt = new Date("2026-01-02T00:00:00.000Z");
    const staleFailedMessage = {
      deliveredAt: null as Date | null,
      failedAt
    };
    const staleDeliveredMessage = {
      deliveredAt,
      failedAt: null as Date | null
    };

    expect({
      ...staleFailedMessage,
      ...twilioStatusTransition({ status: "delivered", now: deliveredAt })
    }).toMatchObject({
      deliveredAt,
      failedAt: null
    });
    expect({
      ...staleDeliveredMessage,
      ...twilioStatusTransition({ status: "undelivered", now: failedAt })
    }).toMatchObject({
      deliveredAt: null,
      failedAt
    });
  });
});
