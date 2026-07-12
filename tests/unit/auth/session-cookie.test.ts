import { NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearLocalSessionCookie,
  getLocalSessionCookieName,
  localSessionCookieName,
  productionSessionCookieName,
  readLocalSessionToken,
  setLocalSessionCookie
} from "@/lib/auth/session-cookie";

const TOKEN = `ss_session_${"a".repeat(43)}`;
const NOW = new Date("2026-07-10T20:00:00.000Z");
const EXPIRES_AT = new Date(NOW.getTime() + 60 * 60_000);

function requestWithCookie(cookie: string) {
  return new Request("https://signalstack.example.test/account", {
    headers: { cookie }
  });
}

function setCookieHeader(response: NextResponse) {
  return response.headers.get("set-cookie") ?? "";
}

function setCookieHeaders(response: NextResponse) {
  return response.headers.getSetCookie();
}

function cookieHeader(response: NextResponse, name: string) {
  return setCookieHeaders(response).find((header) => header.startsWith(`${name}=`)) ?? "";
}

afterEach(() => {
  vi.useRealTimers();
});

describe("local session cookie boundary", () => {
  it("uses a host-only prefixed cookie name only for secure production cookies", () => {
    expect(getLocalSessionCookieName(false)).toBe(localSessionCookieName);
    expect(getLocalSessionCookieName(true)).toBe(productionSessionCookieName);
    expect(localSessionCookieName).toBe("signalstack_session");
    expect(productionSessionCookieName).toBe("__Host-signalstack_session");
  });

  it("reads one bounded local opaque token without decoding or returning other cookies", () => {
    const request = requestWithCookie(`theme=dark; ${localSessionCookieName}=${TOKEN}; locale=en`);
    expect(readLocalSessionToken(request, { secure: false })).toBe(TOKEN);
    expect(readLocalSessionToken(request, { secure: true })).toBeNull();
  });

  it("reads only the production __Host cookie in secure mode", () => {
    const request = requestWithCookie(`${productionSessionCookieName}=${TOKEN}`);
    expect(readLocalSessionToken(request, { secure: true })).toBe(TOKEN);
    expect(readLocalSessionToken(request, { secure: false })).toBeNull();
  });

  it.each([
    ["duplicate local cookies", `${localSessionCookieName}=${TOKEN}; ${localSessionCookieName}=${TOKEN}`],
    ["missing value separator", localSessionCookieName],
    ["empty token", `${localSessionCookieName}=`],
    ["wrong token purpose", `${localSessionCookieName}=ss_invite_${"a".repeat(43)}`],
    ["short token", `${localSessionCookieName}=ss_session_short`],
    ["oversized token", `${localSessionCookieName}=ss_session_${"a".repeat(181)}`],
    ["quoted token", `${localSessionCookieName}="${TOKEN}"`],
    ["encoded token", `${localSessionCookieName}=ss_session_%2F${"a".repeat(41)}`],
    ["whitespace in token", `${localSessionCookieName}=ss_session_${"a".repeat(20)} ${"b".repeat(22)}`]
  ])("rejects %s safely", (_label, cookie) => {
    expect(readLocalSessionToken(requestWithCookie(cookie), { secure: false })).toBeNull();
  });

  it("ignores the non-environment cookie name while rejecting duplicates of the selected name", () => {
    const alternateToken = `ss_session_${"b".repeat(43)}`;
    const mixed = requestWithCookie(
      `${localSessionCookieName}=${alternateToken}; ${productionSessionCookieName}=${TOKEN}`
    );

    expect(readLocalSessionToken(mixed, { secure: false })).toBe(alternateToken);
    expect(readLocalSessionToken(mixed, { secure: true })).toBe(TOKEN);
    expect(
      readLocalSessionToken(
        requestWithCookie(
          `${productionSessionCookieName}=${TOKEN}; ${productionSessionCookieName}=${TOKEN}`
        ),
        { secure: true }
      )
    ).toBeNull();
  });

  it("rejects an oversized Cookie header before token parsing", () => {
    const request = requestWithCookie(`padding=${"x".repeat(8_192)}; ${localSessionCookieName}=${TOKEN}`);
    expect(readLocalSessionToken(request, { secure: false })).toBeNull();
  });

  it("sets a local cookie with bounded lifetime and no Secure attribute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const response = NextResponse.json({ ok: true });
    expect(
      setLocalSessionCookie(response, {
        token: TOKEN,
        expiresAt: EXPIRES_AT,
        secure: false,
        now: NOW
      })
    ).toBeUndefined();

    const headers = setCookieHeaders(response);
    const header = cookieHeader(response, localSessionCookieName);
    const alternate = cookieHeader(response, productionSessionCookieName);
    expect(headers).toHaveLength(2);
    expect(header).toContain(`${localSessionCookieName}=${TOKEN}`);
    expect(header).toContain("Path=/");
    expect(header).toContain("Expires=Fri, 10 Jul 2026 21:00:00 GMT");
    expect(header).toContain("Max-Age=3600");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=lax");
    expect(header).not.toContain("Secure");
    expect(header).not.toContain("Domain=");
    expect(alternate).toContain(`${productionSessionCookieName}=`);
    expect(alternate).toContain("Max-Age=0");
    expect(alternate).toContain("Secure");
    expect(alternate).not.toContain(TOKEN);
    expect(alternate).not.toContain("Domain=");
  });

  it("sets a production __Host cookie with Secure and no Domain attribute", () => {
    const response = NextResponse.json({ ok: true });
    setLocalSessionCookie(response, {
      token: TOKEN,
      expiresAt: EXPIRES_AT,
      secure: true,
      now: NOW
    });

    const headers = setCookieHeaders(response);
    const header = cookieHeader(response, productionSessionCookieName);
    const alternate = cookieHeader(response, localSessionCookieName);
    expect(headers).toHaveLength(2);
    expect(header).toContain(`${productionSessionCookieName}=${TOKEN}`);
    expect(header).toContain("Path=/");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=lax");
    expect(header).toContain("Secure");
    expect(header).not.toContain("Domain=");
    expect(alternate).toContain(`${localSessionCookieName}=`);
    expect(alternate).toContain("Max-Age=0");
    expect(alternate).toContain("Secure");
    expect(alternate).not.toContain(TOKEN);
    expect(alternate).not.toContain("Domain=");
  });

  it.each([false, true])("clears the selected cookie with matching security attributes (secure=%s)", (secure) => {
    const response = NextResponse.json({ ok: true });
    expect(clearLocalSessionCookie(response, { secure })).toBeUndefined();

    const headers = setCookieHeaders(response);
    expect(headers).toHaveLength(2);

    const localHeader = cookieHeader(response, localSessionCookieName);
    const productionHeader = cookieHeader(response, productionSessionCookieName);
    for (const header of [localHeader, productionHeader]) {
      expect(header).toContain("Path=/");
      expect(header).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
      expect(header).toContain("Max-Age=0");
      expect(header).toContain("HttpOnly");
      expect(header).toContain("SameSite=lax");
      expect(header).not.toContain(TOKEN);
      expect(header).not.toContain("Domain=");
    }
    expect(localHeader.includes("Secure")).toBe(secure);
    expect(productionHeader).toContain("Secure");
  });

  it("refuses malformed tokens and non-future expiries without setting a cookie", () => {
    const malformedResponse = NextResponse.json({ ok: true });
    expect(() =>
      setLocalSessionCookie(malformedResponse, {
        token: "ss_session_short",
        expiresAt: EXPIRES_AT,
        secure: false,
        now: NOW
      })
    ).toThrow("token is invalid");
    expect(setCookieHeader(malformedResponse)).toBe("");

    const expiredResponse = NextResponse.json({ ok: true });
    expect(() =>
      setLocalSessionCookie(expiredResponse, {
        token: TOKEN,
        expiresAt: NOW,
        secure: true,
        now: NOW
      })
    ).toThrow("must be in the future");
    expect(setCookieHeader(expiredResponse)).toBe("");
  });
});
