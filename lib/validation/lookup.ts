import { createHash, timingSafeEqual } from "node:crypto";
import { logger } from "@/lib/observability/logger";

export type LookupResult = {
  valid: boolean;
  formattedPhone?: string;
  carrierType?: string;
  unavailable?: boolean;
  error?: string;
};

export const defaultLiveLookupTimeoutMs = 3_000;
export const minLiveLookupTimeoutMs = 250;
export const maxLiveLookupTimeoutMs = 10_000;
export const liveLookupOperatorHeaderName = "x-signalstack-lookup-token";
export const minLiveLookupOperatorTokenLength = 32;
export const maxLiveLookupOperatorTokenLength = 256;

export type LiveLookupAccess = {
  operatorToken?: string | null;
};

/**
 * Clean and standardize phone numbers to E.164.
 * Handles local logic standardizing 10-digit US/Canada inputs.
 */
export function cleanPhoneNumberLocal(phone: string): string | null {
  const digitsOnly = phone.replace(/[^\d]/g, "");
  
  if (phone.trim().startsWith("+")) {
    const e164Cleaned = "+" + digitsOnly;
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

export function evaluatePhoneNumberLocally(phone: string): LookupResult {
  const localFormatted = cleanPhoneNumberLocal(phone);
  if (!localFormatted) {
    return {
      valid: false,
      error: "Invalid phone number format. Must be E.164 format or 10-digit North American number."
    };
  }

  return {
    valid: true,
    formattedPhone: localFormatted,
    carrierType: "mobile"
  };
}

export function liveLookupTimeoutMs(env: Record<string, string | undefined> = process.env) {
  const configured = env.LIVE_LOOKUP_TIMEOUT_MS?.trim();
  if (!configured || !/^\d+$/.test(configured)) {
    return defaultLiveLookupTimeoutMs;
  }

  return Math.min(Math.max(Number.parseInt(configured, 10), minLiveLookupTimeoutMs), maxLiveLookupTimeoutMs);
}

function liveLookupUnavailable(formattedPhone: string, error = "Live phone lookup is unavailable."): LookupResult {
  return {
    valid: false,
    formattedPhone,
    unavailable: true,
    error
  };
}

function isAuthorizedLiveLookupOperator(configuredToken: string | undefined, suppliedToken: string | null | undefined) {
  const configuredTokenIsValid =
    typeof configuredToken === "string" &&
    configuredToken.length >= minLiveLookupOperatorTokenLength &&
    configuredToken.length <= maxLiveLookupOperatorTokenLength;
  const suppliedValue = typeof suppliedToken === "string" ? suppliedToken : "";
  const suppliedTokenIsValid =
    suppliedValue.length >= minLiveLookupOperatorTokenLength &&
    suppliedValue.length <= maxLiveLookupOperatorTokenLength;

  // Hash both values to fixed-size buffers so the secret comparison itself is
  // constant-time even when the caller omits or supplies a malformed token.
  const expectedDigest = createHash("sha256")
    .update(configuredTokenIsValid ? configuredToken : "invalid-live-lookup-operator-token")
    .digest();
  const suppliedDigest = createHash("sha256").update(suppliedValue.slice(0, maxLiveLookupOperatorTokenLength + 1)).digest();
  const tokensMatch = timingSafeEqual(expectedDigest, suppliedDigest);

  return configuredTokenIsValid && suppliedTokenIsValid && tokensMatch;
}

/**
 * Centralized phone number validation seam.
 * Executes local checks by default, and live Twilio lookup if enabled.
 */
export async function evaluatePhoneNumberLookup(
  phone: string,
  env: Record<string, string | undefined> = process.env,
  access: LiveLookupAccess = {}
): Promise<LookupResult> {
  const localResult = evaluatePhoneNumberLocally(phone);
  if (!localResult.valid || !localResult.formattedPhone) {
    return localResult;
  }
  const localFormatted = localResult.formattedPhone;

  const liveLookupSetting = env.LIVE_LOOKUP_ENABLED;
  if (liveLookupSetting === undefined || liveLookupSetting === "" || liveLookupSetting === "false") {
    return localResult;
  }

  if (liveLookupSetting !== "true") {
    logger.warn("twilio_lookup_blocked_invalid_enablement");
    return liveLookupUnavailable(localFormatted, "Live phone lookup configuration is invalid.");
  }

  if (!isAuthorizedLiveLookupOperator(env.LIVE_LOOKUP_OPERATOR_TOKEN, access.operatorToken)) {
    logger.warn("twilio_lookup_blocked_operator_authorization");
    return liveLookupUnavailable(localFormatted, "Live phone lookup operator authorization failed.");
  }

  if (env.LIVE_LOOKUP_COST_ACK !== "true") {
    logger.warn("twilio_lookup_blocked_cost_not_acknowledged");
    return liveLookupUnavailable(localFormatted, "Live phone lookup cost has not been acknowledged.");
  }

  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    logger.warn("twilio_lookup_blocked_missing_credentials");
    return liveLookupUnavailable(localFormatted, "Live phone lookup credentials are unavailable.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), liveLookupTimeoutMs(env));

  try {
    const response = await fetch(
      `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(localFormatted)}?Fields=line_type_intelligence`,
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          Accept: "application/json"
        },
        signal: controller.signal
      }
    );

    const payload = (await response.json().catch(() => ({}))) as {
      valid?: boolean;
      phone_number?: string;
      line_type_intelligence?: {
        type?: string;
        error_code?: number | null;
      };
      code?: number;
    };

    if (!response.ok) {
      logger.error("twilio_lookup_api_failed", {
        status: response.status,
        code: payload.code
      });
      return liveLookupUnavailable(localFormatted);
    }

    if (payload.valid === false) {
      return {
        valid: false,
        error: "Twilio validation reported this number as invalid."
      };
    }

    if (payload.line_type_intelligence?.error_code !== undefined && payload.line_type_intelligence.error_code !== null) {
      logger.error("twilio_lookup_line_type_failed", { code: payload.line_type_intelligence.error_code });
      return liveLookupUnavailable(localFormatted);
    }

    if (
      payload.valid !== true ||
      typeof payload.phone_number !== "string" ||
      typeof payload.line_type_intelligence?.type !== "string"
    ) {
      logger.error("twilio_lookup_invalid_provider_response");
      return liveLookupUnavailable(localFormatted);
    }

    const formattedPhone = cleanPhoneNumberLocal(payload.phone_number);
    if (!formattedPhone || formattedPhone !== localFormatted) {
      logger.error("twilio_lookup_provider_phone_mismatch");
      return liveLookupUnavailable(localFormatted);
    }

    const carrierType = payload.line_type_intelligence.type.trim().toLowerCase();
    if (!carrierType) {
      logger.error("twilio_lookup_invalid_provider_response");
      return liveLookupUnavailable(localFormatted);
    }

    if (carrierType !== "mobile") {
      return {
        valid: false,
        carrierType,
        error: `Only mobile numbers are permitted. Line type detected: ${carrierType}.`
      };
    }

    return {
      valid: true,
      formattedPhone,
      carrierType
    };
  } catch {
    const timedOut = controller.signal.aborted;
    logger.error("twilio_lookup_unavailable", { reason: timedOut ? "timeout" : "request-failed" });
    return liveLookupUnavailable(
      localFormatted,
      timedOut ? "Live phone lookup timed out." : "Live phone lookup is unavailable."
    );
  } finally {
    clearTimeout(timeout);
  }
}
