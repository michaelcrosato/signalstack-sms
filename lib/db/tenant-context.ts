import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  assertRuntimeDatabasePosture,
  inspectRuntimeDatabasePostureForClient
} from "@/lib/db/runtime-posture";

const TENANT_ROLE = "signalstack_runtime";
const CONTROL_ROLE = "signalstack_control";
const WORKER_DISPATCH_ROLE = "signalstack_worker";

export type TenantDatabaseContext = Readonly<{
  orgId: string;
  userId?: string;
}>;

export type AuthDatabaseContext = Readonly<{
  orgId?: string;
  orgSlug?: string;
  userId?: string;
  sessionHash?: string;
  tokenHash?: string;
  loginEmail?: string;
  purpose?: AuthDatabasePurpose;
}>;

export type AuthDatabasePurpose =
  | "login"
  | "bootstrap"
  | "session"
  | "invite"
  | "password_reset"
  | "organization_create"
  | "operator";

type TenantFrame = Readonly<{
  context: TenantDatabaseContext;
  tx: Prisma.TransactionClient;
  client: PrismaClient;
}>;

const tenantStorage = new AsyncLocalStorage<TenantFrame>();

/**
 * Run one short, database-only unit of work with a transaction-local tenant frame.
 *
 * The fixed runtime role is deliberately selected even when the connection belongs to a migration
 * owner (for example in local integration tests). Production login roles must be members of this
 * NOLOGIN capability role. All context settings are local to the transaction, so a pooled connection
 * cannot retain a tenant after commit or rollback.
 */
export async function withTenantTransaction<T>(
  context: TenantDatabaseContext,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: Readonly<{
    client?: PrismaClient;
    attest?: boolean;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  }> = {}
): Promise<T> {
  const normalized = normalizeTenantContext(context);
  const client = options.client ?? prisma;
  const active = tenantStorage.getStore();

  if (active) {
    assertNestedTenantContext(active.context, normalized);
    if (active.client !== client) {
      throw new Error("Nested tenant database context cannot switch clients.");
    }
    return fn(active.tx);
  }

  // Focused unit tests commonly replace the Prisma module with a narrow model stub. They still prove
  // repository scoping arguments, while real RUN_DB_TESTS coverage exercises the transaction/role path.
  // No non-test process may bypass a missing transaction primitive.
  if (
    process.env.NODE_ENV === "test" &&
    client === prisma &&
    (typeof prisma.$transaction !== "function" || typeof prisma.$queryRaw !== "function")
  ) {
    return runWithFocusedTestClient(fn);
  }

  if (options.attest !== false) {
    if (client === prisma) {
      await assertRuntimeDatabasePosture();
    } else {
      await inspectRuntimeDatabasePostureForClient(client);
    }
  }
  return client.$transaction(
    async (tx) => {
      await selectFixedRole(tx, TENANT_ROLE);
      await setDatabaseContext(tx, {
        orgId: normalized.orgId,
        userId: normalized.userId
      });
      return tenantStorage.run({ context: normalized, tx, client }, () => fn(tx));
    },
    options.isolationLevel ? { isolationLevel: options.isolationLevel } : undefined
  );
}

/**
 * Run a narrowly scoped identity/control-plane operation. RLS policies for sessions, memberships,
 * organizations, and auth tokens key off the exact values supplied here. Empty values are written for
 * every omitted field so a reused connection always begins with a complete, deterministic frame.
 */
export async function withAuthDatabaseContext<T>(
  context: AuthDatabaseContext,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: Readonly<{
    isolationLevel?: Prisma.TransactionIsolationLevel;
  }> = {}
): Promise<T> {
  const normalized = normalizeAuthContext(context);
  if (
    process.env.NODE_ENV === "test" &&
    (typeof prisma.$transaction !== "function" || typeof prisma.$queryRaw !== "function")
  ) {
    return runWithFocusedTestClient(fn);
  }
  await assertRuntimeDatabasePosture();
  return prisma.$transaction(
    async (tx) => {
      await selectFixedRole(tx, CONTROL_ROLE);
      await setDatabaseContext(tx, normalized);
      return fn(tx);
    },
    options.isolationLevel ? { isolationLevel: options.isolationLevel } : undefined
  );
}

/**
 * Invoke one fixed worker-dispatch database capability without tenant context. The worker role is
 * NOINHERIT and receives EXECUTE only on reviewed dispatch functions; it has no direct table access.
 */
export async function withWorkerDispatchTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (
    process.env.NODE_ENV === "test" &&
    (typeof prisma.$transaction !== "function" || typeof prisma.$queryRaw !== "function")
  ) {
    return runWithFocusedTestClient(fn);
  }

  await assertRuntimeDatabasePosture();
  return prisma.$transaction(async (tx) => {
    await selectFixedRole(tx, WORKER_DISPATCH_ROLE);
    await setDatabaseContext(tx, {});
    return fn(tx);
  });
}

export function currentTenantDatabaseContext(): TenantDatabaseContext | null {
  return tenantStorage.getStore()?.context ?? null;
}

/** Strengthen an already-selected control transaction after a token/session reveals its tenant. */
export async function setAuthTransactionContext(
  tx: Prisma.TransactionClient,
  context: AuthDatabaseContext
): Promise<void> {
  await setDatabaseContext(tx, normalizeAuthContext(context));
}

async function setDatabaseContext(
  tx: Prisma.TransactionClient,
  context: AuthDatabaseContext
): Promise<void> {
  await tx.$queryRaw`
    SELECT
      set_config('app.current_org_id', ${context.orgId ?? ""}, true),
      set_config('app.current_org_slug', ${context.orgSlug ?? ""}, true),
      set_config('app.current_user_id', ${context.userId ?? ""}, true),
      set_config('app.current_session_hash', ${context.sessionHash ?? ""}, true),
      set_config('app.current_token_hash', ${context.tokenHash ?? ""}, true),
      set_config('app.current_login_email', ${context.loginEmail ?? ""}, true),
      set_config('app.control_purpose', ${context.purpose ?? ""}, true)
  `;
}

async function selectFixedRole(
  tx: Prisma.TransactionClient,
  role: typeof TENANT_ROLE | typeof CONTROL_ROLE | typeof WORKER_DISPATCH_ROLE
): Promise<void> {
  if (role === TENANT_ROLE) {
    await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_runtime");
    return;
  }
  if (role === WORKER_DISPATCH_ROLE) {
    await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_worker");
    return;
  }
  await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_control");
}

function normalizeTenantContext(context: TenantDatabaseContext): TenantDatabaseContext {
  const orgId = normalizeIdentifier(context.orgId, "orgId");
  const userId = context.userId === undefined ? undefined : normalizeIdentifier(context.userId, "userId");
  return Object.freeze({ orgId, ...(userId ? { userId } : {}) });
}

function normalizeAuthContext(context: AuthDatabaseContext): AuthDatabaseContext {
  const normalized = {
    orgId: normalizeOptionalEvidence(context.orgId, "orgId", 191),
    orgSlug: normalizeOptionalEvidence(context.orgSlug, "orgSlug", 191),
    userId: normalizeOptionalEvidence(context.userId, "userId", 191),
    sessionHash: normalizeOptionalEvidence(context.sessionHash, "sessionHash", 512),
    tokenHash: normalizeOptionalEvidence(context.tokenHash, "tokenHash", 512),
    loginEmail: normalizeOptionalEvidence(context.loginEmail, "loginEmail", 320),
    purpose: normalizePurpose(context.purpose)
  };
  if (!Object.values(normalized).some(Boolean)) {
    throw new Error("Auth database context requires bounded evidence.");
  }
  return Object.freeze(normalized);
}

function normalizePurpose(value: AuthDatabasePurpose | undefined): AuthDatabasePurpose | undefined {
  if (value === undefined) {
    return undefined;
  }
  const purposes: readonly AuthDatabasePurpose[] = [
    "login",
    "bootstrap",
    "session",
    "invite",
    "password_reset",
    "organization_create",
    "operator"
  ];
  if (!purposes.includes(value)) {
    throw new Error("Auth database purpose is invalid.");
  }
  return value;
}

function normalizeIdentifier(value: string, name: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 191 || value.trim() !== value) {
    throw new Error(`Tenant database ${name} is invalid.`);
  }
  return value;
}

function normalizeOptionalEvidence(
  value: string | undefined,
  name: string,
  maximumLength: number
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximumLength ||
    value.trim() !== value ||
    Array.from(value).some((character) => (character.codePointAt(0) ?? 0) < 32)
  ) {
    throw new Error(`Auth database ${name} is invalid.`);
  }
  return value;
}

function assertNestedTenantContext(
  active: TenantDatabaseContext,
  requested: TenantDatabaseContext
): void {
  if (active.orgId !== requested.orgId) {
    throw new Error("Nested tenant database context cannot switch organizations.");
  }
  if (requested.userId !== undefined && active.userId !== requested.userId) {
    throw new Error("Nested tenant database context cannot switch users.");
  }
}

async function runWithFocusedTestClient<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (typeof prisma.$transaction !== "function") {
    return fn(prisma as unknown as Prisma.TransactionClient);
  }
  return prisma.$transaction(async (transaction) => {
    const merged = new Proxy(transaction as object, {
      get(target, property, receiver) {
        const transactionValue = Reflect.get(target, property, receiver) as unknown;
        const baseValue = Reflect.get(prisma as object, property) as unknown;
        if (isObject(transactionValue) && isObject(baseValue)) {
          return new Proxy(transactionValue, {
            get(modelTarget, modelProperty, modelReceiver) {
              return (
                Reflect.get(modelTarget, modelProperty, modelReceiver) ??
                Reflect.get(baseValue, modelProperty)
              );
            }
          });
        }
        return transactionValue ?? baseValue;
      }
    });
    return fn(merged as Prisma.TransactionClient);
  });
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
