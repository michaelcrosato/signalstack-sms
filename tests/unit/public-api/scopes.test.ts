import { describe, expect, it } from "vitest";

import {
  API_SCOPES,
  isApiScope,
  normalizeApiScopes,
  type ApiScope
} from "@/lib/public-api/scopes";

describe("public API scope catalog", () => {
  it("freezes the exact granular and external-impact scope vocabulary", () => {
    expect(API_SCOPES).toEqual([
      "organization:read",
      "contacts:read",
      "contacts:write",
      "tags:read",
      "tags:write",
      "lists:read",
      "lists:write",
      "segments:read",
      "segments:write",
      "templates:read",
      "templates:write",
      "messages:read",
      "messages:write",
      "messages:send",
      "campaigns:read",
      "campaigns:write",
      "campaigns:send",
      "conversations:read",
      "conversations:write",
      "deliveries:read",
      "credentials:read",
      "credentials:write",
      "webhooks:read",
      "webhooks:write",
      "webhooks:replay"
    ] satisfies ApiScope[]);
  });

  it("recognizes only exact catalog values", () => {
    expect(isApiScope("messages:send")).toBe(true);
    expect(isApiScope("MESSAGES:SEND")).toBe(false);
    expect(isApiScope("messages:*")).toBe(false);
    expect(isApiScope(42)).toBe(false);
  });

  it("deduplicates scopes into canonical catalog order", () => {
    expect(
      normalizeApiScopes(["webhooks:replay", "contacts:read", "webhooks:replay", "messages:send"])
    ).toEqual(["contacts:read", "messages:send", "webhooks:replay"]);
  });

  it("rejects unknown or non-string scopes", () => {
    expect(() => normalizeApiScopes(["contacts:read", "contacts:delete"])).toThrowError(
      "Invalid API scope."
    );
    expect(() => normalizeApiScopes(["contacts:read", null])).toThrowError("Invalid API scope.");
  });
});
