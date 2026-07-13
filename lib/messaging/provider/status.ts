import type { ProviderMessageStatus, ProviderNormalizedStatus } from "./types";

const knownStatuses = new Set<ProviderMessageStatus>([
  "accepted",
  "scheduled",
  "queued",
  "sending",
  "sent",
  "delivered",
  "receiving",
  "received",
  "read",
  "failed",
  "undelivered",
  "canceled"
]);

export function normalizeProviderMessageStatus(
  value: string | null | undefined
): ProviderNormalizedStatus {
  const providerStatus = value?.trim().toLowerCase() || "unknown";
  return Object.freeze({
    providerStatus,
    status: knownStatuses.has(providerStatus as ProviderMessageStatus)
      ? (providerStatus as ProviderMessageStatus)
      : "unknown"
  });
}
