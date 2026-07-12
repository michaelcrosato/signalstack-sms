import { describe, expect, it } from "vitest";
import { requestHasTrustedOrigin } from "@/lib/auth/request-origin";

function request(
  url = "http://localhost:3000/api/auth/login",
  headers: Record<string, string> = {}
) {
  return new Request(url, { headers });
}

describe("same-origin request validation", () => {
  it("accepts an exact direct origin using the request protocol and Host header", () => {
    expect(
      requestHasTrustedOrigin(
        request("http://localhost:3000/api/test", {
          host: "localhost:3000",
          origin: "http://localhost:3000"
        }),
        { trustProxy: false }
      )
    ).toBe(true);
    expect(
      requestHasTrustedOrigin(
        request("https://app.example.test/api/test", {
          host: "app.example.test",
          origin: "https://app.example.test"
        }),
        { trustProxy: false }
      )
    ).toBe(true);
  });

  it.each([
    ["missing Origin", { host: "app.example.test" }],
    ["cross-site Origin", { host: "app.example.test", origin: "https://attacker.example" }],
    ["Origin with path", { host: "app.example.test", origin: "https://app.example.test/path" }],
    ["Origin with trailing slash", { host: "app.example.test", origin: "https://app.example.test/" }],
    ["multiple Origin values", { host: "app.example.test", origin: "https://app.example.test,https://attacker.example" }],
    ["missing Host", { origin: "https://app.example.test" }],
    ["invalid Host", { host: "app.example.test/path", origin: "https://app.example.test" }]
  ])("rejects %s", (_label, headers) => {
    expect(
      requestHasTrustedOrigin(request("https://app.example.test/api/test", headers), {
        trustProxy: false
      })
    ).toBe(false);
  });

  it("ignores forwarded evidence unless proxy trust is explicit", () => {
    const proxiedRequest = request("http://internal.service/api/test", {
      host: "internal.service",
      origin: "https://app.example.test",
      "x-forwarded-host": "app.example.test",
      "x-forwarded-proto": "https"
    });

    expect(requestHasTrustedOrigin(proxiedRequest, { trustProxy: false })).toBe(false);
    expect(requestHasTrustedOrigin(proxiedRequest, { trustProxy: true })).toBe(true);
  });

  it.each([
    ["missing forwarded protocol", { "x-forwarded-host": "app.example.test" }],
    ["missing forwarded host", { "x-forwarded-proto": "https" }],
    ["multiple protocols", { "x-forwarded-host": "app.example.test", "x-forwarded-proto": "https,http" }],
    ["invalid protocol", { "x-forwarded-host": "app.example.test", "x-forwarded-proto": "javascript" }],
    ["multiple hosts", { "x-forwarded-host": "app.example.test,internal", "x-forwarded-proto": "https" }]
  ])("fails closed for trusted-proxy requests with %s", (_label, forwarded) => {
    const proxiedRequest = request("http://internal.service/api/test", {
      host: "internal.service",
      origin: "https://app.example.test",
      ...forwarded
    });

    expect(requestHasTrustedOrigin(proxiedRequest, { trustProxy: true })).toBe(false);
  });
});
