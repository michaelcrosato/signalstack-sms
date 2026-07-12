import { describe, expect, it } from "vitest";

import {
  getPublicApiErrorDefinition,
  isPublicApiErrorCode,
  PUBLIC_API_ERROR_CODES,
  PUBLIC_API_ERROR_DEFINITIONS,
  type PublicApiErrorCode
} from "@/lib/public-api/errors";

describe("public API error catalog", () => {
  it("freezes the exact stable code vocabulary", () => {
    expect(PUBLIC_API_ERROR_CODES).toEqual([
      "AUTHENTICATION_REQUIRED",
      "INVALID_API_KEY",
      "INSUFFICIENT_SCOPE",
      "INVALID_REQUEST",
      "INVALID_JSON",
      "INVALID_CURSOR",
      "IDEMPOTENCY_KEY_REQUIRED",
      "IDEMPOTENCY_KEY_INVALID",
      "PAYLOAD_TOO_LARGE",
      "UNSUPPORTED_MEDIA_TYPE",
      "VALIDATION_ERROR",
      "OPERATION_NOT_ALLOWED",
      "NOT_FOUND",
      "METHOD_NOT_ALLOWED",
      "CONFLICT",
      "IDEMPOTENCY_CONFLICT",
      "RATE_LIMIT_EXCEEDED",
      "INTERNAL_ERROR",
      "UPSTREAM_ERROR",
      "SERVICE_UNAVAILABLE"
    ] satisfies PublicApiErrorCode[]);
  });

  it("maps authentication, authorization, rate, and availability failures to stable statuses", () => {
    expect(getPublicApiErrorDefinition("AUTHENTICATION_REQUIRED").status).toBe(401);
    expect(getPublicApiErrorDefinition("INVALID_API_KEY").status).toBe(401);
    expect(getPublicApiErrorDefinition("INSUFFICIENT_SCOPE").status).toBe(403);
    expect(getPublicApiErrorDefinition("RATE_LIMIT_EXCEEDED").status).toBe(429);
    expect(getPublicApiErrorDefinition("SERVICE_UNAVAILABLE").status).toBe(503);
  });

  it("provides a non-empty safe default message for every code", () => {
    for (const code of PUBLIC_API_ERROR_CODES) {
      const definition = PUBLIC_API_ERROR_DEFINITIONS[code];
      expect(definition.message.length).toBeGreaterThan(0);
      expect(definition.status).toBeGreaterThanOrEqual(400);
      expect(definition.status).toBeLessThanOrEqual(599);
    }
  });

  it("recognizes exact error codes only", () => {
    expect(isPublicApiErrorCode("IDEMPOTENCY_CONFLICT")).toBe(true);
    expect(isPublicApiErrorCode("IDEMPOTENCY_KEY_REUSED")).toBe(false);
    expect(isPublicApiErrorCode("invalid_api_key")).toBe(false);
    expect(isPublicApiErrorCode(null)).toBe(false);
  });
});
