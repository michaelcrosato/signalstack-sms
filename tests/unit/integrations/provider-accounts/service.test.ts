import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProviderDiscoveryCandidateId,
  createProviderCredentialEnvelope,
  hashProviderLookupIdentifier
} from "@/lib/integrations/provider-accounts/credential-encryption";
import type { ProviderAdapter } from "@/lib/messaging/provider/types";
import {
  checkProviderAccountHealth,
  connectProviderAccount,
  discoverProviderResources,
  importProviderResources,
  ProviderAccountServiceError,
  rotateProviderAccountCredential,
  setDefaultProviderAccount,
  updateProviderMessagingServiceLifecycle,
  updateProviderPhoneNumberLifecycle
} from "@/lib/integrations/provider-accounts/service";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    providerAccount: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    providerCredentialSecret: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    providerPhoneNumber: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    providerMessagingService: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    integrationAuditEvent: { create: vi.fn() }
  };
  return {
    tx,
    withTenantTransaction: vi.fn(async (_context: unknown, operation: (tx: unknown) => unknown) =>
      operation(tx)
    )
  };
});

vi.mock("@prisma/client", () => ({
  ProviderAccountStatus: {
    VERIFIED: "VERIFIED",
    DEGRADED: "DEGRADED",
    REVOKED: "REVOKED"
  },
  ProviderMessagingServiceStatus: {
    VERIFIED: "VERIFIED",
    DISABLED: "DISABLED"
  },
  ProviderPhoneNumberStatus: {
    DEMO: "DEMO",
    CONFIGURED: "CONFIGURED",
    VERIFIED: "VERIFIED",
    DISABLED: "DISABLED"
  }
}));

vi.mock("@/lib/db/tenant-context", () => ({
  withTenantTransaction: mocks.withTenantTransaction
}));

const masterKey = "11".repeat(32);
const environment = { SECRETS_MASTER_KEY: masterKey };
const accountSid = `AC${"a".repeat(32)}`;
const otherAccountSid = `AC${"b".repeat(32)}`;
const authToken = "c".repeat(32);
const accountId = "provider_account_1";
const secretId = "provider_secret_1";
const now = new Date("2026-07-12T00:00:00.000Z");
const accountHash = hashProviderLookupIdentifier({
  masterKey,
  provider: "twilio",
  kind: "account",
  value: accountSid
});

function providerCandidateId(
  kind: "phone_number" | "messaging_service",
  value: string,
  credentialVersion = 1
) {
  return createProviderDiscoveryCandidateId({
    masterKey,
    orgId: "org_1",
    provider: "twilio",
    providerAccountId: accountId,
    credentialVersion,
    kind,
    value
  });
}

function adapter(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    name: "twilio",
    externalAccountId: accountSid,
    send: vi.fn(),
    createMessage: vi.fn(),
    fetchMessage: vi.fn(),
    normalizeStatus: vi.fn(),
    classifyError: vi.fn(),
    validateSignature: vi.fn(),
    verifyAccount: vi.fn().mockResolvedValue({
      externalAccountId: accountSid,
      friendlyName: "Primary",
      status: "active"
    }),
    discoverPhoneNumbers: vi.fn().mockResolvedValue([]),
    discoverMessagingServices: vi.fn().mockResolvedValue([]),
    getHealth: vi.fn(),
    ...overrides
  } as ProviderAdapter;
}

function factory(provider: ProviderAdapter) {
  return { create: vi.fn(() => provider) };
}

function accountRow(status = "VERIFIED") {
  return {
    id: accountId,
    orgId: "org_1",
    provider: "twilio",
    externalAccountId: accountSid,
    externalAccountIdHash: accountHash,
    externalAccountIdLast4: "aaaa",
    status,
    isDefault: true,
    accountStatus: "active",
    accountType: null,
    verifiedAt: now,
    lastCheckedAt: now,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
    credentialSecrets: [] as Array<{
      version: number;
      fingerprint: string;
      retiredAt: Date | null;
    }>,
    _count: { phoneNumbers: 0, messagingServices: 0 }
  };
}

function encryptedSecretRow(version = 1) {
  const envelope = createProviderCredentialEnvelope({
    secret: authToken,
    masterKey,
    keyVersion: 1,
    binding: {
      orgId: "org_1",
      provider: "twilio",
      externalAccountId: accountSid,
      externalAccountIdHash: accountHash,
      providerAccountId: accountId,
      secretId,
      credentialVersion: version
    },
    dependencies: { randomBytes: (size) => Buffer.alloc(size, 7) }
  });
  return {
    id: secretId,
    orgId: "org_1",
    providerAccountId: accountId,
    version,
    ...envelope,
    activeFrom: now,
    retiredAt: null,
    createdAt: now
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tx.$queryRaw.mockResolvedValue([]);
  mocks.tx.integrationAuditEvent.create.mockResolvedValue({ id: "audit_1" });
  mocks.tx.providerAccount.updateMany.mockResolvedValue({ count: 0 });
  mocks.tx.providerCredentialSecret.updateMany.mockResolvedValue({ count: 0 });
  mocks.tx.providerPhoneNumber.updateMany.mockResolvedValue({ count: 0 });
  mocks.tx.providerMessagingService.updateMany.mockResolvedValue({ count: 0 });
});

describe("connectProviderAccount", () => {
  it("rejects malformed credentials before factory or database access", async () => {
    const providerFactory = factory(adapter());

    await expect(
      connectProviderAccount(
        {
          orgId: "org_1",
          externalAccountId: "AC_invalid",
          authToken,
          actor: { userId: "user_1" }
        },
        { factory: providerFactory, environment }
      )
    ).rejects.toMatchObject({ code: "INVALID_PROVIDER_ACCOUNT" });
    expect(providerFactory.create).not.toHaveBeenCalled();
    expect(mocks.withTenantTransaction).not.toHaveBeenCalled();
  });

  it("rejects a missing credential-encryption root before any provider call", async () => {
    const providerAdapter = adapter();
    const providerFactory = factory(providerAdapter);

    await expect(
      connectProviderAccount(
        {
          orgId: "org_1",
          externalAccountId: accountSid,
          authToken,
          actor: { userId: "user_1" }
        },
        { factory: providerFactory, environment: {} }
      )
    ).rejects.toMatchObject({ code: "PROVIDER_CREDENTIAL_UNAVAILABLE" });
    expect(providerFactory.create).not.toHaveBeenCalled();
    expect(providerAdapter.verifyAccount).not.toHaveBeenCalled();
    expect(mocks.withTenantTransaction).not.toHaveBeenCalled();
  });

  it("verifies first, persists only an authenticated envelope, and returns a secret-safe DTO", async () => {
    const providerFactory = factory(adapter());
    let createdAccount = accountRow();
    let storedSecret: ReturnType<typeof encryptedSecretRow> | null = null;
    mocks.tx.providerAccount.create.mockImplementation(async ({ data }) => {
      createdAccount = { ...createdAccount, ...data };
      return createdAccount;
    });
    mocks.tx.providerCredentialSecret.create.mockImplementation(async ({ data }) => {
      storedSecret = { ...data, createdAt: now };
      return storedSecret;
    });
    mocks.tx.providerAccount.findUniqueOrThrow.mockImplementation(async () => ({
      ...createdAccount,
      credentialSecrets: storedSecret
        ? [{ version: storedSecret.version, fingerprint: storedSecret.fingerprint, retiredAt: null }]
        : [],
      _count: { phoneNumbers: 0, messagingServices: 0 }
    }));
    const ids = [accountId, secretId];

    const result = await connectProviderAccount(
      {
        orgId: "org_1",
        externalAccountId: accountSid,
        authToken,
        actor: { userId: "user_1" }
      },
      {
        factory: providerFactory,
        environment,
        now: () => now,
        randomId: () => ids.shift()!
      }
    );

    expect(result).toMatchObject({
      id: accountId,
      externalAccountIdLast4: "aaaa",
      activeCredentialVersion: 1,
      credentialFingerprint: expect.stringMatching(/^pvfp_/)
    });
    expect(JSON.stringify(result)).not.toContain(authToken);
    expect(JSON.stringify(result)).not.toContain(accountSid);
    expect(storedSecret).toMatchObject({
      envelopeVersion: 1,
      algorithm: "aes-256-gcm",
      keyVersion: 1,
      ciphertext: expect.any(String),
      authTag: expect.any(String)
    });
    expect(JSON.stringify(storedSecret)).not.toContain(authToken);
    expect(JSON.stringify(mocks.tx.integrationAuditEvent.create.mock.calls)).not.toContain(authToken);
  });

  it("fails closed when provider verification returns the wrong account", async () => {
    const providerFactory = factory(
      adapter({
        verifyAccount: vi.fn().mockResolvedValue({
          externalAccountId: otherAccountSid,
          friendlyName: "Wrong",
          status: "active"
        })
      })
    );

    await expect(
      connectProviderAccount(
        {
          orgId: "org_1",
          externalAccountId: accountSid,
          authToken,
          actor: { userId: "user_1" }
        },
        { factory: providerFactory, environment }
      )
    ).rejects.toMatchObject({ code: "PROVIDER_VERIFICATION_FAILED" });
    expect(mocks.withTenantTransaction).not.toHaveBeenCalled();
  });
});

describe("provider discovery and import proof", () => {
  function mockLoadedCredential(version = 1) {
    const account = accountRow();
    const secret = encryptedSecretRow(version);
    mocks.tx.providerAccount.findFirst.mockResolvedValue(account);
    mocks.tx.providerCredentialSecret.findFirst.mockResolvedValue(secret);
    return { account, secret };
  }

  it("returns opaque candidate hashes and no provider IDs or credential material", async () => {
    mockLoadedCredential();
    const phone = {
      externalNumberId: `PN${"f".repeat(32)}`,
      externalAccountId: accountSid,
      phoneNumber: "+15555550199",
      friendlyName: "Support",
      capabilities: { sms: true, mms: true }
    };
    const service = {
      externalServiceId: `MG${"1".repeat(32)}`,
      externalAccountId: accountSid,
      friendlyName: "Outbound"
    };
    const providerFactory = factory(
      adapter({
        discoverPhoneNumbers: vi.fn().mockResolvedValue([phone]),
        discoverMessagingServices: vi.fn().mockResolvedValue([service])
      })
    );

    const result = await discoverProviderResources(
      {
        orgId: "org_1",
        providerAccountId: accountId,
        actor: { userId: "user_1" }
      },
      { factory: providerFactory, environment }
    );

    expect(result).toEqual({
      credentialVersion: 1,
      phoneNumbers: [
        {
          candidateId: providerCandidateId("phone_number", phone.phoneNumber),
          externalNumberIdLast4: "ffff",
          phoneNumber: "+15555550199",
          capabilities: ["sms", "mms"]
        }
      ],
      messagingServices: [
        {
          candidateId: providerCandidateId("messaging_service", service.externalServiceId),
          externalServiceIdLast4: "1111"
        }
      ]
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(phone.externalNumberId);
    expect(serialized).not.toContain(service.externalServiceId);
    expect(serialized).not.toContain(accountSid);
    expect(serialized).not.toContain(authToken);
    expect(mocks.tx.integrationAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org_1",
        actorUserId: "user_1",
        action: "provider_account.resources_discovered",
        subjectType: "provider_account",
        subjectId: accountId,
        metadata: expect.objectContaining({
          credentialVersion: 1,
          phoneNumberCount: 1,
          messagingServiceCount: 1
        })
      })
    });
  });

  it("fails closed on provider resources owned by another account", async () => {
    mockLoadedCredential();
    const providerFactory = factory(
      adapter({
        discoverPhoneNumbers: vi.fn().mockResolvedValue([
          {
            externalNumberId: `PN${"f".repeat(32)}`,
            externalAccountId: otherAccountSid,
            phoneNumber: "+15555550199",
            friendlyName: null,
            capabilities: { sms: true, mms: false }
          }
        ]),
        discoverMessagingServices: vi.fn().mockResolvedValue([])
      })
    );

    await expect(
      discoverProviderResources(
        {
          orgId: "org_1",
          providerAccountId: accountId,
          actor: { userId: "user_1" }
        },
        { factory: providerFactory, environment }
      )
    ).rejects.toMatchObject({ code: "PROVIDER_DISCOVERY_FAILED" });
    expect(mocks.tx.providerPhoneNumber.create).not.toHaveBeenCalled();
    expect(mocks.tx.providerMessagingService.create).not.toHaveBeenCalled();
  });

  it("fails closed when discovery contains duplicate ownership candidates", async () => {
    mockLoadedCredential();
    const providerFactory = factory(
      adapter({
        discoverPhoneNumbers: vi.fn().mockResolvedValue([
          {
            externalNumberId: `PN${"d".repeat(32)}`,
            externalAccountId: accountSid,
            phoneNumber: "+15555550199",
            friendlyName: "First",
            capabilities: { sms: true, mms: false }
          },
          {
            externalNumberId: `PN${"e".repeat(32)}`,
            externalAccountId: accountSid,
            phoneNumber: "+15555550199",
            friendlyName: "Duplicate",
            capabilities: { sms: true, mms: true }
          }
        ]),
        discoverMessagingServices: vi.fn().mockResolvedValue([])
      })
    );

    await expect(
      discoverProviderResources(
        {
          orgId: "org_1",
          providerAccountId: accountId,
          actor: { userId: "user_1" }
        },
        { factory: providerFactory, environment }
      )
    ).rejects.toMatchObject({ code: "PROVIDER_DISCOVERY_FAILED" });
    expect(mocks.withTenantTransaction).toHaveBeenCalledTimes(1);
  });

  it("persists the keyed messaging-service identity and canonical capability array", async () => {
    mockLoadedCredential();
    const service = {
      externalServiceId: `MG${"1".repeat(32)}`,
      externalAccountId: accountSid,
      friendlyName: "Outbound"
    };
    const candidateId = providerCandidateId("messaging_service", service.externalServiceId);
    const serviceLookupHash = hashProviderLookupIdentifier({
      masterKey,
      provider: "twilio",
      kind: "messaging_service",
      value: service.externalServiceId
    });
    const providerFactory = factory(
      adapter({
        discoverPhoneNumbers: vi.fn().mockResolvedValue([]),
        discoverMessagingServices: vi.fn().mockResolvedValue([service])
      })
    );
    mocks.tx.providerMessagingService.findFirst.mockResolvedValue(null);
    mocks.tx.providerMessagingService.create.mockImplementation(async ({ data }) => ({
      id: "provider_service_1",
      ...data,
      disabledAt: null,
      createdAt: now,
      updatedAt: now
    }));

    const result = await importProviderResources(
      {
        orgId: "org_1",
        providerAccountId: accountId,
        credentialVersion: 1,
        phoneNumberCandidateIds: [],
        messagingServiceCandidateIds: [candidateId],
        defaultMessagingServiceCandidateId: candidateId,
        actor: { userId: "user_1" }
      },
      { factory: providerFactory, environment, now: () => now }
    );

    expect(mocks.tx.providerMessagingService.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalServiceId: service.externalServiceId,
        externalServiceIdHash: serviceLookupHash,
        capabilities: ["sms", "mms"],
        status: "VERIFIED"
      })
    });
    expect(result.messagingServices).toEqual([
      expect.objectContaining({
        id: "provider_service_1",
        capabilities: ["mms", "sms"],
        status: "VERIFIED"
      })
    ]);
  });

  it("rejects a stale credential generation before rediscovery or persistence", async () => {
    mockLoadedCredential(2);
    const providerFactory = factory(adapter());
    const selected = `pvcandidate_v1_${"A".repeat(43)}`;

    await expect(
      importProviderResources(
        {
          orgId: "org_1",
          providerAccountId: accountId,
          credentialVersion: 1,
          phoneNumberCandidateIds: [selected],
          messagingServiceCandidateIds: [],
          actor: { userId: "user_1" }
        },
        { factory: providerFactory, environment }
      )
    ).rejects.toMatchObject({ code: "PROVIDER_DISCOVERY_STALE" });
    expect(providerFactory.create).not.toHaveBeenCalled();
    expect(mocks.tx.providerPhoneNumber.create).not.toHaveBeenCalled();
  });
});

describe("provider health recovery", () => {
  it("allows an explicit healthy recheck to restore a degraded account", async () => {
    const degraded = accountRow("DEGRADED");
    const secret = encryptedSecretRow();
    mocks.tx.providerAccount.findFirst.mockResolvedValue(degraded);
    mocks.tx.providerCredentialSecret.findFirst.mockResolvedValue(secret);
    mocks.tx.providerAccount.update.mockResolvedValue({ ...degraded, status: "VERIFIED" });
    mocks.tx.providerAccount.findUniqueOrThrow.mockResolvedValue({
      ...degraded,
      status: "VERIFIED",
      credentialSecrets: [
        { version: secret.version, fingerprint: secret.fingerprint, retiredAt: null }
      ]
    });
    const providerFactory = factory(
      adapter({
        getHealth: vi.fn().mockResolvedValue({
          healthy: true,
          checkedAt: now.toISOString(),
          safeCode: "PROVIDER_HEALTHY"
        })
      })
    );

    const result = await checkProviderAccountHealth(
      { orgId: "org_1", providerAccountId: accountId, actor: { userId: "user_1" } },
      { factory: providerFactory, environment, now: () => now }
    );

    expect(result.healthy).toBe(true);
    expect(result.account.status).toBe("VERIFIED");
    expect(mocks.tx.providerAccount.findFirst.mock.calls[0][0]).toMatchObject({
      where: { status: { in: ["VERIFIED", "DEGRADED"] } }
    });
    expect(mocks.tx.providerAccount.findFirst.mock.calls[1][0]).toMatchObject({
      where: { status: { in: ["VERIFIED", "DEGRADED"] } }
    });
    expect(mocks.tx.integrationAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "provider_account.health_checked",
        metadata: { provider: "twilio", healthy: true, safeCode: "PROVIDER_HEALTHY" }
      })
    });
  });
});

describe("provider credential rotation concurrency", () => {
  it("maps a serializable rotate/revoke race to the stable stale-generation conflict", async () => {
    const account = accountRow();
    const secret = encryptedSecretRow();
    mocks.tx.providerAccount.findFirst.mockResolvedValue(account);
    mocks.tx.providerCredentialSecret.findFirst.mockResolvedValue(secret);
    mocks.withTenantTransaction
      .mockImplementationOnce(async (_context, operation) => operation(mocks.tx))
      .mockRejectedValueOnce(Object.assign(new Error("write conflict"), { code: "P2034" }));

    await expect(
      rotateProviderAccountCredential(
        {
          orgId: "org_1",
          providerAccountId: accountId,
          authToken: "d".repeat(32),
          actor: { userId: "user_1" }
        },
        { factory: factory(adapter()), environment, now: () => now }
      )
    ).rejects.toMatchObject({ code: "PROVIDER_DISCOVERY_STALE" });
  });
});

describe("provider default-selection concurrency", () => {
  it.each([
    [
      "account",
      () =>
        setDefaultProviderAccount({
          orgId: "org_1",
          providerAccountId: accountId,
          actor: { userId: "user_1" }
        })
    ],
    [
      "phone number",
      () =>
        updateProviderPhoneNumberLifecycle({
          orgId: "org_1",
          phoneNumberId: "number_1",
          makeDefault: true,
          actor: { userId: "user_1" }
        })
    ],
    [
      "messaging service",
      () =>
        updateProviderMessagingServiceLifecycle({
          orgId: "org_1",
          providerAccountId: accountId,
          messagingServiceId: "service_1",
          makeDefault: true,
          actor: { userId: "user_1" }
        })
    ]
  ] as const)("maps concurrent %s default selection to a stable conflict", async (_label, run) => {
    mocks.withTenantTransaction.mockRejectedValueOnce(
      Object.assign(new Error("write conflict"), { code: "P2034" })
    );

    await expect(run()).rejects.toMatchObject({ code: "PROVIDER_LIFECYCLE_CONFLICT" });
  });
});

describe("provider account service error surface", () => {
  it("keeps stable codes and messages free of raw provider secrets", () => {
    const error = new ProviderAccountServiceError(
      "PROVIDER_CREDENTIAL_UNAVAILABLE",
      "Provider credential is unavailable."
    );
    expect(error.code).toBe("PROVIDER_CREDENTIAL_UNAVAILABLE");
    expect(JSON.stringify(error)).not.toContain(authToken);
    expect(String(error)).not.toContain(authToken);
  });
});
