import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { parseProviderCredentialPlaintext } from "@/lib/integrations/provider-accounts/credential-encryption";
import {
  twilioAccountSidSchema,
  twilioMessageSidSchema,
  twilioMessagingServiceSidSchema,
  twilioPhoneNumberSidSchema
} from "@/lib/validation/provider";
import {
  createTwilioProvider,
  TwilioProviderRequestError
} from "@/lib/messaging/provider/twilio-provider";

const accountSid = `AC${"a".repeat(32)}`;
const otherAccountSid = `AC${"b".repeat(32)}`;
const authToken = "c".repeat(32);
const messageSid = `SM${"d".repeat(32)}`;
const mmsSid = `MM${"e".repeat(32)}`;
const numberSid = `PN${"f".repeat(32)}`;
const serviceSid = `MG${"1".repeat(32)}`;

const credentials = {
  externalAccountId: accountSid,
  token: parseProviderCredentialPlaintext(authToken)
};

function jsonResponse(value: unknown, status = 200, extraHeaders: HeadersInit = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders }
  });
}

function createFetchMock(...responses: Array<Response | Error>) {
  const mock = vi.fn();
  for (const response of responses) {
    if (response instanceof Error) {
      mock.mockRejectedValueOnce(response);
    } else {
      mock.mockResolvedValueOnce(response);
    }
  }
  return mock;
}

async function capturedError(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("Expected provider operation to fail.");
}

describe("Twilio provider strict identifiers", () => {
  it("accepts canonical AC, MG, PN, SM, and MM identifiers only", () => {
    expect(twilioAccountSidSchema.safeParse(accountSid).success).toBe(true);
    expect(twilioMessagingServiceSidSchema.safeParse(serviceSid).success).toBe(true);
    expect(twilioPhoneNumberSidSchema.safeParse(numberSid).success).toBe(true);
    expect(twilioMessageSidSchema.safeParse(messageSid).success).toBe(true);
    expect(twilioMessageSidSchema.safeParse(mmsSid).success).toBe(true);

    expect(twilioAccountSidSchema.safeParse(`AC${"a".repeat(31)}`).success).toBe(false);
    expect(twilioMessagingServiceSidSchema.safeParse(`PN${"1".repeat(32)}`).success).toBe(false);
    expect(twilioPhoneNumberSidSchema.safeParse(`pn${"f".repeat(32)}`).success).toBe(false);
    expect(twilioMessageSidSchema.safeParse(`SM${"z".repeat(32)}`).success).toBe(false);
  });

  it("rejects malformed credentials before constructing a network-capable adapter", () => {
    expect(() =>
      createTwilioProvider({
        externalAccountId: "AC_short",
        token: parseProviderCredentialPlaintext(authToken)
      })
    ).toThrowError(TwilioProviderRequestError);
    expect(() =>
      createTwilioProvider({
        externalAccountId: accountSid,
        token: parseProviderCredentialPlaintext("not-a-twilio-token")
      })
    ).toThrow("Twilio provider operation failed.");
  });
});

describe("Twilio provider message boundary", () => {
  it("creates SMS/MMS through a bounded, host-fixed, injectable request", async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        sid: messageSid,
        account_sid: accountSid,
        status: " QUEUED ",
        to: "+15555550100",
        from: null,
        messaging_service_sid: serviceSid,
        error_code: null
      })
    );
    const provider = createTwilioProvider(credentials, {
      fetch: fetchMock as unknown as typeof fetch,
      timeoutMs: 60_000
    });

    await expect(
      provider.createMessage({
        orgId: "org_1",
        to: "+15555550100",
        messagingServiceId: serviceSid,
        body: "hello",
        mediaUrls: ["https://media.example.test/image.png"],
        statusCallbackUrl: "https://app.example.test/api/webhooks/twilio/status",
        idempotencyKey: "request_1"
      })
    ).resolves.toEqual({
      providerMessageId: messageSid,
      externalAccountId: accountSid,
      status: { status: "queued", providerStatus: "queued" },
      to: "+15555550100",
      from: null,
      messagingServiceId: serviceSid,
      providerErrorCode: null
    });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
    );
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).toMatchObject({
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    });
    const form = init.body as URLSearchParams;
    expect(form.get("To")).toBe("+15555550100");
    expect(form.get("MessagingServiceSid")).toBe(serviceSid);
    expect(form.get("From")).toBeNull();
    expect(form.getAll("MediaUrl")).toEqual(["https://media.example.test/image.png"]);
  });

  it("fetches both SM and MM messages and rejects malformed IDs before fetch", async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        sid: mmsSid,
        account_sid: accountSid,
        status: "delivered",
        to: "+15555550100",
        from: "+15555550199",
        messaging_service_sid: null,
        error_code: null,
        date_created: "2026-01-01T00:00:00.000Z",
        date_sent: "2026-01-01T00:00:01.000Z"
      })
    );
    const provider = createTwilioProvider(credentials, {
      fetch: fetchMock as unknown as typeof fetch
    });

    await expect(provider.fetchMessage({ providerMessageId: mmsSid })).resolves.toEqual(
      expect.objectContaining({
        providerMessageId: mmsSid,
        status: { status: "delivered", providerStatus: "delivered" },
        createdAt: "2026-01-01T00:00:00.000Z",
        sentAt: "2026-01-01T00:00:01.000Z"
      })
    );
    await expect(provider.fetchMessage({ providerMessageId: "SM_bad" })).rejects.toMatchObject({
      safeCode: "TWILIO_INPUT_INVALID"
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats mismatched or malformed create responses as ambiguous", async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        sid: messageSid,
        account_sid: otherAccountSid,
        status: "queued",
        to: "+15555550100",
        from: "+15555550199"
      }),
      jsonResponse({ status: "queued" })
    );
    const provider = createTwilioProvider(credentials, {
      fetch: fetchMock as unknown as typeof fetch
    });
    const input = {
      orgId: "org_1",
      to: "+15555550100",
      from: "+15555550199",
      body: "hello",
      idempotencyKey: "request_1"
    };

    for (const expectedCode of ["TWILIO_RESPONSE_MISMATCH", "TWILIO_RESPONSE_INVALID"]) {
      const error = await capturedError(() => provider.createMessage(input));
      expect(provider.classifyError(error, "create_message")).toEqual({
        disposition: "ambiguous",
        retryable: false,
        safeCode: expectedCode,
        providerCode: null
      });
    }
  });

  it("validates sender choice, E.164, media, and HTTPS inputs before fetch", async () => {
    const fetchMock = vi.fn();
    const provider = createTwilioProvider(credentials, {
      fetch: fetchMock as unknown as typeof fetch
    });

    await expect(
      provider.createMessage({
        orgId: "org_1",
        to: "555-0100",
        from: "+15555550199",
        messagingServiceId: serviceSid,
        body: "hello",
        mediaUrls: ["http://media.example.test/image.png"],
        idempotencyKey: "request_1"
      })
    ).rejects.toMatchObject({ safeCode: "TWILIO_INPUT_INVALID" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Twilio account, discovery, signature, and health boundary", () => {
  it("verifies accounts and discovers account-bound numbers and services", async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ sid: accountSid, friendly_name: "Primary", status: "active" }),
      jsonResponse({
        incoming_phone_numbers: [
          {
            sid: numberSid,
            account_sid: accountSid,
            phone_number: "+15555550199",
            friendly_name: "Support",
            capabilities: { sms: true, mms: true, voice: false }
          }
        ]
      }),
      jsonResponse({
        services: [
          {
            sid: serviceSid,
            account_sid: accountSid,
            friendly_name: "Outbound"
          }
        ]
      })
    );
    const provider = createTwilioProvider(credentials, {
      fetch: fetchMock as unknown as typeof fetch
    });

    await expect(provider.verifyAccount()).resolves.toEqual({
      externalAccountId: accountSid,
      friendlyName: "Primary",
      status: "active"
    });
    await expect(provider.discoverPhoneNumbers()).resolves.toEqual([
      {
        externalNumberId: numberSid,
        externalAccountId: accountSid,
        phoneNumber: "+15555550199",
        friendlyName: "Support",
        capabilities: { sms: true, mms: true }
      }
    ]);
    await expect(provider.discoverMessagingServices()).resolves.toEqual([
      {
        externalServiceId: serviceSid,
        externalAccountId: accountSid,
        friendlyName: "Outbound"
      }
    ]);
    expect((fetchMock.mock.calls[1][0] as URL).searchParams.get("PageSize")).toBe("100");
    expect((fetchMock.mock.calls[2][0] as URL).origin).toBe("https://messaging.twilio.com");
  });

  it("rejects discovery records owned by a different account", async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        incoming_phone_numbers: [
          {
            sid: numberSid,
            account_sid: otherAccountSid,
            phone_number: "+15555550199",
            capabilities: { sms: true, mms: false }
          }
        ]
      })
    );
    const provider = createTwilioProvider(credentials, {
      fetch: fetchMock as unknown as typeof fetch
    });

    await expect(provider.discoverPhoneNumbers()).rejects.toMatchObject({
      safeCode: "TWILIO_RESPONSE_MISMATCH"
    });
  });

  it("validates signatures using the exact URL and complete sorted parameter set", () => {
    const provider = createTwilioProvider(credentials);
    const url = "https://app.example.test/api/webhooks/twilio/inbound";
    const params = {
      AccountSid: accountSid,
      From: "+15555550100",
      To: "+15555550199",
      FutureField: "preserved"
    };
    const base = Object.keys(params)
      .sort()
      .reduce((value, key) => `${value}${key}${params[key as keyof typeof params]}`, url);
    const signature = createHmac("sha1", authToken).update(base).digest("base64");

    expect(provider.validateSignature({ url, params, signature })).toBe(true);
    expect(provider.validateSignature({ url, params: { ...params, FutureField: "changed" }, signature })).toBe(false);
    expect(provider.validateSignature({ url: "not a url", params, signature })).toBe(false);
  });

  it("returns secret-safe health without throwing provider details", async () => {
    const healthyFetch = createFetchMock(
      jsonResponse({ sid: accountSid, friendly_name: "Primary", status: "active" })
    );
    const healthy = createTwilioProvider(credentials, {
      fetch: healthyFetch as unknown as typeof fetch,
      now: () => new Date("2026-01-01T00:00:00.000Z")
    });
    await expect(healthy.getHealth()).resolves.toEqual({
      healthy: true,
      checkedAt: "2026-01-01T00:00:00.000Z",
      safeCode: "PROVIDER_HEALTHY"
    });

    const deniedFetch = createFetchMock(jsonResponse({ code: 20003, message: "raw secret detail" }, 401));
    const denied = createTwilioProvider(credentials, {
      fetch: deniedFetch as unknown as typeof fetch,
      now: () => new Date("2026-01-02T00:00:00.000Z")
    });
    const result = await denied.getHealth();
    expect(result).toEqual({
      healthy: false,
      checkedAt: "2026-01-02T00:00:00.000Z",
      safeCode: "PROVIDER_CREDENTIALS_INVALID"
    });
    expect(JSON.stringify(result)).not.toContain(authToken);
    expect(JSON.stringify(result)).not.toContain("raw secret detail");
  });
});

describe("Twilio provider retry classification and response bounds", () => {
  it("classifies 401 terminal, 429 retryable, create 5xx ambiguous, and read network errors retryable", async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ code: 20003 }, 401),
      jsonResponse({ code: 20429 }, 429),
      jsonResponse({ code: 20500 }, 500),
      new Error("network secret detail")
    );
    const provider = createTwilioProvider(credentials, {
      fetch: fetchMock as unknown as typeof fetch
    });

    const denied = await capturedError(() => provider.verifyAccount());
    expect(provider.classifyError(denied, "verify_account")).toEqual({
      disposition: "terminal",
      retryable: false,
      safeCode: "TWILIO_CREDENTIALS_INVALID",
      providerCode: "TWILIO_20003"
    });

    const throttled = await capturedError(() => provider.fetchMessage({ providerMessageId: messageSid }));
    expect(provider.classifyError(throttled, "fetch_message")).toMatchObject({
      disposition: "retryable",
      retryable: true,
      providerCode: "TWILIO_20429"
    });

    const ambiguous = await capturedError(() =>
      provider.createMessage({
        orgId: "org_1",
        to: "+15555550100",
        from: "+15555550199",
        body: "hello",
        idempotencyKey: "request_1"
      })
    );
    expect(provider.classifyError(ambiguous, "create_message")).toMatchObject({
      disposition: "ambiguous",
      retryable: false,
      providerCode: "TWILIO_20500"
    });

    const network = await capturedError(() => provider.verifyAccount());
    expect(provider.classifyError(network, "verify_account")).toMatchObject({
      disposition: "retryable",
      retryable: true,
      safeCode: "TWILIO_NETWORK_ERROR"
    });
  });

  it("fails closed on oversized and non-JSON responses", async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ sid: accountSid }, 200, { "Content-Length": "999999" }),
      new Response("not json", { status: 200, headers: { "Content-Type": "text/plain" } }),
      new Response("x".repeat(262_145), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    const provider = createTwilioProvider(credentials, {
      fetch: fetchMock as unknown as typeof fetch
    });

    await expect(provider.verifyAccount()).rejects.toMatchObject({
      safeCode: "TWILIO_RESPONSE_TOO_LARGE"
    });
    await expect(provider.verifyAccount()).rejects.toMatchObject({
      safeCode: "TWILIO_RESPONSE_INVALID"
    });
    await expect(provider.verifyAccount()).rejects.toMatchObject({
      safeCode: "TWILIO_RESPONSE_TOO_LARGE"
    });
  });
});
