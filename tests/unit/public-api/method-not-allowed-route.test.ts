import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUT as unsupportedContactsPut } from "@/app/api/v1/contacts/route";
import { createPublicApiErrorResponse } from "@/lib/public-api/envelope";

const mocks = vi.hoisted(() => ({
  authorizePublicApiRequest: vi.fn()
}));

vi.mock("@/lib/public-api/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-api/request")>()),
  authorizePublicApiRequest: mocks.authorizePublicApiRequest
}));

const REQUEST_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("public API route method-not-allowed wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an invalid-key denial before reading the body", async () => {
    mocks.authorizePublicApiRequest.mockResolvedValue({
      ok: false,
      requestId: REQUEST_ID,
      response: createPublicApiErrorResponse({
        requestId: REQUEST_ID,
        code: "INVALID_API_KEY"
      })
    });
    const request = untrustedPutRequest();

    const response = await unsupportedContactsPut(request);

    expect(mocks.authorizePublicApiRequest).toHaveBeenCalledWith(request, []);
    expect(request.bodyUsed).toBe(false);
    expect(response.status).toBe(401);
    expect(response.headers.get("Allow")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INVALID_API_KEY" } });
  });

  it("returns a rate-accounted 405 and the route's exact Allow header", async () => {
    mocks.authorizePublicApiRequest.mockResolvedValue({
      ok: true,
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
    });
    const request = untrustedPutRequest();

    const response = await unsupportedContactsPut(request);

    expect(mocks.authorizePublicApiRequest).toHaveBeenCalledWith(request, []);
    expect(request.bodyUsed).toBe(false);
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, POST");
    expect(response.headers.get("RateLimit-Remaining")).toBe("59");
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "The request method is not allowed."
      },
      meta: { requestId: REQUEST_ID }
    });
  });
});

function untrustedPutRequest(): Request {
  return new Request("https://signalstack.example/api/v1/contacts", {
    method: "PUT",
    headers: {
      Authorization: "Bearer ss_api_example_example",
      "Content-Type": "application/json",
      "X-Request-Id": REQUEST_ID
    },
    body: "{malformed"
  });
}
