import type { RuntimeConfig } from "@/lib/env/runtime-config";

export type RequestOriginPolicy = Pick<RuntimeConfig["web"], "trustProxy">;

/**
 * Require an exact same-origin browser mutation. Forwarded origin evidence is considered only when
 * the operator explicitly trusts a proxy that overwrites those headers.
 */
export function requestHasTrustedOrigin(
  request: Pick<Request, "headers" | "url">,
  policy: RequestOriginPolicy
) {
  const presentedOrigin = readSingleHeaderValue(request.headers.get("origin"));
  if (!presentedOrigin) {
    return false;
  }

  const protocol = policy.trustProxy
    ? readSingleHeaderValue(request.headers.get("x-forwarded-proto"))
    : safelyReadRequestProtocol(request);
  const host = readSingleHeaderValue(
    request.headers.get(policy.trustProxy ? "x-forwarded-host" : "host")
  );
  if (!protocol || !host || !/^(?:http|https)$/.test(protocol) || /[\\/@\s?#]/.test(host)) {
    return false;
  }

  try {
    const parsedOrigin = new URL(presentedOrigin);
    const expectedOrigin = new URL(`${protocol}://${host}`);
    return presentedOrigin === parsedOrigin.origin && parsedOrigin.origin === expectedOrigin.origin;
  } catch {
    return false;
  }
}

function safelyReadRequestProtocol(request: Pick<Request, "url">) {
  try {
    return new URL(request.url).protocol.slice(0, -1);
  } catch {
    return null;
  }
}

function readSingleHeaderValue(value: string | null) {
  if (!value || value.includes(",")) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}
