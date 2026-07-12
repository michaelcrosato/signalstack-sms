import { describe, expect, it, vi } from "vitest";
import { createPublicApiErrorResponse } from "@/lib/public-api/envelope";
import {
  createPublicApiMethodNotAllowedHandler,
  createPublicMetadataMethodNotAllowedHandler,
  type PublicApiMethodNotAllowedDependencies
} from "@/lib/public-api/method-not-allowed";

const REQUEST_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("public API method-not-allowed handlers", () => {
  it("authenticates with zero scopes before touching an untrusted body", async () => {
    const authorize = vi.fn(async (_request: Request, _requiredScopes: readonly []) => {
      void _request;
      void _requiredScopes;
      return {
        ok: false as const,
        requestId: REQUEST_ID,
        response: createPublicApiErrorResponse({
          requestId: REQUEST_ID,
          code: "INVALID_API_KEY",
          headers: { "WWW-Authenticate": 'Bearer realm="signalstack-api", error="invalid_token"' }
        })
      };
    });
    const handler = createPublicApiMethodNotAllowedHandler(
      ["GET"],
      dependencies(authorize)
    );
    const request = new Request("https://signalstack.example/api/v1/organization", {
      method: "POST",
      headers: {
        Authorization: "Bearer invalid",
        "Content-Type": "application/json",
        "X-Request-Id": REQUEST_ID
      },
      body: "{malformed"
    });

    const response = await handler(request);

    expect(authorize).toHaveBeenCalledWith(request, []);
    expect(request.bodyUsed).toBe(false);
    expect(response.status).toBe(401);
    expect(response.headers.get("Allow")).toBeNull();
    expect(response.headers.get("WWW-Authenticate")).toContain("invalid_token");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_API_KEY" },
      meta: { requestId: REQUEST_ID }
    });
  });

  it("keeps a missing bearer credential at 401 without initializing the database", async () => {
    const handler = createPublicApiMethodNotAllowedHandler(["GET"]);
    const request = new Request("https://signalstack.example/api/v1/organization", {
      method: "POST",
      headers: { "X-Request-Id": REQUEST_ID }
    });

    const response = await handler(request);

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Request-Id")).toBe(REQUEST_ID);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" }
    });
  });

  it("returns the canonical rate-accounted 405 envelope for a valid key", async () => {
    const authorize = vi.fn(async (_request: Request, _requiredScopes: readonly []) => {
      void _request;
      void _requiredScopes;
      return {
        ok: true as const,
        requestId: REQUEST_ID,
        principal: {
          orgId: "org_demo",
          credentialId: "credential_demo",
          prefix: "ss_api_demo123456",
          scopes: []
        },
        responseHeaders: {
          "RateLimit-Limit": "60",
          "RateLimit-Remaining": "59",
          "RateLimit-Reset": "1783819200"
        }
      };
    });
    const handler = createPublicApiMethodNotAllowedHandler(
      ["POST", "GET"],
      dependencies(authorize)
    );
    const request = new Request("https://signalstack.example/api/v1/contacts", {
      method: "PUT",
      headers: { "X-Request-Id": REQUEST_ID },
      body: "untrusted"
    });

    const response = await handler(request);

    expect(authorize).toHaveBeenCalledWith(request, []);
    expect(request.bodyUsed).toBe(false);
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, POST");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Request-Id")).toBe(REQUEST_ID);
    expect(response.headers.get("RateLimit-Limit")).toBe("60");
    expect(response.headers.get("RateLimit-Remaining")).toBe("59");
    expect(response.headers.get("RateLimit-Reset")).toBe("1783819200");
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "The request method is not allowed."
      },
      meta: { requestId: REQUEST_ID }
    });
  });

  it("serves the metadata exception 405 without authentication or rate headers", async () => {
    const handler = createPublicMetadataMethodNotAllowedHandler(["GET"]);
    const response = await handler(
      new Request("https://signalstack.example/api/v1/openapi.json", {
        method: "DELETE",
        headers: { "X-Request-Id": REQUEST_ID }
      })
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Request-Id")).toBe(REQUEST_ID);
    expect(response.headers.get("RateLimit-Limit")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "METHOD_NOT_ALLOWED" },
      meta: { requestId: REQUEST_ID }
    });
  });
});

function dependencies(
  authorize: PublicApiMethodNotAllowedDependencies["authorize"]
): PublicApiMethodNotAllowedDependencies {
  return { authorize };
}
