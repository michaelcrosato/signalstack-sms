export const API_SCOPES = [
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
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

const apiScopeSet: ReadonlySet<string> = new Set(API_SCOPES);

export function isApiScope(value: unknown): value is ApiScope {
  return typeof value === "string" && apiScopeSet.has(value);
}

export function normalizeApiScopes(values: readonly unknown[]): ApiScope[] {
  const normalized = new Set<ApiScope>();

  for (const value of values) {
    if (!isApiScope(value)) {
      throw new TypeError("Invalid API scope.");
    }
    normalized.add(value);
  }

  return API_SCOPES.filter((scope) => normalized.has(scope));
}
