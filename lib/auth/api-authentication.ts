import { NextResponse } from "next/server";
import {
  getOrCreateCurrentOrg,
  type CurrentOrg,
  type CurrentOrgAuthErrorCode
} from "@/lib/auth/current-org";
import { requestHasTrustedOrigin } from "@/lib/auth/request-origin";
import { getRuntimeConfig, type RuntimeConfig } from "@/lib/env/runtime-config";

export type ApiAuthenticationBoundary = "browser-session" | "signed-webhook";

export type ApiAuthenticationErrorCode =
  | "AUTH_REQUIRED"
  | "INVALID_REQUEST_ORIGIN"
  | "AUTH_PROVIDER_UNAVAILABLE"
  | "WEBHOOK_TENANT_ROUTING_UNAVAILABLE";

export type ApiAuthenticationResult =
  | Readonly<{
      ok: true;
      currentOrg: CurrentOrg;
    }>
  | Readonly<{
      ok: false;
      response: NextResponse;
    }>;

export type ApiAuthenticationOptions = Readonly<{
  boundary?: ApiAuthenticationBoundary;
}>;

export type ApiAuthenticationDependencies = Readonly<{
  getAuthMode: () => RuntimeConfig["auth"]["mode"];
  resolveCurrentOrg: () => Promise<CurrentOrg>;
  requestOriginIsTrusted?: (request: Request) => boolean;
}>;

const defaultApiAuthenticationDependencies: ApiAuthenticationDependencies = {
  getAuthMode: () => getRuntimeConfig().auth.mode,
  resolveCurrentOrg: getOrCreateCurrentOrg,
  requestOriginIsTrusted: (request) =>
    requestHasTrustedOrigin(request, getRuntimeConfig().web)
};

const noStoreHeaders = Object.freeze({
  "Cache-Control": "no-store, max-age=0"
});

/**
 * Translate the throwing request-scoped organization resolver into a stable route-handler result.
 * Signed provider callbacks may use the deterministic demo tenant only in demo mode. Until provider
 * ownership can resolve their tenant, non-demo callbacks fail closed instead of accepting a browser
 * session cookie as substitute webhook identity.
 */
export async function authenticateApiRequest(
  requestOrOptions: Request | ApiAuthenticationOptions = {},
  dependencies: ApiAuthenticationDependencies = defaultApiAuthenticationDependencies
): Promise<ApiAuthenticationResult> {
  const request = requestOrOptions instanceof Request ? requestOrOptions : null;
  const options: ApiAuthenticationOptions =
    requestOrOptions instanceof Request ? {} : requestOrOptions;
  const boundary = options.boundary ?? "browser-session";

  try {
    if (boundary === "signed-webhook" && dependencies.getAuthMode() !== "demo") {
      return authenticationFailure(
        "WEBHOOK_TENANT_ROUTING_UNAVAILABLE",
        503,
        "Webhook tenant routing unavailable."
      );
    }

    const currentOrg = await dependencies.resolveCurrentOrg();
    if (
      boundary === "browser-session" &&
      request &&
      isMutationMethod(request.method) &&
      !(dependencies.requestOriginIsTrusted ??
        defaultApiAuthenticationDependencies.requestOriginIsTrusted!)(request)
    ) {
      return authenticationFailure(
        "INVALID_REQUEST_ORIGIN",
        403,
        "Invalid request origin."
      );
    }
    return Object.freeze({ ok: true, currentOrg });
  } catch (error) {
    if (boundary === "signed-webhook") {
      return authenticationFailure(
        "WEBHOOK_TENANT_ROUTING_UNAVAILABLE",
        503,
        "Webhook tenant routing unavailable."
      );
    }

    if (isCurrentOrgAuthError(error) && error.code === "AUTH_REQUIRED") {
      return authenticationFailure("AUTH_REQUIRED", 401, "Authentication required.");
    }

    return authenticationFailure(
      "AUTH_PROVIDER_UNAVAILABLE",
      503,
      "Authentication service unavailable."
    );
  }
}

function isMutationMethod(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

function isCurrentOrgAuthError(
  error: unknown
): error is Error & Readonly<{ code: CurrentOrgAuthErrorCode }> {
  if (!(error instanceof Error) || error.name !== "CurrentOrgAuthError" || !("code" in error)) {
    return false;
  }

  return error.code === "AUTH_REQUIRED" || error.code === "AUTH_PROVIDER_UNAVAILABLE";
}

function authenticationFailure(
  code: ApiAuthenticationErrorCode,
  status: 401 | 403 | 503,
  error: string
): ApiAuthenticationResult {
  return Object.freeze({
    ok: false,
    response: NextResponse.json({ error, code }, { status, headers: noStoreHeaders })
  });
}
