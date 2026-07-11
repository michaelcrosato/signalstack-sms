import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanPhoneNumberLocal,
  evaluatePhoneNumberLookup,
  liveLookupOperatorHeaderName,
  liveLookupTimeoutMs,
  maxLiveLookupTimeoutMs,
  minLiveLookupTimeoutMs
} from "@/lib/validation/lookup";

const operatorToken = "lookup-operator-token-0123456789abcdef";
const authorizedLiveLookupAccess = { operatorToken } as const;
const liveLookupEnv = {
  LIVE_LOOKUP_ENABLED: "true",
  LIVE_LOOKUP_COST_ACK: "true",
  LIVE_LOOKUP_OPERATOR_TOKEN: operatorToken,
  TWILIO_ACCOUNT_SID: "AC123",
  TWILIO_AUTH_TOKEN: "token123"
} as const;

describe("phone number lookup validation seam", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("local cleaning pass", () => {
    it("standardizes 10-digit North American numbers without country code", () => {
      expect(cleanPhoneNumberLocal("5555550100")).toBe("+15555550100");
      expect(cleanPhoneNumberLocal("(555) 555-0100")).toBe("+15555550100");
      expect(cleanPhoneNumberLocal("555.555.0100")).toBe("+15555550100");
    });

    it("standardizes 11-digit numbers starting with 1 without leading +", () => {
      expect(cleanPhoneNumberLocal("15555550100")).toBe("+15555550100");
      expect(cleanPhoneNumberLocal("1-555-555-0100")).toBe("+15555550100");
    });

    it("retains valid standard international E.164 formats starting with +", () => {
      expect(cleanPhoneNumberLocal("+447700900077")).toBe("+447700900077");
      expect(cleanPhoneNumberLocal("+15555550100")).toBe("+15555550100");
    });

    it("rejects numbers that are clearly invalid", () => {
      expect(cleanPhoneNumberLocal("123")).toBeNull();
      expect(cleanPhoneNumberLocal("abc")).toBeNull();
      expect(cleanPhoneNumberLocal("")).toBeNull();
    });
  });

  describe("evaluatePhoneNumberLookup", () => {
    it("returns successful E.164 formatted number on local path (default off)", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const result = await evaluatePhoneNumberLookup("5555550100", {
        LIVE_LOOKUP_ENABLED: "false"
      });

      expect(result).toEqual({
        valid: true,
        formattedPhone: "+15555550100",
        carrierType: "mobile"
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects immediately if local E.164 format parsing fails", async () => {
      const result = await evaluatePhoneNumberLookup("invalid-phone");

      expect(result).toEqual({
        valid: false,
        error: "Invalid phone number format. Must be E.164 format or 10-digit North American number."
      });
    });

    it("fails closed without a paid-lookup acknowledgement and does not call Twilio", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const result = await evaluatePhoneNumberLookup(
        "5555550100",
        {
          ...liveLookupEnv,
          LIVE_LOOKUP_COST_ACK: "false"
        },
        authorizedLiveLookupAccess
      );

      expect(result).toEqual({
        valid: false,
        formattedPhone: "+15555550100",
        unavailable: true,
        error: "Live phone lookup cost has not been acknowledged."
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("fails closed if live lookup is enabled but credentials are unavailable", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const result = await evaluatePhoneNumberLookup(
        "5555550100",
        {
          LIVE_LOOKUP_ENABLED: "true",
          LIVE_LOOKUP_COST_ACK: "true",
          LIVE_LOOKUP_OPERATOR_TOKEN: operatorToken
        },
        authorizedLiveLookupAccess
      );

      expect(result).toEqual({
        valid: false,
        formattedPhone: "+15555550100",
        unavailable: true,
        error: "Live phone lookup credentials are unavailable."
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("fails closed on malformed live enablement instead of silently choosing a mode", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const result = await evaluatePhoneNumberLookup("5555550100", {
        ...liveLookupEnv,
        LIVE_LOOKUP_ENABLED: "TRUE"
      });

      expect(result).toEqual({
        valid: false,
        formattedPhone: "+15555550100",
        unavailable: true,
        error: "Live phone lookup configuration is invalid."
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("fails closed without a valid server-side lookup operator token", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const result = await evaluatePhoneNumberLookup(
        "5555550100",
        {
          ...liveLookupEnv,
          LIVE_LOOKUP_OPERATOR_TOKEN: "x".repeat(31)
        },
        authorizedLiveLookupAccess
      );

      expect(result).toEqual({
        valid: false,
        formattedPhone: "+15555550100",
        unavailable: true,
        error: "Live phone lookup operator authorization failed."
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it.each([undefined, "wrong-lookup-operator-token-0123456789abcdef"])(
      "fails closed for a missing or mismatched request operator token (%s)",
      async (suppliedToken) => {
        const mockFetch = vi.fn();
        vi.stubGlobal("fetch", mockFetch);

        const result = await evaluatePhoneNumberLookup("5555550100", liveLookupEnv, {
          operatorToken: suppliedToken
        });

        expect(result).toEqual({
          valid: false,
          formattedPhone: "+15555550100",
          unavailable: true,
          error: "Live phone lookup operator authorization failed."
        });
        expect(mockFetch).not.toHaveBeenCalled();
      }
    );

    it("clamps live lookup timeouts to a bounded range", () => {
      expect(liveLookupTimeoutMs({})).toBe(3_000);
      expect(liveLookupTimeoutMs({ LIVE_LOOKUP_TIMEOUT_MS: "not-a-number" })).toBe(3_000);
      expect(liveLookupTimeoutMs({ LIVE_LOOKUP_TIMEOUT_MS: "1" })).toBe(minLiveLookupTimeoutMs);
      expect(liveLookupTimeoutMs({ LIVE_LOOKUP_TIMEOUT_MS: "999999" })).toBe(maxLiveLookupTimeoutMs);
      expect(liveLookupTimeoutMs({ LIVE_LOOKUP_TIMEOUT_MS: "4500" })).toBe(4_500);
    });

    it("authenticates and queries Twilio lookup API if live is enabled", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          valid: true,
          phone_number: "+15555550100",
          line_type_intelligence: {
            error_code: null,
            type: "mobile"
          }
        })
      });

      vi.stubGlobal("fetch", mockFetch);

      const result = await evaluatePhoneNumberLookup("5555550100", liveLookupEnv, authorizedLiveLookupAccess);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://lookups.twilio.com/v2/PhoneNumbers/%2B15555550100?Fields=line_type_intelligence",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: expect.stringContaining("Basic ")
          }),
          signal: expect.any(AbortSignal)
        })
      );

      expect(result).toEqual({
        valid: true,
        formattedPhone: "+15555550100",
        carrierType: "mobile"
      });
      const requestHeaders = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(requestHeaders).not.toHaveProperty(liveLookupOperatorHeaderName);
      expect(Object.values(requestHeaders)).not.toContain(operatorToken);
    });

    it("rejects non-mobile line types if live validation fails mobile check", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          valid: true,
          phone_number: "+15555550100",
          line_type_intelligence: {
            error_code: null,
            type: "landline"
          }
        })
      });

      vi.stubGlobal("fetch", mockFetch);

      const result = await evaluatePhoneNumberLookup("5555550100", liveLookupEnv, authorizedLiveLookupAccess);

      expect(result).toEqual({
        valid: false,
        carrierType: "landline",
        error: "Only mobile numbers are permitted. Line type detected: landline."
      });
    });

    it("rejects when Twilio explicitly reports payload as invalid", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          valid: false
        })
      });

      vi.stubGlobal("fetch", mockFetch);

      const result = await evaluatePhoneNumberLookup("5555550100", liveLookupEnv, authorizedLiveLookupAccess);

      expect(result).toEqual({
        valid: false,
        error: "Twilio validation reported this number as invalid."
      });
    });

    it("fails closed if Twilio returns a non-ok status", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          message: "Internal error",
          code: 20001
        })
      });

      vi.stubGlobal("fetch", mockFetch);

      const result = await evaluatePhoneNumberLookup("5555550100", liveLookupEnv, authorizedLiveLookupAccess);

      expect(result).toEqual({
        valid: false,
        formattedPhone: "+15555550100",
        unavailable: true,
        error: "Live phone lookup is unavailable."
      });
    });

    it("fails closed when Twilio returns a malformed successful response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ valid: true })
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await evaluatePhoneNumberLookup("5555550100", liveLookupEnv, authorizedLiveLookupAccess);

      expect(result).toEqual({
        valid: false,
        formattedPhone: "+15555550100",
        unavailable: true,
        error: "Live phone lookup is unavailable."
      });
    });

    it("fails closed when Twilio returns a different normalized phone number", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          valid: true,
          phone_number: "+15555550101",
          line_type_intelligence: {
            error_code: null,
            type: "mobile"
          }
        })
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await evaluatePhoneNumberLookup("5555550100", liveLookupEnv, authorizedLiveLookupAccess);

      expect(result).toEqual({
        valid: false,
        formattedPhone: "+15555550100",
        unavailable: true,
        error: "Live phone lookup is unavailable."
      });
    });

    it("fails closed if the Twilio request throws", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network connection lost"));

      vi.stubGlobal("fetch", mockFetch);

      const result = await evaluatePhoneNumberLookup("5555550100", liveLookupEnv, authorizedLiveLookupAccess);

      expect(result).toEqual({
        valid: false,
        formattedPhone: "+15555550100",
        unavailable: true,
        error: "Live phone lookup is unavailable."
      });
    });

    it("aborts a live lookup at the configured bounded timeout and fails closed", async () => {
      vi.useFakeTimers();
      const mockFetch = vi.fn((_url: string, init: RequestInit) => {
        const requestSignal = init.signal as AbortSignal;
        return new Promise((_resolve, reject) => {
          requestSignal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      });
      vi.stubGlobal("fetch", mockFetch);

      const resultPromise = evaluatePhoneNumberLookup(
        "5555550100",
        {
          ...liveLookupEnv,
          LIVE_LOOKUP_TIMEOUT_MS: "1"
        },
        authorizedLiveLookupAccess
      );
      await vi.advanceTimersByTimeAsync(minLiveLookupTimeoutMs);

      await expect(resultPromise).resolves.toEqual({
        valid: false,
        formattedPhone: "+15555550100",
        unavailable: true,
        error: "Live phone lookup timed out."
      });
      const requestOptions = mockFetch.mock.calls[0][1];
      expect(requestOptions.signal?.aborted).toBe(true);
    });
  });
});
