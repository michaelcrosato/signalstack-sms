import { describe, expect, it, vi } from "vitest";
import type {
  FirstOwnerBootstrapResult,
  LocalCredentialService
} from "@/lib/auth/local-credentials";
import {
  createOperatorAdminService,
  OperatorAdminServiceError,
  type OperatorAdminExistingIdentity,
  type OperatorAdminOrganization,
  type OperatorAdminStore,
  type OperatorAdminTransaction
} from "@/lib/auth/operator-admin-service";

const bootstrapToken = "operator-bootstrap-token-0123456789abcdef";
const password = "correct horse battery staple\n";
const passwordHash = "scrypt-hash-that-is-never-returned";
const now = new Date("2026-07-11T03:00:00.000Z");

describe("operator administrator domain service", () => {
  it("reuses first-owner bootstrap and returns only sanitized identity, organization, and role", async () => {
    const bootstrapFirstOwner = vi.fn(async () => ({
      created: true as const,
      user: {
        id: "user-bootstrap",
        email: "owner@example.test",
        displayName: "Owner",
        authVersion: 1
      },
      organization: {
        id: "org-bootstrap",
        name: "Bootstrap Organization",
        slug: "bootstrap-org",
        timezone: "America/Vancouver"
      }
    }));
    const service = createOperatorAdminService({
      firstOwnerService: { bootstrapFirstOwner },
      store: createMemoryStore().store
    });

    const result = await service.create({
      mode: "bootstrap",
      bootstrapToken,
      email: "owner@example.test",
      displayName: "Owner",
      password,
      organizationName: "Bootstrap Organization",
      organizationSlug: "bootstrap-org",
      timezone: "America/Vancouver"
    });

    expect(bootstrapFirstOwner).toHaveBeenCalledWith({
      bootstrapToken,
      email: "owner@example.test",
      displayName: "Owner",
      password,
      organizationName: "Bootstrap Organization",
      organizationSlug: "bootstrap-org",
      timezone: "America/Vancouver"
    });
    expect(result).toEqual({
      created: true,
      user: { id: "user-bootstrap", email: "owner@example.test" },
      organization: { id: "org-bootstrap", slug: "bootstrap-org" },
      role: "OWNER"
    });
    expect(JSON.stringify(result)).not.toContain(bootstrapToken);
    expect(JSON.stringify(result)).not.toContain(password);
    expect(JSON.stringify(result)).not.toContain("authVersion");
    expect(JSON.stringify(result)).not.toContain("timezone");
  });

  it("creates an enabled local owner in an exact non-demo organization without mutating password bytes", async () => {
    const memory = createMemoryStore({ pendingInviteCount: 2 });
    const hashPassword = vi.fn(async () => passwordHash);
    const service = createOperatorAdminService({
      firstOwnerService: deniedBootstrapService(),
      store: memory.store,
      now: () => now,
      crypto: { hashPassword }
    });

    const result = await service.create(recoveryInput());

    expect(hashPassword).toHaveBeenCalledWith(password);
    expect(memory.lookedUpSlugs).toEqual(["acme"]);
    expect(result).toEqual({
      created: true,
      user: { id: "user-1", email: "owner@example.test" },
      organization: { id: "org-1", slug: "acme" },
      role: "OWNER"
    });
    expect(memory.state.users).toEqual([
      {
        id: "user-1",
        email: "owner@example.test",
        normalizedEmail: "owner@example.test",
        displayName: "Recovery Owner",
        emailVerifiedAt: now,
        disabledAt: null
      }
    ]);
    expect(memory.state.credentials).toEqual([
      {
        userId: "user-1",
        passwordHash,
        passwordChangedAt: now,
        failedAttempts: 0,
        lockedUntil: null
      }
    ]);
    expect(memory.state.memberships).toEqual([
      { orgId: "org-1", userId: "user-1", role: "OWNER", status: "ACTIVE" }
    ]);
    expect(memory.state.auditEvents).toEqual([
      {
        orgId: "org-1",
        actorUserId: null,
        action: "LOCAL_OWNER_RECOVERY_CREATED",
        subjectType: "AppUser",
        subjectId: "user-1",
        metadata: {
          authMode: "local",
          source: "operator_admin_cli",
          role: "OWNER",
          revokedPendingInviteCount: 2
        }
      }
    ]);
    const serialized = JSON.stringify({ result, state: memory.state });
    expect(serialized).not.toContain(password);
    expect(JSON.stringify(result)).not.toContain(passwordHash);
    expect(JSON.stringify(memory.state.auditEvents)).not.toContain("password");
    expect(JSON.stringify(memory.state.auditEvents)).not.toContain("bootstrap");
    expect(JSON.stringify(memory.state.auditEvents)).not.toContain("email");
  });

  it("serializes concurrent duplicates and makes replay a non-mutating identity conflict", async () => {
    const memory = createMemoryStore();
    const service = createOperatorAdminService({
      firstOwnerService: deniedBootstrapService(),
      store: memory.store,
      crypto: { hashPassword: vi.fn(async () => passwordHash) }
    });

    const concurrent = await Promise.all([
      service.create(recoveryInput()),
      service.create(recoveryInput())
    ]);
    expect(concurrent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ created: true }),
        { created: false, code: "ADMIN_IDENTITY_EXISTS" }
      ])
    );

    await expect(service.create(recoveryInput())).resolves.toEqual({
      created: false,
      code: "ADMIN_IDENTITY_EXISTS"
    });
    expect(memory.state.users).toHaveLength(1);
    expect(memory.state.credentials).toHaveLength(1);
    expect(memory.state.memberships).toHaveLength(1);
    expect(memory.state.auditEvents).toHaveLength(1);
    expect(memory.transactionOptions).toEqual([
      { isolationLevel: "Serializable" },
      { isolationLevel: "Serializable" },
      { isolationLevel: "Serializable" }
    ]);
  });

  it.each([
    { disabledAt: null, hasLocalCredential: true },
    { disabledAt: null, hasLocalCredential: false },
    { disabledAt: now, hasLocalCredential: false }
  ])("never overwrites or adopts an existing identity: %o", async (existing) => {
    const memory = createMemoryStore({
      existingIdentity: { id: "foreign-user", ...existing }
    });
    const service = createOperatorAdminService({
      firstOwnerService: deniedBootstrapService(),
      store: memory.store,
      crypto: { hashPassword: vi.fn(async () => passwordHash) }
    });

    await expect(service.create(recoveryInput())).resolves.toEqual({
      created: false,
      code: "ADMIN_IDENTITY_EXISTS"
    });
    expect(memory.state.users).toHaveLength(0);
    expect(memory.state.credentials).toHaveLength(0);
    expect(memory.state.memberships).toHaveLength(0);
    expect(memory.state.auditEvents).toHaveLength(0);
  });

  it("distinguishes missing and demo organizations without creating identity material", async () => {
    for (const testCase of [
      { organization: null, code: "ADMIN_ORGANIZATION_NOT_FOUND" },
      {
        organization: { id: "org-demo", slug: "acme", demoMode: true },
        code: "ADMIN_ORGANIZATION_NOT_ELIGIBLE"
      }
    ] as const) {
      const memory = createMemoryStore({ organization: testCase.organization });
      const service = createOperatorAdminService({
        firstOwnerService: deniedBootstrapService(),
        store: memory.store,
        crypto: { hashPassword: vi.fn(async () => passwordHash) }
      });

      await expect(service.create(recoveryInput())).resolves.toEqual({
        created: false,
        code: testCase.code
      });
      expect(memory.state.users).toHaveLength(0);
      expect(memory.state.credentials).toHaveLength(0);
      expect(memory.state.memberships).toHaveLength(0);
      expect(memory.state.auditEvents).toHaveLength(0);
    }
  });

  it("rejects malformed email, display name, exact slug, and password policy before writes", async () => {
    const memory = createMemoryStore();
    const hashPassword = vi.fn(async (candidate: string) => {
      if (candidate === "short") {
        throw new Error(`must not escape ${candidate}`);
      }
      return passwordHash;
    });
    const service = createOperatorAdminService({
      firstOwnerService: deniedBootstrapService(),
      store: memory.store,
      crypto: { hashPassword }
    });

    await expect(service.create({ ...recoveryInput(), email: "not-an-email" })).resolves.toEqual({
      created: false,
      code: "ADMIN_INPUT_INVALID"
    });
    await expect(service.create({ ...recoveryInput(), displayName: "   " })).resolves.toEqual({
      created: false,
      code: "ADMIN_INPUT_INVALID"
    });
    await expect(service.create({ ...recoveryInput(), organizationSlug: " Acme " })).resolves.toEqual({
      created: false,
      code: "ADMIN_INPUT_INVALID"
    });
    await expect(service.create({ ...recoveryInput(), password: "short" })).resolves.toEqual({
      created: false,
      code: "ADMIN_INPUT_INVALID"
    });
    expect(memory.transactionOptions).toHaveLength(0);
  });

  it("retries bounded serializable conflicts and sanitizes terminal storage failures", async () => {
    const memory = createMemoryStore({ serializableFailures: 1 });
    const service = createOperatorAdminService({
      firstOwnerService: deniedBootstrapService(),
      store: memory.store,
      crypto: { hashPassword: vi.fn(async () => passwordHash) }
    });
    await expect(service.create(recoveryInput())).resolves.toMatchObject({ created: true });
    expect(memory.transactionAttempts).toBe(2);

    const failed = createMemoryStore({ terminalFailure: true });
    const failedService = createOperatorAdminService({
      firstOwnerService: deniedBootstrapService(),
      store: failed.store,
      crypto: { hashPassword: vi.fn(async () => passwordHash) }
    });
    await expect(failedService.create(recoveryInput())).rejects.toEqual(
      new OperatorAdminServiceError()
    );
  });
});

type MemoryState = {
  users: Array<Record<string, unknown>>;
  credentials: Array<Record<string, unknown>>;
  memberships: Array<Record<string, unknown>>;
  auditEvents: Array<Record<string, unknown>>;
  identities: Map<string, OperatorAdminExistingIdentity>;
};

function createMemoryStore(options: {
  organization?: OperatorAdminOrganization | null;
  existingIdentity?: OperatorAdminExistingIdentity;
  serializableFailures?: number;
  terminalFailure?: boolean;
  pendingInviteCount?: number;
} = {}) {
  const organization =
    options.organization === undefined
      ? { id: "org-1", slug: "acme", demoMode: false }
      : options.organization;
  let state: MemoryState = {
    users: [],
    credentials: [],
    memberships: [],
    auditEvents: [],
    identities: new Map(
      options.existingIdentity
        ? [["owner@example.test", options.existingIdentity]]
        : []
    )
  };
  let transactionTail: Promise<unknown> = Promise.resolve();
  let transactionAttempts = 0;
  const transactionOptions: Array<{ isolationLevel: "Serializable" }> = [];
  const lookedUpSlugs: string[] = [];

  const store: OperatorAdminStore = {
    transaction(operation, settings) {
      transactionAttempts += 1;
      transactionOptions.push(settings);
      if (transactionAttempts <= (options.serializableFailures ?? 0)) {
        return Promise.reject(Object.assign(new Error("database serialization detail"), { code: "P2034" }));
      }
      if (options.terminalFailure) {
        return Promise.reject(new Error(`database detail with ${password}`));
      }

      const running = transactionTail.then(async () => {
        const draft: MemoryState = {
          users: state.users.map((value) => ({ ...value })),
          credentials: state.credentials.map((value) => ({ ...value })),
          memberships: state.memberships.map((value) => ({ ...value })),
          auditEvents: state.auditEvents.map((value) => ({ ...value })),
          identities: new Map(state.identities)
        };
        const transaction: OperatorAdminTransaction = {
          async findOrganizationByExactSlug(slug) {
            lookedUpSlugs.push(slug);
            return organization?.slug === slug ? organization : null;
          },
          async findIdentityByNormalizedEmail(normalizedEmail) {
            return draft.identities.get(normalizedEmail) ?? null;
          },
          async createEnabledUser(input) {
            if (draft.identities.has(input.normalizedEmail)) {
              throw Object.assign(new Error("unique detail"), { code: "P2002" });
            }
            const user = { id: `user-${draft.users.length + 1}`, ...input };
            draft.users.push(user);
            draft.identities.set(input.normalizedEmail, {
              id: user.id,
              disabledAt: null,
              hasLocalCredential: false
            });
            return { id: user.id, email: user.email };
          },
          async createLocalCredential(input) {
            draft.credentials.push(input);
            const user = draft.users.find((candidate) => candidate.id === input.userId);
            if (user) {
              const normalizedEmail = String(user.normalizedEmail);
              const identity = draft.identities.get(normalizedEmail)!;
              draft.identities.set(normalizedEmail, { ...identity, hasLocalCredential: true });
            }
          },
          async createActiveOwnerMembership(input) {
            draft.memberships.push(input);
          },
          async revokePendingInvitesForEmail() {
            return options.pendingInviteCount ?? 0;
          },
          async createSecretFreeAuditEvent(input) {
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
    }
  };

  return {
    store,
    get state() {
      return state;
    },
    transactionOptions,
    lookedUpSlugs,
    get transactionAttempts() {
      return transactionAttempts;
    }
  };
}

function recoveryInput() {
  return {
    mode: "existing-org" as const,
    email: "  Owner@Example.Test ",
    displayName: "  Recovery Owner  ",
    password,
    organizationSlug: "acme"
  };
}

function deniedBootstrapService(): Pick<LocalCredentialService, "bootstrapFirstOwner"> {
  return {
    bootstrapFirstOwner: vi.fn(
      async (): Promise<FirstOwnerBootstrapResult> => ({
        created: false,
        code: "BOOTSTRAP_DENIED"
      })
    )
  };
}
