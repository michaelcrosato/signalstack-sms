import { randomUUID } from "node:crypto";
import {
  ProviderAccountStatus,
  ProviderMessagingServiceStatus,
  ProviderPhoneNumberStatus,
  type Prisma
} from "@prisma/client";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import {
  createProviderCredentialEnvelope,
  createProviderDiscoveryCandidateId,
  decryptProviderCredentialEnvelope,
  hashProviderLookupIdentifier,
  parseProviderCredentialPlaintext,
  readProviderCredentialMasterKey,
  type ProviderCredentialEnvelope,
  type ProviderCredentialEnvelopeBinding
} from "@/lib/integrations/provider-accounts/credential-encryption";
import {
  toSafeProviderAccount,
  toSafeProviderDiscovery,
  toSafeProviderMessagingService,
  toSafeProviderPhoneNumber,
  type SafeProviderAccount,
  type SafeProviderDiscovery,
  type SafeProviderMessagingService,
  type SafeProviderPhoneNumber
} from "@/lib/integrations/provider-accounts/safe-dtos";
import { providerFactory, type ProviderFactory } from "@/lib/messaging/provider/factory";
import type {
  ProviderAdapter,
  ProviderMessagingServiceRecord,
  ProviderPhoneNumberRecord
} from "@/lib/messaging/provider/types";
import {
  twilioAccountSidSchema,
  twilioAuthTokenSchema
} from "@/lib/validation/provider";

const PROVIDER = "twilio" as const;
const PROVIDER_SECRET_KEY_VERSION = 1;
const MAX_IMPORT_ITEMS = 100;

export type ProviderAccountActor = Readonly<{ userId: string }>;

export type ProviderAccountServiceDependencies = Readonly<{
  factory?: ProviderFactory;
  environment?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
  randomId?: () => string;
  keyVersion?: number;
}>;

export class ProviderAccountServiceError extends Error {
  readonly code:
    | "INVALID_PROVIDER_ACCOUNT"
    | "PROVIDER_ACCOUNT_NOT_FOUND"
    | "PROVIDER_ACCOUNT_CONFLICT"
    | "PROVIDER_VERIFICATION_FAILED"
    | "PROVIDER_CREDENTIAL_UNAVAILABLE"
    | "PROVIDER_DISCOVERY_FAILED"
    | "PROVIDER_DISCOVERY_STALE"
    | "PROVIDER_IMPORT_INVALID"
    | "PROVIDER_OWNERSHIP_CONFLICT"
    | "PROVIDER_LIFECYCLE_CONFLICT"
    | "PROVIDER_RESOURCE_NOT_FOUND";

  constructor(code: ProviderAccountServiceError["code"], message: string) {
    super(message);
    this.name = "ProviderAccountServiceError";
    this.code = code;
  }
}

const safeAccountInclude = {
  credentialSecrets: {
    where: { retiredAt: null },
    select: { version: true, fingerprint: true, retiredAt: true },
    take: 1
  },
  _count: { select: { phoneNumbers: true, messagingServices: true } }
} as const;

export async function listProviderAccounts(orgId: string): Promise<readonly SafeProviderAccount[]> {
  const accounts = await withTenantTransaction({ orgId }, (tx) =>
    tx.providerAccount.findMany({
      where: { orgId },
      include: safeAccountInclude,
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
    })
  );
  return Object.freeze(accounts.map(toSafeProviderAccount));
}

export async function getProviderAccount(
  orgId: string,
  providerAccountId: string
): Promise<SafeProviderAccount> {
  const account = await withTenantTransaction({ orgId }, (tx) =>
    tx.providerAccount.findFirst({
      where: { orgId, id: providerAccountId },
      include: safeAccountInclude
    })
  );
  if (!account) throw serviceError("PROVIDER_ACCOUNT_NOT_FOUND", "Provider account not found.");
  return toSafeProviderAccount(account);
}

export async function connectProviderAccount(
  input: Readonly<{
    orgId: string;
    externalAccountId: string;
    authToken: string;
    isDefault?: boolean;
    actor: ProviderAccountActor;
  }>,
  dependencies: ProviderAccountServiceDependencies = {}
): Promise<SafeProviderAccount> {
  const credentials = parseSubmittedCredentials(input.externalAccountId, input.authToken);
  const masterKey = readProviderAccountMasterKey(dependencies);
  const adapter = createTwilioAdapter(credentials, dependencies);
  const verified = await verifyExactActiveAccount(adapter, credentials.externalAccountId);
  const now = serviceNow(dependencies);
  const providerAccountId = serviceId(dependencies);
  const secretId = serviceId(dependencies);
  const accountHash = hashProviderLookupIdentifier({
    masterKey,
    provider: PROVIDER,
    kind: "account",
    value: credentials.externalAccountId
  });
  const binding = credentialBinding({
    orgId: input.orgId,
    externalAccountId: credentials.externalAccountId,
    externalAccountIdHash: accountHash,
    providerAccountId,
    secretId,
    credentialVersion: 1
  });
  const envelope = createProviderCredentialEnvelope({
    secret: input.authToken,
    masterKey,
    keyVersion: dependencies.keyVersion ?? PROVIDER_SECRET_KEY_VERSION,
    binding
  });

  try {
    const created = await withTenantTransaction(
      { orgId: input.orgId, userId: input.actor.userId },
      async (tx) => {
        if (input.isDefault !== false) {
          await tx.providerAccount.updateMany({
            where: { orgId: input.orgId, provider: PROVIDER, isDefault: true },
            data: { isDefault: false }
          });
        }
        const account = await tx.providerAccount.create({
          data: {
            id: providerAccountId,
            orgId: input.orgId,
            provider: PROVIDER,
            externalAccountId: credentials.externalAccountId,
            externalAccountIdHash: accountHash,
            externalAccountIdLast4: lastFour(credentials.externalAccountId),
            status: ProviderAccountStatus.VERIFIED,
            isDefault: input.isDefault !== false,
            accountStatus: verified.status,
            accountType: null,
            verifiedAt: now,
            lastCheckedAt: now
          }
        });
        await tx.providerCredentialSecret.create({
          data: secretData({
            id: secretId,
            orgId: input.orgId,
            providerAccountId,
            version: 1,
            envelope,
            activeFrom: now
          })
        });
        await auditProviderAction(tx, {
          orgId: input.orgId,
          actorUserId: input.actor.userId,
          action: "provider_account.connected",
          subjectType: "provider_account",
          subjectId: account.id,
          metadata: {
            provider: PROVIDER,
            accountLast4: account.externalAccountIdLast4,
            accountStatus: verified.status,
            credentialVersion: 1,
            credentialFingerprint: envelope.fingerprint
          }
        });
        return tx.providerAccount.findUniqueOrThrow({
          where: { id: account.id },
          include: safeAccountInclude
        });
      },
      { isolationLevel: "Serializable" }
    );
    return toSafeProviderAccount(created);
  } catch (error) {
    if (isSerializationConflict(error)) {
      throw serviceError(
        "PROVIDER_ACCOUNT_CONFLICT",
        "Provider account ownership conflicts with an existing account."
      );
    }
    if (isUniqueConstraintConflict(error)) {
      throw serviceError(
        "PROVIDER_ACCOUNT_CONFLICT",
        "Provider account ownership conflicts with an existing account."
      );
    }
    throw error;
  }
}

export async function rotateProviderAccountCredential(
  input: Readonly<{
    orgId: string;
    providerAccountId: string;
    authToken: string;
    actor: ProviderAccountActor;
  }>,
  dependencies: ProviderAccountServiceDependencies = {}
): Promise<SafeProviderAccount> {
  const loaded = await loadActiveProviderCredential(input.orgId, input.providerAccountId, dependencies);
  const token = twilioAuthTokenSchema.safeParse(input.authToken);
  if (!token.success) throw serviceError("INVALID_PROVIDER_ACCOUNT", "Provider credential is invalid.");
  const adapter = createTwilioAdapter(
    { externalAccountId: loaded.account.externalAccountId, authToken: token.data },
    dependencies
  );
  const verified = await verifyExactActiveAccount(adapter, loaded.account.externalAccountId);
  const masterKey = readProviderAccountMasterKey(dependencies);
  const now = serviceNow(dependencies);

  const rotated = await withTenantTransaction(
    { orgId: input.orgId, userId: input.actor.userId },
    async (tx) => {
      await lockProviderAccount(tx, input.orgId, input.providerAccountId);
      const current = await findActiveSecret(tx, input.orgId, input.providerAccountId);
      if (
        !current ||
        current.id !== loaded.secret.id ||
        current.version !== loaded.secret.version
      ) {
        throw serviceError("PROVIDER_DISCOVERY_STALE", "Provider credential generation changed.");
      }
      const account = await tx.providerAccount.findFirst({
        where: {
          orgId: input.orgId,
          id: input.providerAccountId,
          status: { not: ProviderAccountStatus.REVOKED },
          revokedAt: null
        }
      });
      if (!account) throw serviceError("PROVIDER_ACCOUNT_NOT_FOUND", "Provider account not found.");
      const nextVersion = current.version + 1;
      const secretId = serviceId(dependencies);
      const envelope = createProviderCredentialEnvelope({
        secret: token.data,
        masterKey,
        keyVersion: dependencies.keyVersion ?? PROVIDER_SECRET_KEY_VERSION,
        binding: credentialBinding({
          orgId: input.orgId,
          externalAccountId: account.externalAccountId,
          externalAccountIdHash: account.externalAccountIdHash,
          providerAccountId: account.id,
          secretId,
          credentialVersion: nextVersion
        })
      });
      await tx.providerCredentialSecret.update({
        where: { id: current.id },
        data: { retiredAt: now }
      });
      await tx.providerCredentialSecret.create({
        data: secretData({
          id: secretId,
          orgId: input.orgId,
          providerAccountId: account.id,
          version: nextVersion,
          envelope,
          activeFrom: now
        })
      });
      await tx.providerAccount.update({
        where: { id: account.id },
        data: {
          status: ProviderAccountStatus.VERIFIED,
          accountStatus: verified.status,
          lastCheckedAt: now
        }
      });
      await auditProviderAction(tx, {
        orgId: input.orgId,
        actorUserId: input.actor.userId,
        action: "provider_credential.rotated",
        subjectType: "provider_account",
        subjectId: account.id,
        metadata: {
          provider: account.provider,
          accountLast4: account.externalAccountIdLast4,
          previousCredentialVersion: current.version,
          credentialVersion: nextVersion,
          credentialFingerprint: envelope.fingerprint
        }
      });
      return tx.providerAccount.findUniqueOrThrow({
        where: { id: account.id },
        include: safeAccountInclude
      });
    },
    { isolationLevel: "Serializable" }
  ).catch((error: unknown) => {
    if (isSerializationConflict(error) || isUniqueConstraintConflict(error)) {
      throw serviceError("PROVIDER_DISCOVERY_STALE", "Provider credential generation changed.");
    }
    throw error;
  });
  return toSafeProviderAccount(rotated);
}

export async function verifyProviderAccount(
  input: Readonly<{ orgId: string; providerAccountId: string; actor: ProviderAccountActor }>,
  dependencies: ProviderAccountServiceDependencies = {}
): Promise<SafeProviderAccount> {
  const loaded = await loadActiveProviderCredential(input.orgId, input.providerAccountId, dependencies);
  const adapter = createAdapterFromLoaded(loaded, dependencies);
  const verified = await verifyExactActiveAccount(adapter, loaded.account.externalAccountId);
  return recordAccountVerification(input, loaded, verified.status, dependencies);
}

export async function checkProviderAccountHealth(
  input: Readonly<{ orgId: string; providerAccountId: string; actor: ProviderAccountActor }>,
  dependencies: ProviderAccountServiceDependencies = {}
): Promise<Readonly<{ account: SafeProviderAccount; healthy: boolean; safeCode: string }>> {
  const loaded = await loadActiveProviderCredential(input.orgId, input.providerAccountId, dependencies);
  const adapter = createAdapterFromLoaded(loaded, dependencies);
  const health = await adapter.getHealth();
  const now = serviceNow(dependencies);
  const account = await withTenantTransaction(
    { orgId: input.orgId, userId: input.actor.userId },
    async (tx) => {
      await lockProviderAccount(tx, input.orgId, input.providerAccountId);
      await assertCredentialGeneration(tx, loaded, true);
      await tx.providerAccount.update({
        where: { id: input.providerAccountId },
        data: {
          status: health.healthy ? ProviderAccountStatus.VERIFIED : ProviderAccountStatus.DEGRADED,
          lastCheckedAt: now
        }
      });
      await auditProviderAction(tx, {
        orgId: input.orgId,
        actorUserId: input.actor.userId,
        action: "provider_account.health_checked",
        subjectType: "provider_account",
        subjectId: input.providerAccountId,
        metadata: { provider: PROVIDER, healthy: health.healthy, safeCode: health.safeCode }
      });
      return tx.providerAccount.findUniqueOrThrow({
        where: { id: input.providerAccountId },
        include: safeAccountInclude
      });
    },
    { isolationLevel: "Serializable" }
  ).catch(mapProviderLifecycleConflict);
  return Object.freeze({
    account: toSafeProviderAccount(account),
    healthy: health.healthy,
    safeCode: health.safeCode
  });
}

export async function discoverProviderResources(
  input: Readonly<{
    orgId: string;
    providerAccountId: string;
    actor: ProviderAccountActor;
  }>,
  dependencies: ProviderAccountServiceDependencies = {}
): Promise<SafeProviderDiscovery> {
  const loaded = await loadActiveProviderCredential(input.orgId, input.providerAccountId, dependencies);
  assertLoadedAccountVerified(loaded);
  const adapter = createAdapterFromLoaded(loaded, dependencies);
  let phoneNumbers: readonly ProviderPhoneNumberRecord[];
  let messagingServices: readonly ProviderMessagingServiceRecord[];
  try {
    [phoneNumbers, messagingServices] = await Promise.all([
      adapter.discoverPhoneNumbers(),
      adapter.discoverMessagingServices()
    ]);
  } catch {
    throw serviceError("PROVIDER_DISCOVERY_FAILED", "Provider discovery failed.");
  }
  assertDiscoveredOwnership(loaded.account.externalAccountId, phoneNumbers, messagingServices);
  const masterKey = readProviderAccountMasterKey(dependencies);
  const phoneNumberCandidates = phoneNumbers.map((record) => ({
    candidateId: createProviderDiscoveryCandidateId({
      masterKey,
      orgId: input.orgId,
      provider: PROVIDER,
      providerAccountId: loaded.account.id,
      credentialVersion: loaded.secret.version,
      kind: "phone_number" as const,
      value: record.phoneNumber
    }),
    record
  }));
  const messagingServiceCandidates = messagingServices.map((record) => ({
    candidateId: createProviderDiscoveryCandidateId({
      masterKey,
      orgId: input.orgId,
      provider: PROVIDER,
      providerAccountId: loaded.account.id,
      credentialVersion: loaded.secret.version,
      kind: "messaging_service" as const,
      value: record.externalServiceId
    }),
    record
  }));
  assertUniqueCandidateIds(phoneNumberCandidates, messagingServiceCandidates);
  await withTenantTransaction(
    { orgId: input.orgId, userId: input.actor.userId },
    async (tx) => {
      await assertCredentialGeneration(tx, loaded);
      await auditProviderAction(tx, {
        orgId: input.orgId,
        actorUserId: input.actor.userId,
        action: "provider_account.resources_discovered",
        subjectType: "provider_account",
        subjectId: loaded.account.id,
        metadata: {
          provider: PROVIDER,
          accountLast4: loaded.account.externalAccountIdLast4,
          credentialVersion: loaded.secret.version,
          phoneNumberCount: phoneNumberCandidates.length,
          messagingServiceCount: messagingServiceCandidates.length
        }
      });
    }
  );
  return toSafeProviderDiscovery({
    credentialVersion: loaded.secret.version,
    phoneNumbers: phoneNumberCandidates,
    messagingServices: messagingServiceCandidates
  });
}

export async function importProviderResources(
  input: Readonly<{
    orgId: string;
    providerAccountId: string;
    credentialVersion: number;
    phoneNumberCandidateIds: readonly string[];
    messagingServiceCandidateIds: readonly string[];
    defaultPhoneNumberCandidateId?: string;
    defaultMessagingServiceCandidateId?: string;
    actor: ProviderAccountActor;
  }>,
  dependencies: ProviderAccountServiceDependencies = {}
): Promise<Readonly<{
  phoneNumbers: readonly SafeProviderPhoneNumber[];
  messagingServices: readonly SafeProviderMessagingService[];
}>> {
  assertImportInput(input);
  const loaded = await loadActiveProviderCredential(input.orgId, input.providerAccountId, dependencies);
  assertLoadedAccountVerified(loaded);
  if (loaded.secret.version !== input.credentialVersion) {
    throw serviceError("PROVIDER_DISCOVERY_STALE", "Provider discovery generation is stale.");
  }
  const adapter = createAdapterFromLoaded(loaded, dependencies);
  let discoveredNumbers: readonly ProviderPhoneNumberRecord[];
  let discoveredServices: readonly ProviderMessagingServiceRecord[];
  try {
    [discoveredNumbers, discoveredServices] = await Promise.all([
      adapter.discoverPhoneNumbers(),
      adapter.discoverMessagingServices()
    ]);
  } catch {
    throw serviceError("PROVIDER_DISCOVERY_FAILED", "Provider discovery failed.");
  }
  assertDiscoveredOwnership(
    loaded.account.externalAccountId,
    discoveredNumbers,
    discoveredServices
  );
  const masterKey = readProviderAccountMasterKey(dependencies);
  const numberCandidates = new Map(
    discoveredNumbers.map((record) => [
      createProviderDiscoveryCandidateId({
        masterKey,
        orgId: input.orgId,
        provider: PROVIDER,
        providerAccountId: loaded.account.id,
        credentialVersion: loaded.secret.version,
        kind: "phone_number",
        value: record.phoneNumber
      }),
      record
    ])
  );
  const serviceCandidates = new Map(
    discoveredServices.map((record) => [
      createProviderDiscoveryCandidateId({
        masterKey,
        orgId: input.orgId,
        provider: PROVIDER,
        providerAccountId: loaded.account.id,
        credentialVersion: loaded.secret.version,
        kind: "messaging_service",
        value: record.externalServiceId
      }),
      record
    ])
  );
  if (
    numberCandidates.size !== discoveredNumbers.length ||
    serviceCandidates.size !== discoveredServices.length
  ) {
    throw serviceError("PROVIDER_DISCOVERY_FAILED", "Provider discovery failed.");
  }
  const selectedNumbers = selectCandidates(input.phoneNumberCandidateIds, numberCandidates);
  const selectedServices = selectCandidates(
    input.messagingServiceCandidateIds,
    serviceCandidates
  );
  if (
    input.defaultPhoneNumberCandidateId &&
    !input.phoneNumberCandidateIds.includes(input.defaultPhoneNumberCandidateId)
  ) {
    throw serviceError("PROVIDER_IMPORT_INVALID", "Default number was not selected for import.");
  }
  if (
    input.defaultMessagingServiceCandidateId &&
    !input.messagingServiceCandidateIds.includes(input.defaultMessagingServiceCandidateId)
  ) {
    throw serviceError("PROVIDER_IMPORT_INVALID", "Default service was not selected for import.");
  }
  const now = serviceNow(dependencies);

  try {
    return await withTenantTransaction(
      { orgId: input.orgId, userId: input.actor.userId },
      async (tx) => {
        await lockProviderAccount(tx, input.orgId, input.providerAccountId);
        await assertCredentialGeneration(tx, loaded);
        const account = await tx.providerAccount.findFirst({
          where: {
            id: input.providerAccountId,
            orgId: input.orgId,
            status: ProviderAccountStatus.VERIFIED,
            revokedAt: null
          }
        });
        if (!account) {
          throw serviceError("PROVIDER_ACCOUNT_NOT_FOUND", "Provider account not found.");
        }
        if (input.defaultMessagingServiceCandidateId) {
          await tx.providerMessagingService.updateMany({
            where: { orgId: input.orgId, providerAccountId: account.id, isDefault: true },
            data: { isDefault: false }
          });
        }
        const services = [];
        for (const [candidateId, record] of selectedServices) {
          const externalServiceIdHash = hashProviderLookupIdentifier({
            masterKey,
            provider: PROVIDER,
            kind: "messaging_service",
            value: record.externalServiceId
          });
          const existing = await tx.providerMessagingService.findFirst({
            where: {
              orgId: input.orgId,
              provider: PROVIDER,
              externalServiceId: record.externalServiceId
            }
          });
          if (
            existing &&
            (
              existing.providerAccountId !== account.id ||
              existing.externalServiceIdHash !== externalServiceIdHash
            )
          ) {
            throw serviceError(
              "PROVIDER_OWNERSHIP_CONFLICT",
              "Provider resource ownership conflicts with an existing account."
            );
          }
          const service = existing
            ? await tx.providerMessagingService.update({
                where: { id: existing.id },
                data: {
                  providerAccountId: account.id,
                  status: ProviderMessagingServiceStatus.VERIFIED,
                  isDefault: input.defaultMessagingServiceCandidateId === candidateId,
                  capabilities: ["sms", "mms"],
                  lastCheckedAt: now,
                  disabledAt: null
                }
              })
            : await tx.providerMessagingService.create({
                data: {
                  orgId: input.orgId,
                  providerAccountId: account.id,
                  provider: PROVIDER,
                  externalServiceId: record.externalServiceId,
                  externalServiceIdHash,
                  externalServiceIdLast4: lastFour(record.externalServiceId),
                  status: ProviderMessagingServiceStatus.VERIFIED,
                  isDefault: input.defaultMessagingServiceCandidateId === candidateId,
                  capabilities: ["sms", "mms"],
                  verifiedAt: now,
                  lastCheckedAt: now
                }
              });
          services.push(service);
          await auditProviderAction(tx, {
            orgId: input.orgId,
            actorUserId: input.actor.userId,
            action: "provider_messaging_service.imported",
            subjectType: "provider_messaging_service",
            subjectId: service.id,
            metadata: {
              provider: PROVIDER,
              accountLast4: account.externalAccountIdLast4,
              serviceLast4: service.externalServiceIdLast4,
              isDefault: service.isDefault
            }
          });
        }
        if (input.defaultPhoneNumberCandidateId) {
          await tx.providerPhoneNumber.updateMany({
            where: { orgId: input.orgId, isDefault: true },
            data: { isDefault: false }
          });
        }
        const numbers = [];
        for (const [candidateId, record] of selectedNumbers) {
          const phoneNumberHash = hashProviderLookupIdentifier({
            masterKey,
            provider: PROVIDER,
            kind: "phone_number",
            value: record.phoneNumber
          });
          const existing = await tx.providerPhoneNumber.findFirst({
            where: {
              orgId: input.orgId,
              OR: [
                { provider: PROVIDER, externalNumberId: record.externalNumberId },
                { phoneNumber: record.phoneNumber }
              ]
            }
          });
          if (existing && !providerNumberMayBeVerifiedForAccount(existing, account.id, record)) {
            throw serviceError(
              "PROVIDER_OWNERSHIP_CONFLICT",
              "Provider resource ownership conflicts with an existing account."
            );
          }
          const updateData = {
            providerAccountId: account.id,
            providerMessagingServiceId: null,
            provider: PROVIDER,
            phoneNumber: record.phoneNumber,
            phoneNumberHash,
            externalNumberId: record.externalNumberId,
            externalNumberIdLast4: lastFour(record.externalNumberId),
            status: ProviderPhoneNumberStatus.VERIFIED,
            capabilities: capabilitiesFromNumber(record),
            isDefault: input.defaultPhoneNumberCandidateId === candidateId,
            lastCheckedAt: now,
            disabledAt: null
          } as const;
          const number = existing
            ? await tx.providerPhoneNumber.update({
                where: { id: existing.id },
                data: { ...updateData, verifiedAt: existing.verifiedAt ?? now }
              })
            : await tx.providerPhoneNumber.create({
                data: { orgId: input.orgId, label: null, ...updateData, verifiedAt: now }
              });
          numbers.push(number);
          await auditProviderAction(tx, {
            orgId: input.orgId,
            actorUserId: input.actor.userId,
            action: "provider_phone_number.imported",
            subjectType: "provider_phone_number",
            subjectId: number.id,
            metadata: {
              provider: PROVIDER,
              accountLast4: account.externalAccountIdLast4,
              numberLast4: lastFour(number.phoneNumber),
              externalNumberLast4: number.externalNumberIdLast4,
              capabilities: updateData.capabilities,
              isDefault: number.isDefault
            }
          });
        }
        return Object.freeze({
          phoneNumbers: Object.freeze(numbers.map(toSafeProviderPhoneNumber)),
          messagingServices: Object.freeze(services.map(toSafeProviderMessagingService))
        });
      },
      { isolationLevel: "Serializable" }
    );
  } catch (error) {
    if (isSerializationConflict(error)) {
      throw serviceError("PROVIDER_DISCOVERY_STALE", "Provider discovery generation is stale.");
    }
    if (isUniqueConstraintConflict(error)) {
      throw serviceError(
        "PROVIDER_OWNERSHIP_CONFLICT",
        "Provider resource ownership conflicts with an existing organization."
      );
    }
    throw error;
  }
}

export async function revokeProviderAccount(
  input: Readonly<{ orgId: string; providerAccountId: string; actor: ProviderAccountActor }>,
  dependencies: ProviderAccountServiceDependencies = {}
): Promise<SafeProviderAccount> {
  const now = serviceNow(dependencies);
  const account = await withTenantTransaction(
    { orgId: input.orgId, userId: input.actor.userId },
    async (tx) => {
      await lockProviderAccount(tx, input.orgId, input.providerAccountId);
      const current = await tx.providerAccount.findFirst({
        where: { orgId: input.orgId, id: input.providerAccountId }
      });
      if (!current) throw serviceError("PROVIDER_ACCOUNT_NOT_FOUND", "Provider account not found.");
      if (current.revokedAt === null) {
        await tx.providerCredentialSecret.updateMany({
          where: { orgId: input.orgId, providerAccountId: current.id, retiredAt: null },
          data: { retiredAt: now }
        });
        await tx.providerPhoneNumber.updateMany({
          where: { orgId: input.orgId, providerAccountId: current.id },
          data: {
            status: ProviderPhoneNumberStatus.DISABLED,
            isDefault: false,
            disabledAt: now
          }
        });
        await tx.providerMessagingService.updateMany({
          where: { orgId: input.orgId, providerAccountId: current.id },
          data: {
            status: ProviderMessagingServiceStatus.DISABLED,
            isDefault: false,
            disabledAt: now
          }
        });
        await tx.providerAccount.update({
          where: { id: current.id },
          data: {
            status: ProviderAccountStatus.REVOKED,
            isDefault: false,
            revokedAt: now,
            lastCheckedAt: now
          }
        });
        await auditProviderAction(tx, {
          orgId: input.orgId,
          actorUserId: input.actor.userId,
          action: "provider_account.revoked",
          subjectType: "provider_account",
          subjectId: current.id,
          metadata: {
            provider: current.provider,
            accountLast4: current.externalAccountIdLast4
          }
        });
      }
      return tx.providerAccount.findUniqueOrThrow({
        where: { id: current.id },
        include: safeAccountInclude
      });
    },
    { isolationLevel: "Serializable" }
  );
  return toSafeProviderAccount(account);
}

export async function setDefaultProviderAccount(
  input: Readonly<{ orgId: string; providerAccountId: string; actor: ProviderAccountActor }>
): Promise<SafeProviderAccount> {
  const account = await withTenantTransaction(
    { orgId: input.orgId, userId: input.actor.userId },
    async (tx) => {
      await lockProviderAccount(tx, input.orgId, input.providerAccountId);
      const current = await tx.providerAccount.findFirst({
        where: {
          orgId: input.orgId,
          id: input.providerAccountId,
          status: ProviderAccountStatus.VERIFIED,
          revokedAt: null
        }
      });
      if (!current) throw serviceError("PROVIDER_ACCOUNT_NOT_FOUND", "Provider account not found.");
      await tx.providerAccount.updateMany({
        where: { orgId: input.orgId, provider: current.provider, isDefault: true },
        data: { isDefault: false }
      });
      await tx.providerAccount.update({
        where: { id: current.id },
        data: { isDefault: true }
      });
      await auditProviderAction(tx, {
        orgId: input.orgId,
        actorUserId: input.actor.userId,
        action: "provider_account.defaulted",
        subjectType: "provider_account",
        subjectId: current.id,
        metadata: {
          provider: current.provider,
          accountLast4: current.externalAccountIdLast4
        }
      });
      return tx.providerAccount.findUniqueOrThrow({
        where: { id: current.id },
        include: safeAccountInclude
      });
    },
    { isolationLevel: "Serializable" }
  ).catch(mapProviderLifecycleConflict);
  return toSafeProviderAccount(account);
}

export async function listOwnedProviderPhoneNumbers(
  orgId: string,
  providerAccountId?: string
): Promise<readonly SafeProviderPhoneNumber[]> {
  const numbers = await withTenantTransaction({ orgId }, (tx) =>
    tx.providerPhoneNumber.findMany({
      where: {
        orgId,
        providerAccountId: providerAccountId ?? { not: null }
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
    })
  );
  return Object.freeze(numbers.map(toSafeProviderPhoneNumber));
}

export async function listProviderMessagingServices(
  orgId: string,
  providerAccountId?: string
): Promise<readonly SafeProviderMessagingService[]> {
  const services = await withTenantTransaction({ orgId }, (tx) =>
    tx.providerMessagingService.findMany({
      where: { orgId, ...(providerAccountId ? { providerAccountId } : {}) },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
    })
  );
  return Object.freeze(services.map(toSafeProviderMessagingService));
}

export async function updateProviderPhoneNumberLifecycle(
  input: Readonly<{
    orgId: string;
    phoneNumberId: string;
    makeDefault?: boolean;
    disable?: boolean;
    actor: ProviderAccountActor;
  }>,
  dependencies: ProviderAccountServiceDependencies = {}
): Promise<SafeProviderPhoneNumber> {
  if (input.makeDefault !== true && input.disable !== true) {
    throw serviceError("PROVIDER_IMPORT_INVALID", "Provider number update is empty.");
  }
  if (input.makeDefault && input.disable) {
    throw serviceError("PROVIDER_IMPORT_INVALID", "A disabled provider number cannot be default.");
  }
  const now = serviceNow(dependencies);
  const number = await withTenantTransaction(
    { orgId: input.orgId, userId: input.actor.userId },
    async (tx) => {
      await lockProviderPhoneNumber(tx, input.orgId, input.phoneNumberId);
      const current = await tx.providerPhoneNumber.findFirst({
        where: { orgId: input.orgId, id: input.phoneNumberId }
      });
      if (!current) throw serviceError("PROVIDER_RESOURCE_NOT_FOUND", "Provider number not found.");
      if (input.makeDefault) {
        if (
          current.status !== ProviderPhoneNumberStatus.VERIFIED ||
          !current.providerAccountId ||
          current.disabledAt
        ) {
          throw serviceError("PROVIDER_IMPORT_INVALID", "Only a verified active number can be default.");
        }
        const account = await tx.providerAccount.findFirst({
          where: {
            orgId: input.orgId,
            id: current.providerAccountId,
            status: ProviderAccountStatus.VERIFIED,
            revokedAt: null
          }
        });
        if (!account) throw serviceError("PROVIDER_IMPORT_INVALID", "Provider account is not ready.");
        await tx.providerPhoneNumber.updateMany({
          where: { orgId: input.orgId, isDefault: true },
          data: { isDefault: false }
        });
      }
      const updated = await tx.providerPhoneNumber.update({
        where: { id: current.id },
        data: input.disable
          ? {
              status: ProviderPhoneNumberStatus.DISABLED,
              isDefault: false,
              disabledAt: now
            }
          : { isDefault: true }
      });
      await auditProviderAction(tx, {
        orgId: input.orgId,
        actorUserId: input.actor.userId,
        action: input.disable
          ? "provider_phone_number.disabled"
          : "provider_phone_number.defaulted",
        subjectType: "provider_phone_number",
        subjectId: updated.id,
        metadata: {
          provider: updated.provider,
          numberLast4: lastFour(updated.phoneNumber),
          status: updated.status,
          isDefault: updated.isDefault
        }
      });
      return updated;
    },
    { isolationLevel: "Serializable" }
  ).catch(mapProviderLifecycleConflict);
  return toSafeProviderPhoneNumber(number);
}

export async function updateProviderMessagingServiceLifecycle(
  input: Readonly<{
    orgId: string;
    providerAccountId: string;
    messagingServiceId: string;
    makeDefault?: boolean;
    disable?: boolean;
    actor: ProviderAccountActor;
  }>,
  dependencies: ProviderAccountServiceDependencies = {}
): Promise<SafeProviderMessagingService> {
  if (input.makeDefault !== true && input.disable !== true) {
    throw serviceError("PROVIDER_IMPORT_INVALID", "Provider service update is empty.");
  }
  if (input.makeDefault && input.disable) {
    throw serviceError("PROVIDER_IMPORT_INVALID", "A disabled provider service cannot be default.");
  }
  const now = serviceNow(dependencies);
  const service = await withTenantTransaction(
    { orgId: input.orgId, userId: input.actor.userId },
    async (tx) => {
      await lockProviderMessagingService(tx, input.orgId, input.messagingServiceId);
      const current = await tx.providerMessagingService.findFirst({
        where: {
          orgId: input.orgId,
          id: input.messagingServiceId,
          providerAccountId: input.providerAccountId
        }
      });
      if (!current) throw serviceError("PROVIDER_RESOURCE_NOT_FOUND", "Provider service not found.");
      if (input.makeDefault) {
        if (
          current.status !== ProviderMessagingServiceStatus.VERIFIED ||
          current.disabledAt
        ) {
          throw serviceError("PROVIDER_IMPORT_INVALID", "Only a verified active service can be default.");
        }
        const account = await tx.providerAccount.findFirst({
          where: {
            orgId: input.orgId,
            id: current.providerAccountId,
            status: ProviderAccountStatus.VERIFIED,
            revokedAt: null
          }
        });
        if (!account) throw serviceError("PROVIDER_IMPORT_INVALID", "Provider account is not ready.");
        await tx.providerMessagingService.updateMany({
          where: {
            orgId: input.orgId,
            providerAccountId: current.providerAccountId,
            isDefault: true
          },
          data: { isDefault: false }
        });
      }
      const updated = await tx.providerMessagingService.update({
        where: { id: current.id },
        data: input.disable
          ? {
              status: ProviderMessagingServiceStatus.DISABLED,
              isDefault: false,
              disabledAt: now
            }
          : { isDefault: true }
      });
      await auditProviderAction(tx, {
        orgId: input.orgId,
        actorUserId: input.actor.userId,
        action: input.disable
          ? "provider_messaging_service.disabled"
          : "provider_messaging_service.defaulted",
        subjectType: "provider_messaging_service",
        subjectId: updated.id,
        metadata: {
          provider: updated.provider,
          serviceLast4: updated.externalServiceIdLast4,
          status: updated.status,
          isDefault: updated.isDefault
        }
      });
      return updated;
    },
    { isolationLevel: "Serializable" }
  ).catch(mapProviderLifecycleConflict);
  return toSafeProviderMessagingService(service);
}

type LoadedProviderCredential = Readonly<{
  account: Readonly<{
    id: string;
    orgId: string;
    provider: string;
    externalAccountId: string;
    externalAccountIdHash: string;
    externalAccountIdLast4: string;
    status: ProviderAccountStatus;
    revokedAt: Date | null;
  }>;
  secret: Readonly<{
    id: string;
    orgId: string;
    providerAccountId: string;
    version: number;
    envelopeVersion: number;
    algorithm: string;
    keyVersion: number;
    iv: string;
    ciphertext: string;
    authTag: string;
    fingerprint: string;
    retiredAt: Date | null;
  }>;
  token: ReturnType<typeof parseProviderCredentialPlaintext>;
}>;

async function loadActiveProviderCredential(
  orgId: string,
  providerAccountId: string,
  dependencies: ProviderAccountServiceDependencies
): Promise<LoadedProviderCredential> {
  const snapshot = await withTenantTransaction({ orgId }, async (tx) => {
    const account = await tx.providerAccount.findFirst({
      where: {
        orgId,
        id: providerAccountId,
        provider: PROVIDER,
        status: { in: [ProviderAccountStatus.VERIFIED, ProviderAccountStatus.DEGRADED] },
        revokedAt: null
      },
      select: {
        id: true,
        orgId: true,
        provider: true,
        externalAccountId: true,
        externalAccountIdHash: true,
        externalAccountIdLast4: true,
        status: true,
        revokedAt: true
      }
    });
    if (!account) throw serviceError("PROVIDER_ACCOUNT_NOT_FOUND", "Provider account not found.");
    const secret = await findActiveSecret(tx, orgId, providerAccountId);
    if (!secret) {
      throw serviceError("PROVIDER_CREDENTIAL_UNAVAILABLE", "Provider credential is unavailable.");
    }
    return { account, secret };
  });
  try {
    const token = decryptProviderCredentialEnvelope({
      envelope: envelopeFromSecret(snapshot.secret),
      masterKey: readProviderAccountMasterKey(dependencies),
      binding: credentialBinding({
        orgId,
        externalAccountId: snapshot.account.externalAccountId,
        externalAccountIdHash: snapshot.account.externalAccountIdHash,
        providerAccountId,
        secretId: snapshot.secret.id,
        credentialVersion: snapshot.secret.version
      })
    });
    return Object.freeze({ ...snapshot, token });
  } catch (error) {
    if (error instanceof ProviderAccountServiceError) throw error;
    throw serviceError("PROVIDER_CREDENTIAL_UNAVAILABLE", "Provider credential is unavailable.");
  }
}

function readProviderAccountMasterKey(
  dependencies: ProviderAccountServiceDependencies
): Buffer {
  try {
    return readProviderCredentialMasterKey(dependencies.environment ?? process.env);
  } catch {
    throw serviceError("PROVIDER_CREDENTIAL_UNAVAILABLE", "Provider credential is unavailable.");
  }
}

async function recordAccountVerification(
  input: Readonly<{ orgId: string; providerAccountId: string; actor: ProviderAccountActor }>,
  loaded: LoadedProviderCredential,
  accountStatus: string,
  dependencies: ProviderAccountServiceDependencies
): Promise<SafeProviderAccount> {
  const now = serviceNow(dependencies);
  const account = await withTenantTransaction(
    { orgId: input.orgId, userId: input.actor.userId },
    async (tx) => {
      await lockProviderAccount(tx, input.orgId, input.providerAccountId);
      await assertCredentialGeneration(tx, loaded, true);
      await tx.providerAccount.update({
        where: { id: input.providerAccountId },
        data: {
          status: ProviderAccountStatus.VERIFIED,
          accountStatus,
          lastCheckedAt: now
        }
      });
      await auditProviderAction(tx, {
        orgId: input.orgId,
        actorUserId: input.actor.userId,
        action: "provider_account.verified",
        subjectType: "provider_account",
        subjectId: input.providerAccountId,
        metadata: {
          provider: PROVIDER,
          accountLast4: loaded.account.externalAccountIdLast4,
          accountStatus,
          credentialVersion: loaded.secret.version
        }
      });
      return tx.providerAccount.findUniqueOrThrow({
        where: { id: input.providerAccountId },
        include: safeAccountInclude
      });
    },
    { isolationLevel: "Serializable" }
  );
  return toSafeProviderAccount(account);
}

function createAdapterFromLoaded(
  loaded: LoadedProviderCredential,
  dependencies: ProviderAccountServiceDependencies
): ProviderAdapter {
  return (dependencies.factory ?? providerFactory).create({
    name: PROVIDER,
    credentials: {
      externalAccountId: loaded.account.externalAccountId,
      token: loaded.token
    }
  });
}

function createTwilioAdapter(
  credentials: Readonly<{ externalAccountId: string; authToken: string }>,
  dependencies: ProviderAccountServiceDependencies
): ProviderAdapter {
  return (dependencies.factory ?? providerFactory).create({
    name: PROVIDER,
    credentials: {
      externalAccountId: credentials.externalAccountId,
      token: parseProviderCredentialPlaintext(credentials.authToken)
    }
  });
}

async function verifyExactActiveAccount(adapter: ProviderAdapter, expectedAccountId: string) {
  try {
    const verified = await adapter.verifyAccount();
    if (verified.externalAccountId !== expectedAccountId || verified.status !== "active") {
      throw serviceError("PROVIDER_VERIFICATION_FAILED", "Provider account verification failed.");
    }
    return verified;
  } catch (error) {
    if (error instanceof ProviderAccountServiceError) throw error;
    throw serviceError("PROVIDER_VERIFICATION_FAILED", "Provider account verification failed.");
  }
}

function parseSubmittedCredentials(externalAccountId: string, authToken: string) {
  const account = twilioAccountSidSchema.safeParse(externalAccountId);
  const token = twilioAuthTokenSchema.safeParse(authToken);
  if (!account.success || !token.success) {
    throw serviceError("INVALID_PROVIDER_ACCOUNT", "Provider account credentials are invalid.");
  }
  return Object.freeze({ externalAccountId: account.data, authToken: token.data });
}

function credentialBinding(input: {
  orgId: string;
  externalAccountId: string;
  externalAccountIdHash: string;
  providerAccountId: string;
  secretId: string;
  credentialVersion: number;
}): ProviderCredentialEnvelopeBinding {
  return Object.freeze({ provider: PROVIDER, ...input });
}

function envelopeFromSecret(secret: LoadedProviderCredential["secret"]): ProviderCredentialEnvelope {
  return Object.freeze({
    envelopeVersion: secret.envelopeVersion as 1,
    algorithm: secret.algorithm as "aes-256-gcm",
    keyVersion: secret.keyVersion,
    iv: secret.iv,
    ciphertext: secret.ciphertext,
    authTag: secret.authTag,
    fingerprint: secret.fingerprint
  });
}

function secretData(input: {
  id: string;
  orgId: string;
  providerAccountId: string;
  version: number;
  envelope: ProviderCredentialEnvelope;
  activeFrom: Date;
}) {
  return {
    id: input.id,
    orgId: input.orgId,
    providerAccountId: input.providerAccountId,
    version: input.version,
    envelopeVersion: input.envelope.envelopeVersion,
    algorithm: input.envelope.algorithm,
    keyVersion: input.envelope.keyVersion,
    iv: input.envelope.iv,
    ciphertext: input.envelope.ciphertext,
    authTag: input.envelope.authTag,
    fingerprint: input.envelope.fingerprint,
    activeFrom: input.activeFrom
  } as const;
}

async function findActiveSecret(
  tx: Prisma.TransactionClient,
  orgId: string,
  providerAccountId: string
) {
  return tx.providerCredentialSecret.findFirst({
    where: { orgId, providerAccountId, retiredAt: null },
    orderBy: { version: "desc" }
  });
}

async function assertCredentialGeneration(
  tx: Prisma.TransactionClient,
  loaded: LoadedProviderCredential,
  allowDegraded = false
): Promise<void> {
  const account = await tx.providerAccount.findFirst({
    where: {
      orgId: loaded.account.orgId,
      id: loaded.account.id,
      provider: loaded.account.provider,
      externalAccountId: loaded.account.externalAccountId,
      status: allowDegraded
        ? { in: [ProviderAccountStatus.VERIFIED, ProviderAccountStatus.DEGRADED] }
        : ProviderAccountStatus.VERIFIED,
      revokedAt: null
    },
    select: { id: true }
  });
  const current = await findActiveSecret(tx, loaded.account.orgId, loaded.account.id);
  if (
    !account ||
    !current ||
    current.id !== loaded.secret.id ||
    current.version !== loaded.secret.version ||
    current.fingerprint !== loaded.secret.fingerprint
  ) {
    throw serviceError("PROVIDER_DISCOVERY_STALE", "Provider credential generation changed.");
  }
}

function assertDiscoveredOwnership(
  externalAccountId: string,
  phoneNumbers: readonly ProviderPhoneNumberRecord[],
  services: readonly ProviderMessagingServiceRecord[]
): void {
  if (
    phoneNumbers.length > MAX_IMPORT_ITEMS ||
    services.length > MAX_IMPORT_ITEMS ||
    phoneNumbers.some((record) => record.externalAccountId !== externalAccountId) ||
    services.some((record) => record.externalAccountId !== externalAccountId) ||
    hasDuplicates(phoneNumbers.map((record) => record.phoneNumber)) ||
    hasDuplicates(phoneNumbers.map((record) => record.externalNumberId)) ||
    hasDuplicates(services.map((record) => record.externalServiceId))
  ) {
    throw serviceError("PROVIDER_DISCOVERY_FAILED", "Provider discovery failed.");
  }
}

function assertLoadedAccountVerified(loaded: LoadedProviderCredential): void {
  if (loaded.account.status !== ProviderAccountStatus.VERIFIED) {
    throw serviceError("PROVIDER_ACCOUNT_NOT_FOUND", "Provider account not found.");
  }
}

function assertUniqueCandidateIds(
  phoneNumbers: readonly Readonly<{ candidateId: string }>[],
  services: readonly Readonly<{ candidateId: string }>[]
): void {
  if (
    hasDuplicates(phoneNumbers.map((candidate) => candidate.candidateId)) ||
    hasDuplicates(services.map((candidate) => candidate.candidateId))
  ) {
    throw serviceError("PROVIDER_DISCOVERY_FAILED", "Provider discovery failed.");
  }
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function assertImportInput(input: {
  credentialVersion: number;
  phoneNumberCandidateIds: readonly string[];
  messagingServiceCandidateIds: readonly string[];
}): void {
  if (!Number.isSafeInteger(input.credentialVersion) || input.credentialVersion < 1) {
    throw serviceError("PROVIDER_IMPORT_INVALID", "Provider import version is invalid.");
  }
  const candidates = [
    ...input.phoneNumberCandidateIds,
    ...input.messagingServiceCandidateIds
  ];
  if (
    candidates.length < 1 ||
    input.phoneNumberCandidateIds.length > MAX_IMPORT_ITEMS ||
    input.messagingServiceCandidateIds.length > MAX_IMPORT_ITEMS ||
    candidates.some((value) => !/^pvcandidate_v1_[A-Za-z0-9_-]{43}$/.test(value)) ||
    new Set(input.phoneNumberCandidateIds).size !== input.phoneNumberCandidateIds.length ||
    new Set(input.messagingServiceCandidateIds).size !== input.messagingServiceCandidateIds.length
  ) {
    throw serviceError("PROVIDER_IMPORT_INVALID", "Provider import selection is invalid.");
  }
}

function selectCandidates<T>(
  identifiers: readonly string[],
  candidates: ReadonlyMap<string, T>
): readonly (readonly [string, T])[] {
  return identifiers.map((identifier) => {
    const candidate = candidates.get(identifier);
    if (!candidate) {
      throw serviceError("PROVIDER_IMPORT_INVALID", "Provider import candidate is invalid.");
    }
    return Object.freeze([identifier, candidate] as const);
  });
}

function capabilitiesFromNumber(record: ProviderPhoneNumberRecord): readonly ("sms" | "mms")[] {
  const capabilities = [
    ...(record.capabilities.sms ? (["sms"] as const) : []),
    ...(record.capabilities.mms ? (["mms"] as const) : [])
  ];
  if (capabilities.length === 0) {
    throw serviceError("PROVIDER_IMPORT_INVALID", "Provider number has no messaging capability.");
  }
  return Object.freeze(capabilities);
}

function providerNumberMayBeVerifiedForAccount(
  existing: Readonly<{
    provider: string;
    providerAccountId: string | null;
    externalNumberId: string | null;
    phoneNumberHash: string | null;
    phoneNumber: string;
    status: ProviderPhoneNumberStatus;
  }>,
  providerAccountId: string,
  discovered: ProviderPhoneNumberRecord
): boolean {
  if (
    existing.provider === PROVIDER &&
    existing.providerAccountId === providerAccountId &&
    existing.externalNumberId === discovered.externalNumberId &&
    existing.phoneNumber === discovered.phoneNumber
  ) {
    return true;
  }
  return (
    existing.provider === PROVIDER &&
    existing.providerAccountId === null &&
    existing.externalNumberId === null &&
    existing.phoneNumberHash === null &&
    existing.phoneNumber === discovered.phoneNumber &&
    existing.status === ProviderPhoneNumberStatus.CONFIGURED
  );
}

async function lockProviderAccount(
  tx: Prisma.TransactionClient,
  orgId: string,
  providerAccountId: string
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM "ProviderAccount"
    WHERE "orgId" = ${orgId} AND id = ${providerAccountId}
    FOR UPDATE
  `;
}

async function lockProviderPhoneNumber(
  tx: Prisma.TransactionClient,
  orgId: string,
  phoneNumberId: string
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM "ProviderPhoneNumber"
    WHERE "orgId" = ${orgId} AND id = ${phoneNumberId}
    FOR UPDATE
  `;
}

async function lockProviderMessagingService(
  tx: Prisma.TransactionClient,
  orgId: string,
  messagingServiceId: string
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM "ProviderMessagingService"
    WHERE "orgId" = ${orgId} AND id = ${messagingServiceId}
    FOR UPDATE
  `;
}

async function auditProviderAction(
  tx: Prisma.TransactionClient,
  input: Readonly<{
    orgId: string;
    actorUserId: string;
    action: string;
    subjectType: string;
    subjectId: string;
    metadata: Prisma.InputJsonObject;
  }>
): Promise<void> {
  await tx.integrationAuditEvent.create({
    data: {
      orgId: input.orgId,
      actorUserId: input.actorUserId,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      metadata: input.metadata
    }
  });
}

function serviceNow(dependencies: ProviderAccountServiceDependencies): Date {
  const value = dependencies.now?.() ?? new Date();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("Provider account clock returned an invalid value.");
  }
  return new Date(value.getTime());
}

function serviceId(dependencies: ProviderAccountServiceDependencies): string {
  const value = dependencies.randomId?.() ?? randomUUID();
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 191 ||
    value.trim() !== value ||
    Array.from(value).some((character) => (character.codePointAt(0) ?? 0) < 32)
  ) {
    throw new Error("Provider account identifier source returned an invalid value.");
  }
  return value;
}

function lastFour(value: string): string {
  const suffix = value.slice(-4);
  if (!/^[A-Za-z0-9]{4}$/.test(suffix)) {
    throw serviceError("INVALID_PROVIDER_ACCOUNT", "Provider identifier is invalid.");
  }
  return suffix;
}

function isUniqueConstraintConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function isSerializationConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}

function mapProviderLifecycleConflict(error: unknown): never {
  if (isSerializationConflict(error) || isUniqueConstraintConflict(error)) {
    throw serviceError(
      "PROVIDER_LIFECYCLE_CONFLICT",
      "Provider lifecycle changed concurrently."
    );
  }
  throw error;
}

function serviceError(
  code: ProviderAccountServiceError["code"],
  message: string
): ProviderAccountServiceError {
  return new ProviderAccountServiceError(code, message);
}
