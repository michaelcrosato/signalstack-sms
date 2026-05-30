import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanPhoneNumberLocal, evaluatePhoneNumberLookup } from "@/lib/validation/lookup";

describe("phone number lookup validation seam", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
      const result = await evaluatePhoneNumberLookup("5555550100", {
        LIVE_LOOKUP_ENABLED: "false"
      });

      expect(result).toEqual({
        valid: true,
        formattedPhone: "+15555550100",
        carrierType: "mobile"
      });
    });

    it("rejects immediately if local E.164 format parsing fails", async () => {
      const result = await evaluatePhoneNumberLookup("invalid-phone");

      expect(result).toEqual({
        valid: false,
        error: "Invalid phone number format. Must be E.164 format or 10-digit North American number."
      });
    });

    it("falls back to local evaluation if live enabled but credentials missing", async () => {
      const result = await evaluatePhoneNumberLookup("5555550100", {
        LIVE_LOOKUP_ENABLED: "true"
      });

      expect(result).toEqual({
        valid: true,
        formattedPhone: "+15555550100",
        carrierType: "mobile"
      });
    });

    it("authenticates and queries Twilio lookup API if live is enabled", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          valid: true,
          phoneNumber: "+15555550100",
          lineTypeIntelligence: {
            type: "mobile"
          }
        })
      });

      vi.stubGlobal("fetch", mockFetch);

      const result = await evaluatePhoneNumberLookup("5555550100", {
        LIVE_LOOKUP_ENABLED: "true",
        TWILIO_ACCOUNT_SID: "AC123",
        TWILIO_AUTH_TOKEN: "token123"
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://lookups.twilio.com/v2/PhoneNumbers/%2B15555550100?Fields=line_type_intelligence",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: expect.stringContaining("Basic ")
          })
        })
      );

      expect(result).toEqual({
        valid: true,
        formattedPhone: "+15555550100",
        carrierType: "mobile"
      });
    });

    it("rejects non-mobile line types if live validation fails mobile check", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          valid: true,
          phoneNumber: "+15555550100",
          lineTypeIntelligence: {
            type: "landline"
          }
        })
      });

      vi.stubGlobal("fetch", mockFetch);

      const result = await evaluatePhoneNumberLookup("5555550100", {
        LIVE_LOOKUP_ENABLED: "true",
        TWILIO_ACCOUNT_SID: "AC123",
        TWILIO_AUTH_TOKEN: "token123"
      });

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

      const result = await evaluatePhoneNumberLookup("5555550100", {
        LIVE_LOOKUP_ENABLED: "true",
        TWILIO_ACCOUNT_SID: "AC123",
        TWILIO_AUTH_TOKEN: "token123"
      });

      expect(result).toEqual({
        valid: false,
        error: "Twilio validation reported this number as invalid."
      });
    });

    it("falls back gracefully to local evaluation if Twilio API returns non-ok status", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          message: "Internal error",
          code: 20001
        })
      });

      vi.stubGlobal("fetch", mockFetch);

      const result = await evaluatePhoneNumberLookup("5555550100", {
        LIVE_LOOKUP_ENABLED: "true",
        TWILIO_ACCOUNT_SID: "AC123",
        TWILIO_AUTH_TOKEN: "token123"
      });

      expect(result).toEqual({
        valid: true,
        formattedPhone: "+15555550100",
        carrierType: "unknown"
      });
    });

    it("falls back gracefully to local evaluation if Twilio fetch throws an exception", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network connection lost"));

      vi.stubGlobal("fetch", mockFetch);

      const result = await evaluatePhoneNumberLookup("5555550100", {
        LIVE_LOOKUP_ENABLED: "true",
        TWILIO_ACCOUNT_SID: "AC123",
        TWILIO_AUTH_TOKEN: "token123"
      });

      expect(result).toEqual({
        valid: true,
        formattedPhone: "+15555550100",
        carrierType: "unknown"
      });
    });
  });
});
