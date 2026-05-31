import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { twilioProvider, TwilioProviderError } from "@/lib/messaging/provider/twilio";

describe("twilioProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    global.fetch = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("throws AUTH_FAILURE if credentials are missing", async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;

    await expect(twilioProvider.send({
      to: "+1234567890",
      from: "+0987654321",
      body: "Test",
      orgId: "org_1",
      idempotencyKey: "idem_1"
    })).rejects.toThrowError(new TwilioProviderError("AUTH_FAILURE"));
  });

  it("sends successfully when API returns 200 with sid", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_TEST";
    process.env.TWILIO_AUTH_TOKEN = "TOKEN_TEST";

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sid: "SM12345" })
    } as unknown as Response);

    const result = await twilioProvider.send({
      to: "+1234567890",
      from: "+0987654321",
      body: "Test",
      orgId: "org_1",
      idempotencyKey: "idem_1"
    });

    expect(result.providerMessageId).toBe("SM12345");
    expect(result.status).toBe("queued");
  });

  it("maps 401/403 to AUTH_FAILURE", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_TEST";
    process.env.TWILIO_AUTH_TOKEN = "TOKEN_TEST";

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403
    } as unknown as Response);

    await expect(twilioProvider.send({
      to: "+1234567890",
      from: "+0987654321",
      body: "Test",
      orgId: "org_1",
      idempotencyKey: "idem_1"
    })).rejects.toThrowError(new TwilioProviderError("AUTH_FAILURE"));
  });

  it("maps 429 to RATE_LIMIT_ERROR", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_TEST";
    process.env.TWILIO_AUTH_TOKEN = "TOKEN_TEST";

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 429
    } as unknown as Response);

    await expect(twilioProvider.send({
      to: "+1234567890",
      from: "+0987654321",
      body: "Test",
      orgId: "org_1",
      idempotencyKey: "idem_1"
    })).rejects.toThrowError(new TwilioProviderError("RATE_LIMIT_ERROR"));
  });

  it("maps 400 to BAD_REQUEST", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_TEST";
    process.env.TWILIO_AUTH_TOKEN = "TOKEN_TEST";

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400
    } as unknown as Response);

    await expect(twilioProvider.send({
      to: "+1234567890",
      from: "+0987654321",
      body: "Test",
      orgId: "org_1",
      idempotencyKey: "idem_1"
    })).rejects.toThrowError(new TwilioProviderError("BAD_REQUEST"));
  });

  it("maps network errors/timeouts to PROVIDER_ERROR", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_TEST";
    process.env.TWILIO_AUTH_TOKEN = "TOKEN_TEST";

    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network Error"));

    await expect(twilioProvider.send({
      to: "+1234567890",
      from: "+0987654321",
      body: "Test",
      orgId: "org_1",
      idempotencyKey: "idem_1"
    })).rejects.toThrowError(new TwilioProviderError("PROVIDER_ERROR"));
  });
});
