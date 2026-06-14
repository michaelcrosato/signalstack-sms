import { logger } from "@/lib/observability/logger";

export type LookupResult = {
  valid: boolean;
  formattedPhone?: string;
  carrierType?: string;
  error?: string;
};

/**
 * Clean and standardize phone numbers to E.164.
 * Handles local logic standardizing 10-digit US/Canada inputs.
 */
export function cleanPhoneNumberLocal(phone: string): string | null {
  const digitsOnly = phone.replace(/[^\d]/g, "");
  
  if (phone.trim().startsWith("+")) {
    const e164Cleaned = `+${digitsOnly}`;
    // E.164 numbers are max 15 digits, min 8 digits
    if (e164Cleaned.length >= 8 && e164Cleaned.length <= 16) {
      return e164Cleaned;
    }
  }

  // Handle standard US/North American numbers without country code
  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  }

  // Handle US numbers starting with country code but missing +
  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
    return `+${digitsOnly}`;
  }

  return null;
}

/**
 * Centralized phone number validation seam.
 * Executes local checks by default, and live Twilio lookup if enabled.
 */
export async function evaluatePhoneNumberLookup(
  phone: string,
  env: Record<string, string | undefined> = process.env
): Promise<LookupResult> {
  const localFormatted = cleanPhoneNumberLocal(phone);
  if (!localFormatted) {
    return {
      valid: false,
      error: "Invalid phone number format. Must be E.164 format or 10-digit North American number."
    };
  }

  const liveLookupEnabled = env.LIVE_LOOKUP_ENABLED === "true";
  if (!liveLookupEnabled) {
    return {
      valid: true,
      formattedPhone: localFormatted,
      carrierType: "mobile" // Local sandbox default
    };
  }

  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    logger.warn("twilio_lookup_skipped_missing_credentials");
    return {
      valid: true,
      formattedPhone: localFormatted,
      carrierType: "mobile" // Fallback to local default if credentials missing
    };
  }

  try {
    const response = await fetch(
      `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(localFormatted)}?Fields=line_type_intelligence`,
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          Accept: "application/json"
        }
      }
    );

    const payload = (await response.json().catch(() => ({}))) as {
      valid?: boolean;
      phoneNumber?: string;
      lineTypeIntelligence?: {
        type?: string;
      };
      message?: string;
      code?: number;
    };

    if (!response.ok) {
      logger.error("twilio_lookup_api_failed", {
        status: response.status,
        code: payload.code,
        message: payload.message
      });
      // Fallback to local E.164 validity rather than crashing/blocking healthy signups on API transient errors
      return {
        valid: true,
        formattedPhone: localFormatted,
        carrierType: "unknown"
      };
    }

    if (payload.valid === false) {
      return {
        valid: false,
        error: "Twilio validation reported this number as invalid."
      };
    }

    const carrierType = payload.lineTypeIntelligence?.type || "unknown";
    if (carrierType !== "mobile") {
      return {
        valid: false,
        carrierType,
        error: `Only mobile numbers are permitted. Line type detected: ${carrierType}.`
      };
    }

    return {
      valid: true,
      formattedPhone: payload.phoneNumber || localFormatted,
      carrierType
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("twilio_lookup_exception", { error: message });
    // Fallback to local E.164 validity
    return {
      valid: true,
      formattedPhone: localFormatted,
      carrierType: "unknown"
    };
  }
}
