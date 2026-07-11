import { MembershipRole, MembershipStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashLocalSessionToken, hashOpaqueToken } from "@/lib/auth/crypto";
import {
  createLocalSession,
  resolveLocalSession,
  revokeAllLocalSessions,
  revokeLocalSession,
  switchLocalSessionOrganization,
  type CreateStoredLocalSessionInput,
  type LocalSessionDependencyOverrides,
  type LocalSessionPrincipal,
  type LocalSessionStore,
  type RefreshStoredLocalSessionInput,
  type StoredLocalSession,
  type SwitchStoredLocalSessionOrgInput
} from "@/lib/auth/local-session";

const BASE_TIME = new Date("2026-07-10T20:00:00.000Z");
const RAW_TOKEN = `ss_session_${"a".repeat(43)}`;
const SECOND_RAW_TOKEN = `ss_session_${"b".repeat(43)}`;
const IDLE_TTL_MS = 30 * 60_000;
const ABSOLUTE_TTL_MS = 24 * 60 * 60_000;
const REFRESH_INTERVAL_MS = 5 * 60_000;

afterEach(() => {
  vi.unstubAllEnvs();
});

type MutableStoredSession = {
  -readonly [Key in keyof StoredLocalSession]: StoredLocalSession[Key];
};
type MutablePrincipal = {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    disabledAt: Date | null;
    authVersion: number;
  };
  org: {
    id: string;
    slug: string;
    name: string;
    demoMode: boolean;
  };
  membership: {
    role: MembershipRole;
    status: MembershipStatus;
  };
};

class MemoryLocalSessionStore implements LocalSessionStore {
  readonly principals = new Map<string, MutablePrincipal>();
  readonly sessionsByHash = new Map<string, MutableStoredSession>();
  createdInput: CreateStoredLocalSessionInput | null = null;
  refreshCalls = 0;
  switchCalls = 0;
  allowRefresh = true;
  beforeCreate: (() => void) | null = null;

  principalKey(userId: string, orgId: string) {
    return `${userId}:${orgId}`;
  }

  addPrincipal(principal: MutablePrincipal) {
    this.principals.set(this.principalKey(principal.user.id, principal.org.id), principal);
  }

  seedSession(rawToken: string, overrides: Partial<MutableStoredSession> = {}) {
    const session: MutableStoredSession = {
      id: `session-${this.sessionsByHash.size + 1}`,
      userId: "user-1",
      orgId: "org-1",
      authVersion: 1,
      createdAt: new Date(BASE_TIME),
      lastSeenAt: new Date(BASE_TIME),
      idleExpiresAt: new Date(BASE_TIME.getTime() + IDLE_TTL_MS),
      absoluteExpiresAt: new Date(BASE_TIME.getTime() + ABSOLUTE_TTL_MS),
      revokedAt: null,
      ...overrides
    };
    this.sessionsByHash.set(hashOpaqueToken(rawToken), session);
    return session;
  }

  async findPrincipal(userId: string, orgId: string): Promise<LocalSessionPrincipal | null> {
    return this.principals.get(this.principalKey(userId, orgId)) ?? null;
  }

  async createSession(input: CreateStoredLocalSessionInput): Promise<StoredLocalSession | null> {
    this.beforeCreate?.();
    const principal = this.principals.get(this.principalKey(input.userId, input.orgId));
    if (
      !principal ||
      principal.user.disabledAt ||
      principal.user.authVersion !== input.authVersion ||
      principal.membership.status !== MembershipStatus.ACTIVE
    ) {
      return null;
    }
    this.createdInput = input;
    const session: MutableStoredSession = {
      id: `session-${this.sessionsByHash.size + 1}`,
      userId: input.userId,
      orgId: input.orgId,
      authVersion: input.authVersion,
      createdAt: input.createdAt,
      lastSeenAt: input.lastSeenAt,
      idleExpiresAt: input.idleExpiresAt,
      absoluteExpiresAt: input.absoluteExpiresAt,
      revokedAt: null
    };
    this.sessionsByHash.set(input.tokenHash, session);
    return session;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<StoredLocalSession | null> {
    return this.sessionsByHash.get(tokenHash) ?? null;
  }

  async refreshSession(input: RefreshStoredLocalSessionInput): Promise<boolean> {
    this.refreshCalls += 1;
    if (!this.allowRefresh) {
      return false;
    }
    const session = [...this.sessionsByHash.values()].find((candidate) => candidate.id === input.sessionId);
    if (
      !session ||
      session.userId !== input.userId ||
      session.orgId !== input.orgId ||
      session.authVersion !== input.authVersion ||
      session.revokedAt ||
      session.idleExpiresAt.getTime() <= input.now.getTime() ||
      session.absoluteExpiresAt.getTime() <= input.now.getTime()
    ) {
      return false;
    }
    session.lastSeenAt = input.lastSeenAt;
    session.idleExpiresAt = input.idleExpiresAt;
    return true;
  }

  async revokeSessionByTokenHash(tokenHash: string, now: Date): Promise<boolean> {
    const session = this.sessionsByHash.get(tokenHash);
    if (!session || session.revokedAt) {
      return false;
    }
    session.revokedAt = now;
    return true;
  }

  async revokeAllSessions(userId: string, now: Date): Promise<number> {
    const users = new Set<MutablePrincipal["user"]>();
    for (const principal of this.principals.values()) {
      if (principal.user.id === userId) {
        users.add(principal.user);
      }
    }
    if (users.size === 0) {
      return 0;
    }
    for (const user of users) {
      user.authVersion += 1;
    }

    let revoked = 0;
    for (const session of this.sessionsByHash.values()) {
      if (session.userId === userId && !session.revokedAt) {
        session.revokedAt = now;
        revoked += 1;
      }
    }
    return revoked;
  }

  async switchSessionOrg(input: SwitchStoredLocalSessionOrgInput): Promise<boolean> {
    this.switchCalls += 1;
    const target = this.principals.get(this.principalKey(input.userId, input.toOrgId));
    const session = [...this.sessionsByHash.values()].find((candidate) => candidate.id === input.sessionId);
    if (
      !target ||
      target.membership.status !== MembershipStatus.ACTIVE ||
      target.user.disabledAt ||
      target.user.authVersion !== input.authVersion ||
      !session ||
      session.userId !== input.userId ||
      session.orgId !== input.fromOrgId ||
      session.authVersion !== input.authVersion ||
      session.revokedAt ||
      session.idleExpiresAt.getTime() <= input.now.getTime() ||
      session.absoluteExpiresAt.getTime() <= input.now.getTime()
    ) {
      return false;
    }
    session.orgId = input.toOrgId;
    return true;
  }
}

function createPrincipal(
  input: Partial<{
    userId: string;
    orgId: string;
    role: MembershipRole;
    status: MembershipStatus;
    disabledAt: Date | null;
    authVersion: number;
  }> = {},
  sharedUser?: MutablePrincipal["user"]
): MutablePrincipal {
  const userId = input.userId ?? "user-1";
  const orgId = input.orgId ?? "org-1";
  return {
    user:
      sharedUser ??
      {
        id: userId,
        email: "owner@example.com",
        displayName: "Owner",
        disabledAt: input.disabledAt ?? null,
        authVersion: input.authVersion ?? 1
      },
    org: {
      id: orgId,
      slug: `${orgId}-slug`,
      name: `${orgId} name`,
      demoMode: false
    },
    membership: {
      role: input.role ?? MembershipRole.OWNER,
      status: input.status ?? MembershipStatus.ACTIVE
    }
  };
}

function createFixture() {
  const store = new MemoryLocalSessionStore();
  const principal = createPrincipal();
  store.addPrincipal(principal);
  let now = new Date(BASE_TIME);
  const dependencies: LocalSessionDependencyOverrides = {
    store,
    now: () => new Date(now),
    createToken: () => ({ token: RAW_TOKEN, tokenHash: hashOpaqueToken(RAW_TOKEN) }),
    policy: {
      idleTtlMs: IDLE_TTL_MS,
      absoluteTtlMs: ABSOLUTE_TTL_MS,
      lastSeenRefreshIntervalMs: REFRESH_INTERVAL_MS
    }
  };
  return {
    store,
    principal,
    dependencies,
    setNow(value: Date) {
      now = new Date(value);
    }
  };
}

describe("local opaque sessions", () => {
  it("creates an opaque session, stores only its hash, and returns raw token material only at creation", async () => {
    const fixture = createFixture();
    const created = await createLocalSession({ userId: "user-1", orgId: "org-1" }, fixture.dependencies);

    expect(created.token).toBe(RAW_TOKEN);
    expect(created.session).toMatchObject({
      sessionId: "session-1",
      userId: "user-1",
      orgId: "org-1",
      role: MembershipRole.OWNER,
      lastSeenAt: BASE_TIME,
      idleExpiresAt: new Date(BASE_TIME.getTime() + IDLE_TTL_MS),
      absoluteExpiresAt: new Date(BASE_TIME.getTime() + ABSOLUTE_TTL_MS)
    });
    expect(fixture.store.createdInput?.tokenHash).toBe(hashOpaqueToken(RAW_TOKEN));
    expect(JSON.stringify(fixture.store.createdInput)).not.toContain(RAW_TOKEN);
    expect(created.session).not.toHaveProperty("token");
    expect(created.session).not.toHaveProperty("tokenHash");
  });

  it.each([
    ["disabled user", { disabledAt: BASE_TIME }],
    ["inactive membership", { status: MembershipStatus.SUSPENDED }]
  ])("refuses creation for a %s", async (_label, principalOverrides) => {
    const fixture = createFixture();
    fixture.store.principals.clear();
    fixture.store.addPrincipal(createPrincipal(principalOverrides));

    await expect(
      createLocalSession({ userId: "user-1", orgId: "org-1" }, fixture.dependencies)
    ).rejects.toThrow("not eligible");
    expect(fixture.store.createdInput).toBeNull();
  });

  it("rejects a stale authenticated generation and a reset that wins during session creation", async () => {
    const stale = createFixture();
    stale.principal.user.authVersion = 2;
    await expect(
      createLocalSession(
        { userId: "user-1", orgId: "org-1", expectedAuthVersion: 1 },
        stale.dependencies
      )
    ).rejects.toThrow("not eligible");
    expect(stale.store.createdInput).toBeNull();

    const raced = createFixture();
    raced.store.beforeCreate = () => {
      raced.principal.user.authVersion += 1;
    };
    await expect(
      createLocalSession(
        { userId: "user-1", orgId: "org-1", expectedAuthVersion: 1 },
        raced.dependencies
      )
    ).rejects.toThrow("not eligible");
    expect(raced.store.createdInput).toBeNull();
  });

  it("resolves an active membership without exposing token or hash material", async () => {
    const fixture = createFixture();
    fixture.store.seedSession(RAW_TOKEN);

    const resolved = await resolveLocalSession(RAW_TOKEN, fixture.dependencies);

    expect(resolved).toMatchObject({
      sessionId: "session-1",
      userId: "user-1",
      email: "owner@example.com",
      orgId: "org-1",
      role: MembershipRole.OWNER
    });
    expect(resolved).not.toHaveProperty("token");
    expect(resolved).not.toHaveProperty("tokenHash");
    expect(JSON.stringify(resolved)).not.toContain(RAW_TOKEN);
  });

  it("cannot resolve a stored session after the operator rotates the session hashing key", async () => {
    const fixture = createFixture();
    const firstKey = "session-lookup-key-a-0123456789abcdef";
    const secondKey = "session-lookup-key-b-0123456789abcdef";
    const firstHasher = (token: string) => hashLocalSessionToken(token, firstKey);
    const created = await createLocalSession(
      { userId: "user-1", orgId: "org-1" },
      {
        ...fixture.dependencies,
        createToken: () => ({ token: RAW_TOKEN, tokenHash: firstHasher(RAW_TOKEN) }),
        hashToken: firstHasher
      }
    );

    await expect(
      resolveLocalSession(created.token, {
        ...fixture.dependencies,
        hashToken: (token) => hashLocalSessionToken(token, secondKey)
      })
    ).resolves.toBeNull();
    await expect(
      resolveLocalSession(created.token, { ...fixture.dependencies, hashToken: firstHasher })
    ).resolves.toMatchObject({ userId: "user-1", orgId: "org-1" });
  });

  it("uses the configured production session key and never falls back when it is absent", async () => {
    const key = "production-session-key-0123456789abcdef";
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SESSION_SECRET", key);
    const keyed = createFixture();
    const created = await createLocalSession(
      { userId: "user-1", orgId: "org-1" },
      { ...keyed.dependencies, createToken: undefined }
    );
    expect(keyed.store.createdInput?.tokenHash).toBe(hashLocalSessionToken(created.token, key));

    vi.stubEnv("AUTH_SESSION_SECRET", "");
    const missing = createFixture();
    await expect(
      createLocalSession(
        { userId: "user-1", orgId: "org-1" },
        { ...missing.dependencies, createToken: undefined }
      )
    ).rejects.toThrow("token generation failed");
    expect(missing.store.createdInput).toBeNull();
  });

  it.each([
    ["revoked", (fixture: ReturnType<typeof createFixture>) => fixture.store.seedSession(RAW_TOKEN, { revokedAt: BASE_TIME })],
    ["idle-expired", (fixture: ReturnType<typeof createFixture>) => fixture.store.seedSession(RAW_TOKEN, { idleExpiresAt: BASE_TIME })],
    ["absolute-expired", (fixture: ReturnType<typeof createFixture>) => fixture.store.seedSession(RAW_TOKEN, { absoluteExpiresAt: BASE_TIME })],
    ["stale-auth-version", (fixture: ReturnType<typeof createFixture>) => fixture.store.seedSession(RAW_TOKEN, { authVersion: 0 })],
    ["disabled-user", (fixture: ReturnType<typeof createFixture>) => {
      fixture.principal.user.disabledAt = BASE_TIME;
      fixture.store.seedSession(RAW_TOKEN);
    }],
    ["suspended-membership", (fixture: ReturnType<typeof createFixture>) => {
      fixture.principal.membership.status = MembershipStatus.SUSPENDED;
      fixture.store.seedSession(RAW_TOKEN);
    }]
  ])("fails closed for %s session evidence", async (_label, arrange) => {
    const fixture = createFixture();
    arrange(fixture);
    await expect(resolveLocalSession(RAW_TOKEN, fixture.dependencies)).resolves.toBeNull();
  });

  it("bounds last-seen writes and caps the refreshed idle expiry at absolute expiry", async () => {
    const fixture = createFixture();
    const session = fixture.store.seedSession(RAW_TOKEN);

    fixture.setNow(new Date(BASE_TIME.getTime() + REFRESH_INTERVAL_MS - 1));
    const beforeThreshold = await resolveLocalSession(RAW_TOKEN, fixture.dependencies);
    expect(beforeThreshold?.lastSeenAt).toEqual(BASE_TIME);
    expect(fixture.store.refreshCalls).toBe(0);

    const refreshTime = new Date(BASE_TIME.getTime() + REFRESH_INTERVAL_MS);
    session.absoluteExpiresAt = new Date(refreshTime.getTime() + 10 * 60_000);
    fixture.setNow(refreshTime);
    const refreshed = await resolveLocalSession(RAW_TOKEN, fixture.dependencies);
    expect(fixture.store.refreshCalls).toBe(1);
    expect(refreshed?.lastSeenAt).toEqual(refreshTime);
    expect(refreshed?.idleExpiresAt).toEqual(session.absoluteExpiresAt);

    fixture.setNow(new Date(refreshTime.getTime() + 60_000));
    await resolveLocalSession(RAW_TOKEN, fixture.dependencies);
    expect(fixture.store.refreshCalls).toBe(1);
  });

  it("fails closed if a due refresh loses its conditional update", async () => {
    const fixture = createFixture();
    fixture.store.seedSession(RAW_TOKEN);
    fixture.store.allowRefresh = false;
    fixture.setNow(new Date(BASE_TIME.getTime() + REFRESH_INTERVAL_MS));

    await expect(resolveLocalSession(RAW_TOKEN, fixture.dependencies)).resolves.toBeNull();
  });

  it("revokes one session idempotently from the token hash", async () => {
    const fixture = createFixture();
    const session = fixture.store.seedSession(RAW_TOKEN);

    await expect(revokeLocalSession(RAW_TOKEN, fixture.dependencies)).resolves.toBe(true);
    expect(session.revokedAt).toEqual(BASE_TIME);
    await expect(revokeLocalSession(RAW_TOKEN, fixture.dependencies)).resolves.toBe(false);
    await expect(revokeLocalSession("malformed token", fixture.dependencies)).resolves.toBe(false);
  });

  it("globally revokes sessions and increments the user auth version", async () => {
    const fixture = createFixture();
    const first = fixture.store.seedSession(RAW_TOKEN);
    const second = fixture.store.seedSession(SECOND_RAW_TOKEN, { id: "session-2" });

    await expect(revokeAllLocalSessions("user-1", fixture.dependencies)).resolves.toBe(2);
    expect(fixture.principal.user.authVersion).toBe(2);
    expect(first.revokedAt).toEqual(BASE_TIME);
    expect(second.revokedAt).toEqual(BASE_TIME);
    await expect(resolveLocalSession(RAW_TOKEN, fixture.dependencies)).resolves.toBeNull();
  });

  it("switches only to another active membership without rotating or returning the raw token", async () => {
    const fixture = createFixture();
    const session = fixture.store.seedSession(RAW_TOKEN);
    const secondOrg = createPrincipal(
      { orgId: "org-2", role: MembershipRole.MEMBER },
      fixture.principal.user
    );
    fixture.store.addPrincipal(secondOrg);

    const switched = await switchLocalSessionOrganization(RAW_TOKEN, "org-2", fixture.dependencies);

    expect(switched).toMatchObject({
      sessionId: session.id,
      userId: "user-1",
      orgId: "org-2",
      orgSlug: "org-2-slug",
      role: MembershipRole.MEMBER
    });
    expect(switched).not.toHaveProperty("token");
    expect(switched).not.toHaveProperty("tokenHash");
    expect(session.orgId).toBe("org-2");
    expect(fixture.store.switchCalls).toBe(1);
  });

  it("rejects organization switching without an active target membership", async () => {
    const fixture = createFixture();
    const session = fixture.store.seedSession(RAW_TOKEN);
    fixture.store.addPrincipal(
      createPrincipal(
        { orgId: "org-2", status: MembershipStatus.SUSPENDED },
        fixture.principal.user
      )
    );

    await expect(
      switchLocalSessionOrganization(RAW_TOKEN, "org-2", fixture.dependencies)
    ).resolves.toBeNull();
    expect(session.orgId).toBe("org-1");
    expect(fixture.store.switchCalls).toBe(0);
  });
});
