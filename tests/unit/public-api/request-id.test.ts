import { describe, expect, it } from "vitest";

import {
  isPublicApiRequestId,
  PUBLIC_API_REQUEST_ID_HEADER,
  resolvePublicApiRequestId
} from "@/lib/public-api/request-id";

const suppliedRequestId = "123E4567-E89B-42D3-A456-426614174000";
const generatedRequestId = "550e8400-e29b-41d4-a716-446655440000";

describe("public API request IDs", () => {
  it("accepts one valid client UUID and normalizes it for response correlation", () => {
    const headers = new Headers({ [PUBLIC_API_REQUEST_ID_HEADER]: suppliedRequestId });

    expect(resolvePublicApiRequestId(headers, () => generatedRequestId)).toBe(suppliedRequestId.toLowerCase());
  });

  it("replaces missing, malformed, duplicated, or control-bearing evidence", () => {
    const candidates = [
      new Headers(),
      new Headers({ [PUBLIC_API_REQUEST_ID_HEADER]: "customer-order-1" }),
      new Headers({ [PUBLIC_API_REQUEST_ID_HEADER]: `${generatedRequestId},${suppliedRequestId}` }),
      new Headers({ [PUBLIC_API_REQUEST_ID_HEADER]: `${generatedRequestId} extra` })
    ];

    for (const headers of candidates) {
      expect(resolvePublicApiRequestId(headers, () => generatedRequestId)).toBe(generatedRequestId);
    }
  });

  it("rejects an invalid generator result instead of reflecting it", () => {
    expect(() => resolvePublicApiRequestId(new Headers(), () => "not-a-uuid")).toThrowError(
      "The request ID generator returned an invalid value."
    );
  });

  it("recognizes RFC variant UUID request IDs only", () => {
    expect(isPublicApiRequestId(generatedRequestId)).toBe(true);
    expect(isPublicApiRequestId("00000000-0000-0000-0000-000000000000")).toBe(false);
    expect(isPublicApiRequestId(123)).toBe(false);
  });
});
