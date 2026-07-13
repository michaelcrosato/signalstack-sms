import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getPublicApiRoot } from "@/app/api/v1/route";
import { POST as postUnknownPublicApiPath } from "@/app/api/v1/[...path]/route";
import { createPublicApiErrorResponse } from "@/lib/public-api/envelope";

const mocks = vi.hoisted(() => ({ authorizePublicApiRequest: vi.fn() }));

vi.mock("@/lib/public-api/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-api/request")>()),
  authorizePublicApiRequest: mocks.authorizePublicApiRequest
}));

const REQUEST_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("public API root and unmatched path handlers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps unknown paths behind bearer authentication without consuming the body", async () => {
    mocks.authorizePublicApiRequest.mockResolvedValue({
      ok: false,
      requestId: REQUEST_ID,
      response: createPublicApiErrorResponse({ requestId: REQUEST_ID, code: "INVALID_API_KEY" })
    });
    const request = new Request("https://signalstack.example/api/v1/unknown/path", {
      method: "POST",
      body: "{malformed"
    });

    const response = await postUnknownPublicApiPath(request);
    expect(response.status).toBe(401);
    expect(request.bodyUsed).toBe(false);
    expect(mocks.authorizePublicApiRequest).toHaveBeenCalledWith(request, []);
  });

  it("returns a canonical rate-accounted NOT_FOUND for root and nested paths", async () => {
    mocks.authorizePublicApiRequest.mockResolvedValue({
      ok: true,
      requestId: REQUEST_ID,
      principal: { orgId: "org_1", credentialId: "credential_1", prefix: "ss_api_demo", scopes: [] },
      responseHeaders: { "RateLimit-Remaining": "58" }
    });

    for (const response of [
      await getPublicApiRoot(new Request("https://signalstack.example/api/v1")),
      await postUnknownPublicApiPath(
        new Request("https://signalstack.example/api/v1/unknown/path", { method: "POST" })
      )
    ]) {
      expect(response.status).toBe(404);
      expect(response.headers.get("RateLimit-Remaining")).toBe("58");
      expect(response.headers.get("X-Request-Id")).toBe(REQUEST_ID);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "NOT_FOUND" },
        meta: { requestId: REQUEST_ID }
      });
    }
  });
});
