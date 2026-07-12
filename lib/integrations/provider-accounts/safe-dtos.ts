import type {
  ProviderMessagingServiceRecord,
  ProviderPhoneNumberRecord
} from "@/lib/messaging/provider/types";

type DateLike = Date | string | null;

export type SafeProviderAccount = Readonly<{
  id: string;
  provider: string;
  externalAccountIdLast4: string;
  status: string;
  isDefault: boolean;
  accountStatus: string | null;
  accountType: string | null;
  verifiedAt: string;
  lastCheckedAt: string;
  revokedAt: string | null;
  activeCredentialVersion: number | null;
  credentialFingerprint: string | null;
  phoneNumberCount: number;
  messagingServiceCount: number;
  createdAt: string;
  updatedAt: string;
}>;

export type SafeProviderPhoneNumber = Readonly<{
  id: string;
  providerAccountId: string | null;
  providerMessagingServiceId: string | null;
  provider: string;
  phoneNumber: string;
  externalNumberIdLast4: string | null;
  label: string | null;
  status: string;
  capabilities: readonly ("sms" | "mms")[];
  isDefault: boolean;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type SafeProviderMessagingService = Readonly<{
  id: string;
  providerAccountId: string;
  provider: string;
  externalServiceIdLast4: string;
  status: string;
  capabilities: readonly ("sms" | "mms")[];
  isDefault: boolean;
  verifiedAt: string;
  lastCheckedAt: string;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type SafeProviderDiscovery = Readonly<{
  credentialVersion: number;
  phoneNumbers: readonly Readonly<{
    candidateId: string;
    externalNumberIdLast4: string;
    phoneNumber: string;
    capabilities: readonly ("sms" | "mms")[];
  }>[];
  messagingServices: readonly Readonly<{
    candidateId: string;
    externalServiceIdLast4: string;
  }>[];
}>;

export function toSafeProviderAccount(input: Readonly<{
  id: string;
  provider: string;
  externalAccountIdLast4: string;
  status: string;
  isDefault: boolean;
  accountStatus: string | null;
  accountType: string | null;
  verifiedAt: DateLike;
  lastCheckedAt: DateLike;
  revokedAt: DateLike;
  createdAt: DateLike;
  updatedAt: DateLike;
  credentialSecrets?: readonly Readonly<{
    version: number;
    fingerprint: string;
    retiredAt: DateLike;
  }>[];
  _count?: Readonly<{ phoneNumbers: number; messagingServices: number }>;
}>): SafeProviderAccount {
  const activeSecret = input.credentialSecrets?.find((secret) => secret.retiredAt === null) ?? null;
  return Object.freeze({
    id: input.id,
    provider: input.provider,
    externalAccountIdLast4: requireLastFour(input.externalAccountIdLast4),
    status: input.status,
    isDefault: input.isDefault,
    accountStatus: input.accountStatus,
    accountType: input.accountType,
    verifiedAt: requireDate(input.verifiedAt),
    lastCheckedAt: requireDate(input.lastCheckedAt),
    revokedAt: optionalDate(input.revokedAt),
    activeCredentialVersion: activeSecret?.version ?? null,
    credentialFingerprint: activeSecret ? requireCredentialFingerprint(activeSecret.fingerprint) : null,
    phoneNumberCount: boundedCount(input._count?.phoneNumbers ?? 0),
    messagingServiceCount: boundedCount(input._count?.messagingServices ?? 0),
    createdAt: requireDate(input.createdAt),
    updatedAt: requireDate(input.updatedAt)
  });
}

export function toSafeProviderPhoneNumber(input: Readonly<{
  id: string;
  providerAccountId: string | null;
  providerMessagingServiceId: string | null;
  provider: string;
  phoneNumber: string;
  externalNumberIdLast4: string | null;
  label: string | null;
  status: string;
  capabilities: unknown;
  isDefault: boolean;
  verifiedAt: DateLike;
  lastCheckedAt: DateLike;
  disabledAt: DateLike;
  createdAt: DateLike;
  updatedAt: DateLike;
}>): SafeProviderPhoneNumber {
  return Object.freeze({
    id: input.id,
    providerAccountId: input.providerAccountId,
    providerMessagingServiceId: input.providerMessagingServiceId,
    provider: input.provider,
    phoneNumber: input.phoneNumber,
    externalNumberIdLast4: input.externalNumberIdLast4
      ? requireLastFour(input.externalNumberIdLast4)
      : null,
    label: input.label,
    status: input.status,
    capabilities: normalizeCapabilities(input.capabilities),
    isDefault: input.isDefault,
    verifiedAt: optionalDate(input.verifiedAt),
    lastCheckedAt: optionalDate(input.lastCheckedAt),
    disabledAt: optionalDate(input.disabledAt),
    createdAt: requireDate(input.createdAt),
    updatedAt: requireDate(input.updatedAt)
  });
}

export function toSafeProviderMessagingService(input: Readonly<{
  id: string;
  providerAccountId: string;
  provider: string;
  externalServiceIdLast4: string;
  status: string;
  capabilities: unknown;
  isDefault: boolean;
  verifiedAt: DateLike;
  lastCheckedAt: DateLike;
  disabledAt: DateLike;
  createdAt: DateLike;
  updatedAt: DateLike;
}>): SafeProviderMessagingService {
  return Object.freeze({
    id: input.id,
    providerAccountId: input.providerAccountId,
    provider: input.provider,
    externalServiceIdLast4: requireLastFour(input.externalServiceIdLast4),
    status: input.status,
    capabilities: normalizeCapabilities(input.capabilities),
    isDefault: input.isDefault,
    verifiedAt: requireDate(input.verifiedAt),
    lastCheckedAt: requireDate(input.lastCheckedAt),
    disabledAt: optionalDate(input.disabledAt),
    createdAt: requireDate(input.createdAt),
    updatedAt: requireDate(input.updatedAt)
  });
}

export function toSafeProviderDiscovery(input: Readonly<{
  credentialVersion: number;
  phoneNumbers: readonly Readonly<{ candidateId: string; record: ProviderPhoneNumberRecord }>[];
  messagingServices: readonly Readonly<{
    candidateId: string;
    record: ProviderMessagingServiceRecord;
  }>[];
}>): SafeProviderDiscovery {
  if (!Number.isSafeInteger(input.credentialVersion) || input.credentialVersion < 1) {
    throw new TypeError("Provider discovery credential version is invalid.");
  }
  if (input.phoneNumbers.length > 100 || input.messagingServices.length > 100) {
    throw new TypeError("Provider discovery result is not bounded.");
  }
  return Object.freeze({
    credentialVersion: input.credentialVersion,
    phoneNumbers: Object.freeze(
      input.phoneNumbers.map(({ candidateId, record: number }) =>
        Object.freeze({
          candidateId: requireCandidateId(candidateId),
          externalNumberIdLast4: lastFour(number.externalNumberId),
          phoneNumber: number.phoneNumber,
          capabilities: capabilitiesFromRecord(number)
        })
      )
    ),
    messagingServices: Object.freeze(
      input.messagingServices.map(({ candidateId, record: service }) =>
        Object.freeze({
          candidateId: requireCandidateId(candidateId),
          externalServiceIdLast4: lastFour(service.externalServiceId)
        })
      )
    )
  });
}

function requireCandidateId(value: string): string {
  if (!/^pvcandidate_v1_[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new TypeError("Provider discovery candidate is invalid.");
  }
  return value;
}

function requireCredentialFingerprint(value: string): string {
  if (!/^pvfp_[A-Za-z0-9_-]{22}$/.test(value)) {
    throw new TypeError("Provider credential metadata is invalid.");
  }
  return value;
}

function capabilitiesFromRecord(
  input: Pick<ProviderPhoneNumberRecord, "capabilities">
): readonly ("sms" | "mms")[] {
  return Object.freeze([
    ...(input.capabilities.sms ? (["sms"] as const) : []),
    ...(input.capabilities.mms ? (["mms"] as const) : [])
  ]);
}

function normalizeCapabilities(value: unknown): readonly ("sms" | "mms")[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Provider capabilities are invalid.");
  }
  const values = value.filter((entry): entry is "sms" | "mms" => entry === "sms" || entry === "mms");
  if (values.length !== value.length || values.length === 0 || new Set(values).size !== values.length) {
    throw new TypeError("Provider capabilities are invalid.");
  }
  return Object.freeze([...values].sort());
}

function requireLastFour(value: string): string {
  if (!/^[A-Za-z0-9]{4}$/.test(value)) {
    throw new TypeError("Provider identifier metadata is invalid.");
  }
  return value;
}

function lastFour(value: string): string {
  if (typeof value !== "string" || value.length < 4 || value.length > 191) {
    throw new TypeError("Provider identifier metadata is invalid.");
  }
  return requireLastFour(value.slice(-4));
}

function boundedCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
    throw new TypeError("Provider account count is invalid.");
  }
  return value;
}

function requireDate(value: DateLike): string {
  const normalized = optionalDate(value);
  if (!normalized) {
    throw new TypeError("Provider timestamp is invalid.");
  }
  return normalized;
}

function optionalDate(value: DateLike): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError("Provider timestamp is invalid.");
  }
  return date.toISOString();
}
