import type { NextResponse } from "next/server";

export const localSessionCookieName = "signalstack_session";
export const productionSessionCookieName = "__Host-signalstack_session";

const SESSION_TOKEN_PATTERN = /^ss_session_[A-Za-z0-9_-]{43}$/;
const MAX_COOKIE_HEADER_CHARACTERS = 8_192;

export type LocalSessionCookieSecurity = Readonly<{
  /** Must reflect the production runtime; selects the __Host- cookie and Secure attribute. */
  secure: boolean;
}>;

export type SetLocalSessionCookieInput = LocalSessionCookieSecurity &
  Readonly<{
    token: string;
    expiresAt: Date;
    /** Testable clock used only to derive Max-Age. */
    now?: Date;
  }>;

export function getLocalSessionCookieName(secure: boolean) {
  return secure ? productionSessionCookieName : localSessionCookieName;
}

/**
 * Read exactly one environment-appropriate opaque session token from the raw Cookie header.
 * Parsing the header directly preserves duplicate evidence that cookie-store convenience APIs discard.
 */
export function readLocalSessionToken(
  request: Pick<Request, "headers">,
  options: Partial<LocalSessionCookieSecurity> = {}
): string | null {
  const secure = options.secure ?? process.env.NODE_ENV === "production";
  const expectedName = getLocalSessionCookieName(secure);
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader || cookieHeader.length > MAX_COOKIE_HEADER_CHARACTERS) {
    return null;
  }

  let selectedCookieCount = 0;
  let selectedToken: string | null = null;

  for (const rawPart of cookieHeader.split(";")) {
    const part = rawPart.trim();
    if (!part) {
      continue;
    }

    const separatorIndex = part.indexOf("=");
    const name = (separatorIndex >= 0 ? part.slice(0, separatorIndex) : part).trim();
    if (name !== expectedName) {
      // The alternate name is never an authentication input. In production this prevents a sibling
      // host from using a parent-domain legacy cookie to deny access to the __Host- session.
      continue;
    }

    selectedCookieCount += 1;
    if (selectedCookieCount > 1 || separatorIndex <= 0) {
      return null;
    }

    const candidate = part.slice(separatorIndex + 1);
    if (!sessionTokenIsValid(candidate)) {
      return null;
    }
    selectedToken = candidate;
  }

  return selectedCookieCount === 1 ? selectedToken : null;
}

export function setLocalSessionCookie(response: NextResponse, input: SetLocalSessionCookieInput): void {
  assertSecurityMode(input.secure);
  if (!sessionTokenIsValid(input.token)) {
    throw new Error("Local session cookie token is invalid.");
  }

  const now = input.now ?? new Date();
  assertValidDate(now, "clock");
  assertValidDate(input.expiresAt, "expiry");
  const remainingMs = input.expiresAt.getTime() - now.getTime();
  if (remainingMs <= 0) {
    throw new Error("Local session cookie expiry must be in the future.");
  }

  const selectedName = getLocalSessionCookieName(input.secure);
  const alternateName = getLocalSessionCookieName(!input.secure);
  expireLocalSessionCookie(
    response,
    alternateName,
    alternateName === productionSessionCookieName || input.secure
  );
  response.cookies.set({
    name: selectedName,
    value: input.token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: input.secure,
    expires: new Date(input.expiresAt),
    maxAge: Math.max(1, Math.floor(remainingMs / 1_000))
  });
}

export function clearLocalSessionCookie(response: NextResponse, input: LocalSessionCookieSecurity): void {
  assertSecurityMode(input.secure);
  expireLocalSessionCookie(response, localSessionCookieName, input.secure);
  // __Host- cookies are accepted (including as deletion tombstones) only with Secure + Path=/ and no Domain.
  expireLocalSessionCookie(response, productionSessionCookieName, true);
}

function expireLocalSessionCookie(response: NextResponse, name: string, secure: boolean) {
  response.cookies.set({
    name,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    expires: new Date(0),
    maxAge: 0
  });
}

function sessionTokenIsValid(value: unknown): value is string {
  return typeof value === "string" && SESSION_TOKEN_PATTERN.test(value);
}

function assertSecurityMode(value: unknown): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new Error("Local session cookie security mode is invalid.");
  }
}

function assertValidDate(value: Date, label: string) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`Local session cookie ${label} is invalid.`);
  }
}
