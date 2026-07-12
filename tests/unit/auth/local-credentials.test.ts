import { describe, expect, it, vi } from "vitest";
import {
  createLocalCredentialService,
  LocalCredentialServiceError,
  type FirstOwnerBootstrapInput,
  type FirstOwnerBootstrapTransaction,
  type LocalAuthenticationRecord,
  type LocalCredentialCrypto,
  type LocalCredentialStore
} from "@/lib/auth/local-credentials";

const bootstrapToken = "bootstrap-token-that-is-long-enough-for-setup";
const password = "correct horse battery staple";
const passwordHash = "encoded-password-hash-without-raw-material";
const authenticationFallbackHash = "encoded-fallback-hash-for-missing-accounts";
const now = new Date("2026-07-11T02:00:00.000Z");

const bootstrapInput: FirstOwnerBootstrapInput = {
  bootstrapToken,
  email: "  Owner@Example.COM ",
  displayName: "  First Owner  ",
  password,
  organizationName: "  Example Company  ",
  organizationSlug: "  Example-Company  ",
  timezone: "America/Vancouver"
};

describe("local credential domain service", () => {
  it("constant-time checks bootstrap candidates and denies missing or mismatched configuration", async () => {
    const memory = createMemoryStore();
    const crypto = createCrypto();
    const unconfigured = createLocalCredentialService({
      store: memory.store,
      authenticationFallbackHash,
      now: () => now,
      crypto
    });

    await expect(unconfigured.bootstrapFirstOwner(bootstrapInput)).resolves.toEqual({
      created: false,
      code: "BOOTSTRAP_DENIED"
    });
    expect(crypto.safeEqualSecret).toHaveBeenCalledOnce();
    expect(memory.transactions).toHaveLength(0);

    const configured = createLocalCredentialService({
      store: memory.store,
      bootstrapToken,
      authenticationFallbackHash,
      now: () => now,
      crypto
    });
    await expect(
      configured.bootstrapFirstOwner({ ...bootstrapInput, bootstrapToken: `${bootstrapToken}-wrong` })
    ).resolves.toEqual({ created: false, code: "BOOTSTRAP_DENIED" });
    expect(memory.transactions).toHaveLength(0);
  });

  it("allows exactly one concurrent first-owner bootstrap through serializable transactions", async () => {
    const memory = createMemoryStore();
    const crypto = createCrypto();
    const service = createLocalCredentialService({
      store: memory.store,
      bootstrapToken,
      authenticationFallbackHash,
      now: () => now,
      crypto
    });

    const results = await Promise.all([
      service.bootstrapFirstOwner(bootstrapInput),
      service.bootstrapFirstOwner(bootstrapInput)
    ]);

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ created: true }),
        { created: false, code: "BOOTSTRAP_CLOSED" }
      ])
    );
    expect(memory.transactions).toEqual([
      { isolationLevel: "Serializable" },
      { isolationLevel: "Serializable" }
    ]);

    const state = memory.getState();
    expect(state.credentialCount).toBe(1);
    expect(state.users).toHaveLength(1);
    expect(state.organizations).toHaveLength(1);
    expect(state.credentials).toHaveLength(1);
    expect(state.memberships).toHaveLength(1);
    expect(state.auditEvents).toHaveLength(1);
    expect(state.users[0]).toMatchObject({
      email: "owner@example.com",
      normalizedEmail: "owner@example.com",
      displayName: "First Owner",
      emailVerifiedAt: now
    });
    expect(state.organizations[0]).toMatchObject({
      name: "Example Company",
      slug: "example-company",
      timezone: "America/Vancouver",
      demoMode: false
    });
    expect(state.credentials[0]).toMatchObject({
      passwordHash,
      passwordChangedAt: now,
      failedAttempts: 0,
      lockedUntil: null
    });
    expect(state.memberships[0]).toMatchObject({ role: "OWNER", status: "ACTIVE" });
    expect(state.auditEvents[0]).toMatchObject({
      action: "LOCAL_OWNER_BOOTSTRAPPED",
      subjectType: "AppUser",
      metadata: { authMode: "local" }
    });

    const serializedResults = JSON.stringify(results);
    for (const secret of [bootstrapToken, password, passwordHash]) {
      expect(serializedResults).not.toContain(secret);
    }
  });

  it("rejects invalid bootstrap fields and password policy failures before storage", async () => {
    const memory = createMemoryStore();
    const crypto = createCrypto({
      hashPassword: vi.fn(async () => {
        throw new Error("Password policy rejected the password: known-default.");
      })
    });
    const service = createLocalCredentialService({
      store: memory.store,
      bootstrapToken,
      authenticationFallbackHash,
      crypto
    });

    await expect(
      service.bootstrapFirstOwner({ ...bootstrapInput, password: "password1234" })
    ).resolves.toEqual({ created: false, code: "BOOTSTRAP_INPUT_INVALID" });
    await expect(
      service.bootstrapFirstOwner({ ...bootstrapInput, email: "not-an-email" })
    ).resolves.toEqual({ created: false, code: "BOOTSTRAP_INPUT_INVALID" });
    await expect(
      service.bootstrapFirstOwner({ ...bootstrapInput, timezone: "not/a-timezone" })
    ).resolves.toEqual({ created: false, code: "BOOTSTRAP_INPUT_INVALID" });
    expect(memory.transactions).toHaveLength(0);
  });

  it("rolls back every bootstrap write when the transaction cannot complete", async () => {
    const memory = createMemoryStore({ failAudit: true });
    const service = createLocalCredentialService({
      store: memory.store,
      bootstrapToken,
      authenticationFallbackHash,
      crypto: createCrypto()
    });

    await expect(service.bootstrapFirstOwner(bootstrapInput)).rejects.toEqual(
      new LocalCredentialServiceError("First-owner bootstrap failed.")
    );
    expect(memory.transactions).toEqual([{ isolationLevel: "Serializable" }]);
    expect(memory.getState()).toMatchObject({
      credentialCount: 0,
      users: [],
      organizations: [],
      credentials: [],
      memberships: [],
      auditEvents: []
    });
  });

  it("retries only bounded serializable conflicts and then observes the bootstrap predicate", async () => {
    const memory = createMemoryStore();
    let transactionAttempts = 0;
    const store: LocalCredentialStore = {
      ...memory.store,
      async transaction(operation, options) {
        transactionAttempts += 1;
        if (transactionAttempts === 1) {
          throw Object.assign(new Error("serialization detail"), { code: "P2034" });
        }
        return memory.store.transaction(operation, options);
      }
    };
    const service = createLocalCredentialService({
      store,
      bootstrapToken,
      authenticationFallbackHash,
      now: () => now,
      crypto: createCrypto()
    });

    await expect(service.bootstrapFirstOwner(bootstrapInput)).resolves.toMatchObject({ created: true });
    expect(transactionAttempts).toBe(2);
    expect(memory.getState()).toMatchObject({ credentialCount: 1 });
  });

  it("normalizes email, authenticates an enabled user, and clears prior failures", async () => {
    const record = authenticationRecord({ failedAttempts: 2, lockedUntil: new Date(now.getTime() - 1) });
    const memory = createMemoryStore({ authenticationRecord: record });
    const crypto = createCrypto({ verifyPassword: vi.fn(async () => true) });
    const service = createLocalCredentialService({
      store: memory.store,
      bootstrapToken,
      authenticationFallbackHash,
      now: () => now,
      crypto
    });

    const result = await service.authenticate({ email: "  OWNER@EXAMPLE.COM ", password });

    expect(memory.store.findAuthenticationRecord).toHaveBeenCalledWith("owner@example.com");
    expect(crypto.verifyPassword).toHaveBeenCalledWith(password, record.credential.passwordHash);
    expect(memory.store.resetFailedAuthentications).toHaveBeenCalledWith({
      credentialId: record.credential.id,
      resetAt: now
    });
    expect(memory.store.recordFailedAuthentication).not.toHaveBeenCalled();
    expect(result).toEqual({
      authenticated: true,
      user: {
        id: "user-1",
        email: "owner@example.com",
        displayName: "Owner",
        authVersion: 3
      }
    });
    expect(JSON.stringify(result)).not.toContain(record.credential.passwordHash);
    expect(JSON.stringify(result)).not.toContain("normalizedEmail");
  });

  it("does fallback password work for missing identities and returns a generic denial", async () => {
    const memory = createMemoryStore({ authenticationRecord: null });
    const crypto = createCrypto({ verifyPassword: vi.fn(async () => false) });
    const service = createLocalCredentialService({
      store: memory.store,
      bootstrapToken,
      authenticationFallbackHash,
      crypto
    });

    await expect(service.authenticate({ email: "missing@example.com", password })).resolves.toEqual({
      authenticated: false,
      code: "AUTHENTICATION_DENIED"
    });
    expect(crypto.verifyPassword).toHaveBeenCalledWith(password, authenticationFallbackHash);
    expect(memory.store.recordFailedAuthentication).not.toHaveBeenCalled();
    expect(memory.store.resetFailedAuthentications).not.toHaveBeenCalled();
  });

  it("denies an active credential lock after bounded password work and without counter mutation", async () => {
    const record = authenticationRecord({ lockedUntil: new Date(now.getTime() + 60_000) });
    const memory = createMemoryStore({ authenticationRecord: record });
    const crypto = createCrypto();
    const service = createLocalCredentialService({
      store: memory.store,
      authenticationFallbackHash,
      now: () => now,
      crypto
    });

    await expect(service.authenticate({ email: record.user.email, password })).resolves.toEqual({
      authenticated: false,
      code: "AUTHENTICATION_DENIED"
    });
    expect(crypto.verifyPassword).toHaveBeenCalledWith(password, record.credential.passwordHash);
    expect(memory.store.recordFailedAuthentication).not.toHaveBeenCalled();
    expect(memory.store.resetFailedAuthentications).not.toHaveBeenCalled();
  });

  it("denies disabled users without mutating credential counters", async () => {
    const record = authenticationRecord({ disabledAt: new Date(now.getTime() - 1) });
    const memory = createMemoryStore({ authenticationRecord: record });
    const crypto = createCrypto({ verifyPassword: vi.fn(async () => true) });
    const service = createLocalCredentialService({
      store: memory.store,
      authenticationFallbackHash,
      now: () => now,
      crypto
    });

    await expect(service.authenticate({ email: record.user.email, password })).resolves.toEqual({
      authenticated: false,
      code: "AUTHENTICATION_DENIED"
    });
    expect(crypto.verifyPassword).toHaveBeenCalledOnce();
    expect(memory.store.recordFailedAuthentication).not.toHaveBeenCalled();
    expect(memory.store.resetFailedAuthentications).not.toHaveBeenCalled();
  });

  it("records failed passwords atomically with bounded lock policy and a generic result", async () => {
    const record = authenticationRecord();
    const memory = createMemoryStore({ authenticationRecord: record });
    const crypto = createCrypto({ verifyPassword: vi.fn(async () => false) });
    const service = createLocalCredentialService({
      store: memory.store,
      authenticationFallbackHash,
      now: () => now,
      maximumFailedAttempts: 4,
      lockDurationMs: 90_000,
      crypto
    });

    await expect(service.authenticate({ email: record.user.email, password: "wrong password value" })).resolves.toEqual({
      authenticated: false,
      code: "AUTHENTICATION_DENIED"
    });
    expect(memory.store.recordFailedAuthentication).toHaveBeenCalledWith({
      credentialId: record.credential.id,
      userId: record.user.id,
      observedPasswordHash: record.credential.passwordHash,
      observedPasswordChangedAt: record.credential.passwordChangedAt,
      occurredAt: now,
      maximumAttempts: 4,
      lockDurationMs: 90_000
    });
    expect(memory.store.resetFailedAuthentications).not.toHaveBeenCalled();
  });

  it("uses the same sanitized denial for missing, locked, disabled, and wrong-password states", async () => {
    const denial = { authenticated: false, code: "AUTHENTICATION_DENIED" };
    const cases: Array<LocalAuthenticationRecord | null> = [
      null,
      authenticationRecord({ lockedUntil: new Date(now.getTime() + 60_000) }),
      authenticationRecord({ disabledAt: now }),
      authenticationRecord()
    ];

    for (const record of cases) {
      const memory = createMemoryStore({ authenticationRecord: record });
      const service = createLocalCredentialService({
        store: memory.store,
        authenticationFallbackHash,
        now: () => now,
        crypto: createCrypto({ verifyPassword: vi.fn(async () => false) })
      });
      await expect(service.authenticate({ email: "owner@example.com", password })).resolves.toEqual(denial);
    }
  });

  it("sanitizes storage failures without returning database details", async () => {
    const record = authenticationRecord();
    const memory = createMemoryStore({ authenticationRecord: record, failFailureUpdate: true });
    const service = createLocalCredentialService({
      store: memory.store,
      authenticationFallbackHash,
      crypto: createCrypto({ verifyPassword: vi.fn(async () => false) })
    });

    await expect(service.authenticate({ email: record.user.email, password })).rejects.toEqual(
      new LocalCredentialServiceError("Local authentication state update failed.")
    );
  });

  it("sanitizes credential lookup failures without exposing database details", async () => {
    const memory = createMemoryStore({ failLookup: true });
    const service = createLocalCredentialService({
      store: memory.store,
      authenticationFallbackHash,
      crypto: createCrypto()
    });

    await expect(service.authenticate({ email: "owner@example.com", password })).rejects.toEqual(
      new LocalCredentialServiceError("Local authentication failed.")
    );
  });
});

type MemoryState = {
  credentialCount: number;
  users: Array<Record<string, unknown>>;
  organizations: Array<Record<string, unknown>>;
  credentials: Array<Record<string, unknown>>;
  memberships: Array<Record<string, unknown>>;
  auditEvents: Array<Record<string, unknown>>;
};

function createMemoryStore(options: {
  authenticationRecord?: LocalAuthenticationRecord | null;
  failAudit?: boolean;
  failFailureUpdate?: boolean;
  failLookup?: boolean;
} = {}) {
  let state: MemoryState = {
    credentialCount: 0,
    users: [],
    organizations: [],
    credentials: [],
    memberships: [],
    auditEvents: []
  };
  let transactionTail: Promise<unknown> = Promise.resolve();
  const transactions: Array<{ isolationLevel: "Serializable" }> = [];

  const store: LocalCredentialStore = {
    transaction<T>(
      operation: (transaction: FirstOwnerBootstrapTransaction) => Promise<T>,
      transactionOptions: { isolationLevel: "Serializable" }
    ): Promise<T> {
      transactions.push({ ...transactionOptions });
      const running = transactionTail.then(async () => {
        const draft: MemoryState = {
          credentialCount: state.credentialCount,
          users: [...state.users],
          organizations: [...state.organizations],
          credentials: [...state.credentials],
          memberships: [...state.memberships],
          auditEvents: [...state.auditEvents]
        };
        const transaction: FirstOwnerBootstrapTransaction = {
          async countLocalCredentials() {
            return draft.credentialCount;
          },
          async createUser(input) {
            const user = { id: "user-1", ...input, authVersion: 1 };
            draft.users.push(user);
            return {
              id: user.id,
              email: user.email,
              displayName: user.displayName,
              authVersion: user.authVersion
            };
          },
          async createOrganization(input) {
            const organization = { id: "org-1", ...input };
            draft.organizations.push(organization);
            return {
              id: organization.id,
              name: organization.name,
              slug: organization.slug,
              timezone: organization.timezone
            };
          },
          async createLocalCredential(input) {
            draft.credentials.push(input);
            draft.credentialCount += 1;
          },
          async createOwnerMembership(input) {
            draft.memberships.push(input);
          },
          async createAuditEvent(input) {
            if (options.failAudit) {
              throw new Error("database detail that must not escape");
            }
            draft.auditEvents.push(input);
          }
        };

        const result = await operation(transaction);
        state = draft;
        return result;
      });
      transactionTail = running.then(
        () => undefined,
        () => undefined
      );
      return running;
    },
    findAuthenticationRecord: vi.fn(async () => {
      if (options.failLookup) {
        throw new Error("database detail that must not escape");
      }
      return options.authenticationRecord ?? null;
    }),
    recordFailedAuthentication: vi.fn(async () => {
      if (options.failFailureUpdate) {
        throw new Error("database detail that must not escape");
      }
      return true;
    }),
    resetFailedAuthentications: vi.fn(async () => undefined)
  };

  return {
    store,
    transactions,
    getState: () => state
  };
}

function createCrypto(overrides: Partial<LocalCredentialCrypto> = {}): LocalCredentialCrypto & {
  normalizeEmail: ReturnType<typeof vi.fn<LocalCredentialCrypto["normalizeEmail"]>>;
  hashPassword: ReturnType<typeof vi.fn<LocalCredentialCrypto["hashPassword"]>>;
  verifyPassword: ReturnType<typeof vi.fn<LocalCredentialCrypto["verifyPassword"]>>;
  safeEqualSecret: ReturnType<typeof vi.fn<LocalCredentialCrypto["safeEqualSecret"]>>;
} {
  return {
    normalizeEmail: vi.fn((email: string) => email.trim().toLowerCase()),
    hashPassword: vi.fn(async () => passwordHash),
    verifyPassword: vi.fn(async () => true),
    safeEqualSecret: vi.fn((candidate: string, expected: string) => candidate === expected),
    ...overrides
  } as LocalCredentialCrypto & {
    normalizeEmail: ReturnType<typeof vi.fn<LocalCredentialCrypto["normalizeEmail"]>>;
    hashPassword: ReturnType<typeof vi.fn<LocalCredentialCrypto["hashPassword"]>>;
    verifyPassword: ReturnType<typeof vi.fn<LocalCredentialCrypto["verifyPassword"]>>;
    safeEqualSecret: ReturnType<typeof vi.fn<LocalCredentialCrypto["safeEqualSecret"]>>;
  };
}

function authenticationRecord(overrides: {
  failedAttempts?: number;
  lockedUntil?: Date | null;
  disabledAt?: Date | null;
} = {}): LocalAuthenticationRecord {
  return {
    user: {
      id: "user-1",
      email: "owner@example.com",
      normalizedEmail: "owner@example.com",
      displayName: "Owner",
      disabledAt: overrides.disabledAt ?? null,
      authVersion: 3
    },
    credential: {
      id: "credential-1",
      passwordHash,
      passwordChangedAt: new Date(now.getTime() - 60_000),
      failedAttempts: overrides.failedAttempts ?? 0,
      lockedUntil: overrides.lockedUntil ?? null
    }
  };
}
