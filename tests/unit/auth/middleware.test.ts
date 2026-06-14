import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";
import { checkApiRateLimit } from "@/lib/rate-limit/api-rate-limit";
import { verifyClerkToken } from "@/lib/auth/clerk-verifier";

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: vi.fn(),
  apiRateLimitHeaders: vi.fn(() => ({})),
  getApiRateLimitClientKey: vi.fn(() => "client-key"),
  getApiRateLimitPolicy: vi.fn(() => ({})),
}));

vi.mock("@/lib/auth/clerk-verifier", () => ({
  verifyClerkToken: vi.fn(),
}));

describe("middleware auth checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkApiRateLimit).mockResolvedValue({ allowed: true, limit: 10, remaining: 9, resetAt: 0, retryAfterSeconds: 0 });
    process.env.PRODUCTION_AUTH_ENABLED = "true";
  });

  afterEach(() => {
    delete process.env.PRODUCTION_AUTH_ENABLED;
  });

  it("allows public API routes without authorization", async () => {
    const request = new NextRequest("http://localhost/api/health");
    const response = await middleware(request);
    expect(response.status).toBe(200);
    expect(verifyClerkToken).not.toHaveBeenCalled();
  });

  it("blocks protected API routes if token is missing", async () => {
    const request = new NextRequest("http://localhost/api/contacts");
    const response = await middleware(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("blocks protected API routes if token is invalid", async () => {
    const request = new NextRequest("http://localhost/api/contacts", {
      headers: { Authorization: "Bearer invalid-token" },
    });
    vi.mocked(verifyClerkToken).mockRejectedValueOnce(new Error("invalid"));

    const response = await middleware(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("allows protected API routes if token is valid", async () => {
    const request = new NextRequest("http://localhost/api/contacts", {
      headers: { Authorization: "Bearer valid-token" },
    });
    vi.mocked(verifyClerkToken).mockResolvedValueOnce({ clerkUserId: "user", clerkOrgId: "org" });

    const response = await middleware(request);
    expect(response.status).toBe(200);
    expect(verifyClerkToken).toHaveBeenCalledWith("valid-token");
  });

  it("redirects dashboard page routes if token is missing", async () => {
    const request = new NextRequest("http://localhost/dashboard");
    const response = await middleware(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
  });

  it("redirects dashboard page routes if token is invalid", async () => {
    const request = new NextRequest("http://localhost/dashboard", {
      headers: { Cookie: "__session=invalid-token" },
    });
    vi.mocked(verifyClerkToken).mockRejectedValueOnce(new Error("invalid"));

    const response = await middleware(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
  });

  it("allows dashboard page routes if token is valid", async () => {
    const request = new NextRequest("http://localhost/dashboard", {
      headers: { Cookie: "__session=valid-token" },
    });
    vi.mocked(verifyClerkToken).mockResolvedValueOnce({ clerkUserId: "user", clerkOrgId: "org" });

    const response = await middleware(request);
    expect(response.status).toBe(200);
    expect(verifyClerkToken).toHaveBeenCalledWith("valid-token");
  });

  it("does not perform auth checks when PRODUCTION_AUTH_ENABLED is false", async () => {
    process.env.PRODUCTION_AUTH_ENABLED = "false";
    const request = new NextRequest("http://localhost/dashboard");
    const response = await middleware(request);
    expect(response.status).toBe(200);
    expect(verifyClerkToken).not.toHaveBeenCalled();
  });
});
