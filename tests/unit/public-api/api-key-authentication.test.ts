import { describe, expect, it, vi } from "vitest";
import {
  authenticatePublicApiKey,
  type PublicApiAuthenticationDependencies,
  type PublicApiCredentialLookup
} from "@/lib/public-api/api-key-authentication";
import { generateApiKey } from "@/lib/public-api/api-key-crypto";

const pepper = "p".repeat(64);

function dependencies(
  lookup: PublicApiCredentialLookup | null,
  outcome: "accepted" | "invalid" | "rate_limited" = "accepted"
): PublicApiAuthenticationDependencies {
  return {
    readPepper: () => pepper,
    resolveCredential: vi.fn(async () => lookup),
    consumeCredential: vi.fn(async (resolved) => {
      if (outcome === "invalid") {
        return { outcome: "invalid" } as const;
      }
      const rateLimit = {
        limit: 60,
        remaining: outcome === "rate_limited" ? 0 : 59,
        resetAt: new Date("2030-01-01T00:01:00.000Z"),
        retryAfterSeconds: outcome === "rate_limited" ? 60 : 0
      } as const;
      if (outcome === "rate_limited") {
        return { outcome, rateLimit } as const;
      }
      return {
        outcome,
        principal: {
          orgId: resolved.orgId,
          credentialId: resolved.id,
          prefix: resolved.prefix,
          scopes: ["contacts:read", "contacts:write"] as const
        },
        rateLimit
      } as const;
    }),
    getClientAddress: () => "203.0.113.8"
  };
}

describe("public API key authentication", () => {
  it("requires Authorization and never falls back to browser cookies", async () => {
    const deps = dependencies(null);
    const request = new Request("https://example.test/api/v1/contacts", {
      headers: { cookie: "signalstack_session=browser-secret" }
    });

    const result = await authenticatePublicApiKey(request, ["contacts:read"], deps);
    expect(result).toMatchObject({ ok: false, status: 401, code: "AUTHENTICATION_REQUIRED" });
    expect(deps.resolveCredential).not.toHaveBeenCalled();
  });

  it("separates malformed authorization syntax from the generic unusable-key denial", async () => {
    const malformed = await authenticatePublicApiKey(
      new Request("https://example.test/api/v1/contacts", {
        headers: { authorization: "Bearer not-a-key" }
      }),
      ["contacts:read"],
      dependencies(null)
    );
    expect(malformed).toMatchObject({ ok: false, status: 401, code: "AUTHENTICATION_REQUIRED" });

    const generated = generateApiKey(pepper);
    const lookup = {
      id: "credential-a",
      orgId: "org-a",
      prefix: generated.prefix,
      secretHash: generated.secretHash
    };
    const invalidated = await authenticatePublicApiKey(
      new Request("https://example.test/api/v1/contacts", {
        headers: { authorization: `Bearer ${generated.token}` }
      }),
      ["contacts:read"],
      dependencies(lookup, "invalid")
    );
    expect(invalidated).toMatchObject({ ok: false, status: 401, code: "INVALID_API_KEY" });
  });

  it("authorizes required scopes and reports the authoritative per-key budget", async () => {
    const generated = generateApiKey(pepper);
    const lookup = {
      id: "credential-a",
      orgId: "org-a",
      prefix: generated.prefix,
      secretHash: generated.secretHash
    };
    const result = await authenticatePublicApiKey(
      new Request("https://example.test/api/v1/contacts", {
        headers: { authorization: `Bearer ${generated.token}` }
      }),
      ["contacts:read"],
      dependencies(lookup)
    );

    expect(result).toMatchObject({
      ok: true,
      principal: { orgId: "org-a", credentialId: "credential-a" },
      headers: { "RateLimit-Limit": "60", "RateLimit-Remaining": "59" }
    });
  });

  it("denies missing scopes after credential consumption", async () => {
    const generated = generateApiKey(pepper);
    const lookup = {
      id: "credential-a",
      orgId: "org-a",
      prefix: generated.prefix,
      secretHash: generated.secretHash
    };
    const deps = dependencies(lookup);
    const result = await authenticatePublicApiKey(
      new Request("https://example.test/api/v1/campaigns", {
        headers: { authorization: `Bearer ${generated.token}` }
      }),
      ["campaigns:send"],
      deps
    );

    expect(result).toMatchObject({ ok: false, status: 403, code: "INSUFFICIENT_SCOPE" });
    expect(deps.consumeCredential).toHaveBeenCalledOnce();
  });

  it("returns Retry-After when the PostgreSQL per-key bucket is exhausted", async () => {
    const generated = generateApiKey(pepper);
    const lookup = {
      id: "credential-a",
      orgId: "org-a",
      prefix: generated.prefix,
      secretHash: generated.secretHash
    };
    const result = await authenticatePublicApiKey(
      new Request("https://example.test/api/v1/contacts", {
        headers: { authorization: `Bearer ${generated.token}` }
      }),
      ["contacts:read"],
      dependencies(lookup, "rate_limited")
    );
    expect(result).toMatchObject({
      ok: false,
      status: 429,
      code: "RATE_LIMIT_EXCEEDED",
      headers: { "Retry-After": "60", "RateLimit-Remaining": "0" }
    });
  });
});
