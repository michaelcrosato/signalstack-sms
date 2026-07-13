import { createPublicApiErrorResponse } from "@/lib/public-api/envelope";
import {
  authorizePublicApiRequest,
  type PublicApiRequestAuthorization
} from "@/lib/public-api/request";
import { resolvePublicApiRequestId } from "@/lib/public-api/request-id";

export const PUBLIC_API_ROUTE_METHODS = Object.freeze([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS"
] as const);

export type PublicApiRouteMethod = (typeof PUBLIC_API_ROUTE_METHODS)[number];
export type PublicApiMethodNotAllowedHandler = (
  request: Request,
  context?: unknown
) => Promise<Response>;

export type PublicApiMethodNotAllowedDependencies = Readonly<{
  authorize: (
    request: Request,
    requiredScopes: readonly []
  ) => Promise<PublicApiRequestAuthorization>;
}>;

const defaultDependencies: PublicApiMethodNotAllowedDependencies = Object.freeze({
  authorize: (request, requiredScopes) => authorizePublicApiRequest(request, requiredScopes)
});

/**
 * Build an authenticated canonical 405 handler. Authentication intentionally requests zero
 * scopes: a usable key still consumes the PostgreSQL-authoritative rate window before the route
 * reveals its allowed methods, while missing or invalid bearer credentials remain a 401.
 */
export function createPublicApiMethodNotAllowedHandler(
  allowedMethods: readonly PublicApiRouteMethod[],
  dependencies: PublicApiMethodNotAllowedDependencies = defaultDependencies
): PublicApiMethodNotAllowedHandler {
  const allow = normalizeAllowedMethods(allowedMethods).join(", ");

  return async (request) => {
    const authorization = await dependencies.authorize(request, []);
    if (!authorization.ok) {
      return authorization.response;
    }

    return createPublicApiErrorResponse({
      requestId: authorization.requestId,
      code: "METHOD_NOT_ALLOWED",
      headers: {
        ...authorization.responseHeaders,
        Allow: allow
      }
    });
  };
}

/** Build the unauthenticated 405 used only by the public OpenAPI metadata route. */
export function createPublicMetadataMethodNotAllowedHandler(
  allowedMethods: readonly PublicApiRouteMethod[]
): PublicApiMethodNotAllowedHandler {
  const allow = normalizeAllowedMethods(allowedMethods).join(", ");

  return async (request) =>
    createPublicApiErrorResponse({
      requestId: resolvePublicApiRequestId(request.headers),
      code: "METHOD_NOT_ALLOWED",
      headers: { Allow: allow }
    });
}

/** Build the authenticated canonical 404 used by the /api/v1 root and unmatched paths. */
export function createPublicApiNotFoundHandler(
  dependencies: PublicApiMethodNotAllowedDependencies = defaultDependencies
): PublicApiMethodNotAllowedHandler {
  return async (request) => {
    const authorization = await dependencies.authorize(request, []);
    if (!authorization.ok) {
      return authorization.response;
    }
    return createPublicApiErrorResponse({
      requestId: authorization.requestId,
      code: "NOT_FOUND",
      headers: authorization.responseHeaders
    });
  };
}

function normalizeAllowedMethods(
  allowedMethods: readonly PublicApiRouteMethod[]
): readonly PublicApiRouteMethod[] {
  if (allowedMethods.length === 0) {
    throw new TypeError("A public API route must allow at least one method.");
  }
  const allowed = new Set<PublicApiRouteMethod>(allowedMethods);
  if (allowed.size !== allowedMethods.length) {
    throw new TypeError("A public API Allow list must not contain duplicate methods.");
  }
  return Object.freeze(PUBLIC_API_ROUTE_METHODS.filter((method) => allowed.has(method)));
}
