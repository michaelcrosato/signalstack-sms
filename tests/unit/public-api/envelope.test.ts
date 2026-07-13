import { describe, expect, it } from "vitest";

import {
  createPublicApiErrorEnvelope,
  createPublicApiErrorResponse,
  createPublicApiSuccessEnvelope,
  createPublicApiSuccessResponse
} from "@/lib/public-api/envelope";

const requestId = "550e8400-e29b-41d4-a716-446655440000";

describe("public API response envelope", () => {
  it("creates the stable success envelope with request metadata", () => {
    expect(
      createPublicApiSuccessEnvelope({ id: "contact_1" }, requestId, {
        nextCursor: "cursor_1",
        hasMore: true
      })
    ).toEqual({
      ok: true,
      data: { id: "contact_1" },
      meta: { requestId, nextCursor: "cursor_1", hasMore: true }
    });
  });

  it("does not let extra metadata replace the authoritative request ID", () => {
    expect(
      createPublicApiSuccessEnvelope({ id: "contact_1" }, requestId, {
        requestId: "550e8400-e29b-41d4-a716-446655440001"
      })
    ).toMatchObject({ meta: { requestId } });
  });

  it("uses stable error defaults and omits absent details", () => {
    expect(createPublicApiErrorEnvelope("INVALID_API_KEY", requestId)).toEqual({
      ok: false,
      error: {
        code: "INVALID_API_KEY",
        message: "The API key is invalid."
      },
      meta: { requestId }
    });

    expect(
      createPublicApiErrorEnvelope("VALIDATION_ERROR", requestId, {
        details: [{ field: "phone", reason: "invalid" }]
      })
    ).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        details: [{ field: "phone", reason: "invalid" }]
      }
    });
  });

  it("creates non-cacheable JSON responses with an authoritative request header", async () => {
    const response = createPublicApiSuccessResponse(
      { id: "contact_1" },
      {
        requestId,
        status: 201,
        headers: {
          "Cache-Control": "public",
          "X-Request-Id": "untrusted",
          "RateLimit-Limit": "60"
        }
      }
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("X-Request-Id")).toBe(requestId);
    expect(response.headers.get("RateLimit-Limit")).toBe("60");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { id: "contact_1" },
      meta: { requestId }
    });
  });

  it("derives error status from the catalog and preserves safe retry headers", async () => {
    const response = createPublicApiErrorResponse({
      requestId,
      code: "RATE_LIMIT_EXCEEDED",
      headers: { "Retry-After": "30", "RateLimit-Remaining": "0" }
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(response.headers.get("RateLimit-Remaining")).toBe("0");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "RATE_LIMIT_EXCEEDED" },
      meta: { requestId }
    });
  });

  it("rejects status classes that contradict the envelope", () => {
    expect(() => createPublicApiSuccessResponse({}, { requestId, status: 400 })).toThrow(RangeError);
    expect(() =>
      createPublicApiErrorResponse({ requestId, code: "INTERNAL_ERROR", status: 200 })
    ).toThrow(RangeError);
  });
});
