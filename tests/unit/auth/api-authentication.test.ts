import { MembershipRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { CurrentOrgAuthError, type CurrentOrg } from "@/lib/auth/current-org";

const currentOrg: CurrentOrg = Object.freeze({
  orgId: "org_demo",
  orgSlug: "demo",
  orgName: "Demo",
  userId: "user_demo",
  email: "owner@example.com",
  role: MembershipRole.OWNER,
  demoMode: true
});

describe("API authentication translation", () => {
  it("returns a discriminated authenticated result without changing the principal", async () => {
    const resolveCurrentOrg = vi.fn().mockResolvedValue(currentOrg);

    const result = await authenticateApiRequest(
      {},
      { getAuthMode: () => "local", resolveCurrentOrg }
    );

    expect(result).toEqual({ ok: true, currentOrg });
    expect(resolveCurrentOrg).toHaveBeenCalledTimes(1);
  });

  it("rejects a cross-origin browser mutation only after authentication", async () => {
    const resolveCurrentOrg = vi.fn().mockResolvedValue(currentOrg);
    const requestOriginIsTrusted = vi.fn().mockReturnValue(false);
    const request = new Request("https://app.example.test/api/contacts", {
      method: "POST",
      headers: { Origin: "https://evil.example.test" }
    });

    const result = await authenticateApiRequest(request, {
      getAuthMode: () => "local",
      resolveCurrentOrg,
      requestOriginIsTrusted
    });

    expect(resolveCurrentOrg).toHaveBeenCalledTimes(1);
    expect(requestOriginIsTrusted).toHaveBeenCalledWith(request);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    expect(result.response.headers.get("cache-control")).toContain("no-store");
    await expect(result.response.json()).resolves.toEqual({
      error: "Invalid request origin.",
      code: "INVALID_REQUEST_ORIGIN"
    });
  });

  it("does not impose mutation-origin policy on authenticated reads", async () => {
    const requestOriginIsTrusted = vi.fn().mockReturnValue(false);
    const result = await authenticateApiRequest(
      new Request("https://app.example.test/api/contacts", { method: "GET" }),
      {
        getAuthMode: () => "local",
        resolveCurrentOrg: vi.fn().mockResolvedValue(currentOrg),
        requestOriginIsTrusted
      }
    );

    expect(result).toEqual({ ok: true, currentOrg });
    expect(requestOriginIsTrusted).not.toHaveBeenCalled();
  });

  it("translates a missing local session to a secret-free no-store 401", async () => {
    const result = await authenticateApiRequest(
      {},
      {
        getAuthMode: () => "local",
        resolveCurrentOrg: vi.fn().mockRejectedValue(new CurrentOrgAuthError("AUTH_REQUIRED"))
      }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    expect(result.response.headers.get("cache-control")).toContain("no-store");
    await expect(result.response.json()).resolves.toEqual({
      error: "Authentication required.",
      code: "AUTH_REQUIRED"
    });
  });

  it("translates provider and unexpected resolver failures to the same generic no-store 503", async () => {
    for (const error of [
      new CurrentOrgAuthError("AUTH_PROVIDER_UNAVAILABLE"),
      new Error("database password must not escape")
    ]) {
      const result = await authenticateApiRequest(
        {},
        {
          getAuthMode: () => "local",
          resolveCurrentOrg: vi.fn().mockRejectedValue(error)
        }
      );

      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.response.status).toBe(503);
      expect(result.response.headers.get("cache-control")).toContain("no-store");
      await expect(result.response.json()).resolves.toEqual({
        error: "Authentication service unavailable.",
        code: "AUTH_PROVIDER_UNAVAILABLE"
      });
    }
  });

  it("preserves deterministic demo webhook routing", async () => {
    const resolveCurrentOrg = vi.fn().mockResolvedValue(currentOrg);

    const result = await authenticateApiRequest(
      { boundary: "signed-webhook" },
      { getAuthMode: () => "demo", resolveCurrentOrg }
    );

    expect(result).toEqual({ ok: true, currentOrg });
    expect(resolveCurrentOrg).toHaveBeenCalledTimes(1);
  });

  it("fails non-demo signed webhooks with 503 without consulting a browser session", async () => {
    const resolveCurrentOrg = vi.fn().mockResolvedValue(currentOrg);

    const result = await authenticateApiRequest(
      { boundary: "signed-webhook" },
      { getAuthMode: () => "local", resolveCurrentOrg }
    );

    expect(resolveCurrentOrg).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(503);
    expect(result.response.headers.get("cache-control")).toContain("no-store");
    await expect(result.response.json()).resolves.toEqual({
      error: "Webhook tenant routing unavailable.",
      code: "WEBHOOK_TENANT_ROUTING_UNAVAILABLE"
    });
  });

  it("fails signed webhooks closed when runtime mode resolution is unavailable", async () => {
    const resolveCurrentOrg = vi.fn().mockResolvedValue(currentOrg);

    const result = await authenticateApiRequest(
      { boundary: "signed-webhook" },
      {
        getAuthMode: () => {
          throw new Error("raw configuration detail");
        },
        resolveCurrentOrg
      }
    );

    expect(resolveCurrentOrg).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(503);
    await expect(result.response.json()).resolves.toMatchObject({
      code: "WEBHOOK_TENANT_ROUTING_UNAVAILABLE"
    });
  });

  it("never turns a demo webhook resolver denial into a browser-session challenge", async () => {
    const result = await authenticateApiRequest(
      { boundary: "signed-webhook" },
      {
        getAuthMode: () => "demo",
        resolveCurrentOrg: vi.fn().mockRejectedValue(new CurrentOrgAuthError("AUTH_REQUIRED"))
      }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(503);
    await expect(result.response.json()).resolves.toMatchObject({
      code: "WEBHOOK_TENANT_ROUTING_UNAVAILABLE"
    });
  });
});
