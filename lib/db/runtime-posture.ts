import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  ordinaryTenantTables,
  protectedTenantTables
} from "@/lib/db/tenant-manifest";

type RuntimeRoleRow = Readonly<{
  roleName: string;
  canLogin: boolean;
  superuser: boolean;
  bypassRls: boolean;
  inheritsPrivileges: boolean;
  ownsProtectedTables: bigint | number;
  runtimeMember: boolean;
  ownerMember: boolean;
}>;

type BoundaryCountRow = Readonly<{
  protectedCount: bigint | number;
  rlsCount: bigint | number;
  forcedCount: bigint | number;
  runtimePolicyCount: bigint | number;
  publicPrivilegeCount: bigint | number;
}>;

type RuntimePolicyRow = Readonly<{
  tableName: string;
  policyName: string;
  command: string;
  permissive: string;
  roles: string[];
  usingExpression: string | null;
  checkExpression: string | null;
}>;

type DispatchCapabilityRow = Readonly<{
  functionName: string;
  securityDefiner: boolean;
  settings: string[] | null;
  publicExecute: boolean;
  workerExecute: boolean;
  runtimeExecute: boolean;
  controlExecute: boolean;
  webExecute: boolean;
  ownerMember: boolean;
}>;

type ApiKeyControlPolicyRow = Readonly<{
  policyName: string;
  command: string;
  permissive: string;
  roles: string[];
  usingExpression: string | null;
  checkExpression: string | null;
  controlSelect: boolean;
  controlInsert: boolean;
  controlUpdate: boolean;
  controlDelete: boolean;
  publicPrivilege: boolean;
}>;

let posturePromise: Promise<void> | undefined;

/** Refuse production traffic unless the connected login is a non-owner RLS-bound runtime identity. */
export function assertRuntimeDatabasePosture(): Promise<void> {
  if (!runtimePostureIsRequired()) {
    return Promise.resolve();
  }
  posturePromise ??= inspectRuntimeDatabasePosture(prisma);
  return posturePromise;
}

export function inspectRuntimeDatabasePostureForClient(client: PrismaClient): Promise<void> {
  return inspectRuntimeDatabasePosture(client);
}

export function resetRuntimeDatabasePostureForTests(): void {
  posturePromise = undefined;
}

export function runtimePostureIsRequired(
  env: Record<string, string | undefined> = process.env
): boolean {
  const appEnvironment = env.APP_ENV?.trim().toLowerCase();
  return (
    env.DATABASE_RLS_ENFORCED?.trim().toLowerCase() === "true" ||
    appEnvironment === "production" ||
    appEnvironment === "prod"
  );
}

async function inspectRuntimeDatabasePosture(client: PrismaClient): Promise<void> {
  if (
    process.env.MIGRATION_DATABASE_URL &&
    process.env.DATABASE_URL &&
    process.env.MIGRATION_DATABASE_URL === process.env.DATABASE_URL
  ) {
    throw new Error("Runtime and migration database credentials must be distinct.");
  }

  const [role] = await client.$queryRaw<RuntimeRoleRow[]>`
    SELECT
      current_user AS "roleName",
      roles.rolcanlogin AS "canLogin",
      roles.rolsuper AS "superuser",
      roles.rolbypassrls AS "bypassRls",
      roles.rolinherit AS "inheritsPrivileges",
      pg_has_role(current_user, 'signalstack_runtime', 'MEMBER') AS "runtimeMember",
      pg_has_role(current_user, 'signalstack_owner', 'MEMBER') AS "ownerMember",
      (
        SELECT count(*)
        FROM pg_class relations
        JOIN pg_namespace namespaces ON namespaces.oid = relations.relnamespace
        WHERE namespaces.nspname = current_schema()
          AND relations.relkind IN ('r', 'p')
          AND pg_get_userbyid(relations.relowner) = current_user
          AND relations.relname = ANY(${[...protectedTenantTables]})
      ) AS "ownsProtectedTables"
    FROM pg_roles roles
    WHERE roles.rolname = current_user
  `;

  if (
    !role ||
    !role.canLogin ||
    role.superuser ||
    role.bypassRls ||
    role.inheritsPrivileges ||
    !role.runtimeMember ||
    role.ownerMember ||
    Number(role.ownsProtectedTables) !== 0
  ) {
    throw new Error("Runtime database role does not satisfy the tenant-boundary posture.");
  }

  const [boundary] = await client.$queryRaw<BoundaryCountRow[]>`
    WITH protected AS (
      SELECT unnest(${[...protectedTenantTables]}::text[]) AS table_name
    ), catalog AS (
      SELECT
        protected.table_name,
        classes.relrowsecurity,
        classes.relforcerowsecurity
      FROM protected
      LEFT JOIN pg_class classes ON classes.relname = protected.table_name
      LEFT JOIN pg_namespace namespaces
        ON namespaces.oid = classes.relnamespace
       AND namespaces.nspname = current_schema()
    )
    SELECT
      (SELECT count(*) FROM protected) AS "protectedCount",
      count(*) FILTER (WHERE catalog.relrowsecurity) AS "rlsCount",
      count(*) FILTER (WHERE catalog.relforcerowsecurity) AS "forcedCount",
      (
        SELECT count(DISTINCT policies.tablename)
        FROM pg_policies policies
        JOIN protected ON protected.table_name = policies.tablename
        WHERE policies.schemaname = current_schema()
          AND 'signalstack_runtime' = ANY(policies.roles)
      ) AS "runtimePolicyCount",
      (
        SELECT count(DISTINCT privileges.table_name)
        FROM information_schema.table_privileges privileges
        JOIN protected ON protected.table_name = privileges.table_name
        WHERE privileges.table_schema = current_schema()
          AND privileges.grantee = 'PUBLIC'
          AND privileges.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
      ) AS "publicPrivilegeCount"
    FROM catalog
  `;

  const expected = protectedTenantTables.length;
  if (
    !boundary ||
    Number(boundary.protectedCount) !== expected ||
    Number(boundary.rlsCount) !== expected ||
    Number(boundary.forcedCount) !== expected ||
    Number(boundary.runtimePolicyCount) !== expected ||
    Number(boundary.publicPrivilegeCount) !== 0
  ) {
    throw new Error("Runtime database tenant-boundary catalog is incomplete.");
  }

  const policies = await client.$queryRaw<RuntimePolicyRow[]>`
    SELECT
      policies.tablename AS "tableName",
      policies.policyname AS "policyName",
      policies.cmd AS "command",
      policies.permissive AS "permissive",
      policies.roles AS "roles",
      policies.qual AS "usingExpression",
      policies.with_check AS "checkExpression"
    FROM pg_policies policies
    WHERE policies.schemaname = current_schema()
      AND 'signalstack_runtime' = ANY(policies.roles)
    ORDER BY policies.tablename, policies.policyname
  `;
  assertRuntimePolicyShapes(policies);

  const apiKeyControlPolicies = await client.$queryRaw<ApiKeyControlPolicyRow[]>`
    SELECT
      policies.policyname AS "policyName",
      policies.cmd AS "command",
      policies.permissive AS "permissive",
      policies.roles AS "roles",
      policies.qual AS "usingExpression",
      policies.with_check AS "checkExpression",
      has_table_privilege('signalstack_control', 'public."ApiCredential"', 'SELECT') AS "controlSelect",
      has_table_privilege('signalstack_control', 'public."ApiCredential"', 'INSERT') AS "controlInsert",
      has_table_privilege('signalstack_control', 'public."ApiCredential"', 'UPDATE') AS "controlUpdate",
      has_table_privilege('signalstack_control', 'public."ApiCredential"', 'DELETE') AS "controlDelete",
      EXISTS (
        SELECT 1
        FROM information_schema.table_privileges privileges
        WHERE privileges.table_schema = current_schema()
          AND privileges.table_name = 'ApiCredential'
          AND privileges.grantee = 'PUBLIC'
          AND privileges.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
      ) AS "publicPrivilege"
    FROM pg_policies policies
    WHERE policies.schemaname = current_schema()
      AND policies.tablename = 'ApiCredential'
      AND 'signalstack_control' = ANY(policies.roles)
  `;
  assertApiKeyControlPolicyShape(apiKeyControlPolicies);

  const dispatchFunctions = await client.$queryRaw<DispatchCapabilityRow[]>`
    SELECT
      functions.proname AS "functionName",
      functions.prosecdef AS "securityDefiner",
      functions.proconfig AS "settings",
      EXISTS (
        SELECT 1
        FROM aclexplode(COALESCE(functions.proacl, acldefault('f', functions.proowner))) grants
        WHERE grants.grantee = 0
          AND grants.privilege_type = 'EXECUTE'
      ) AS "publicExecute",
      has_function_privilege('signalstack_worker', functions.oid, 'EXECUTE') AS "workerExecute",
      has_function_privilege('signalstack_runtime', functions.oid, 'EXECUTE') AS "runtimeExecute",
      has_function_privilege('signalstack_control', functions.oid, 'EXECUTE') AS "controlExecute",
      has_function_privilege('signalstack_web', functions.oid, 'EXECUTE') AS "webExecute",
      pg_has_role(
        pg_get_userbyid(functions.proowner),
        'signalstack_owner',
        'MEMBER'
      ) AS "ownerMember"
    FROM pg_proc functions
    JOIN pg_namespace namespaces ON namespaces.oid = functions.pronamespace
    WHERE namespaces.nspname = current_schema()
      AND (
        (
          functions.proname = 'claim_due_queue_jobs'
          AND functions.proargtypes = '23 1184 23 2950'::oidvector
        )
        OR (
          functions.proname = 'claim_due_customer_webhook_deliveries'
          AND functions.proargtypes = '23 23 2950'::oidvector
        )
        OR (
          functions.proname = 'claim_due_message_attempts'
          AND functions.proargtypes = '23 23 2950'::oidvector
        )
        OR (
          functions.proname = 'recover_expired_message_attempts'
          AND functions.proargtypes = '23'::oidvector
        )
        OR (
          functions.proname = 'resolve_verified_provider_destination'
          AND functions.proargtypes = '25 25 25'::oidvector
        )
      )
  `;
  assertDispatchCapabilityShape(dispatchFunctions);
}

/** Verify command, role, and predicate fingerprints instead of merely counting policy names. */
export function assertRuntimePolicyShapes(rows: readonly RuntimePolicyRow[]): void {
  if (rows.length !== protectedTenantTables.length) {
    throw new Error("Runtime database tenant-boundary policy shape is invalid.");
  }

  const byTable = new Map(rows.map((row) => [row.tableName, row]));
  if (byTable.size !== protectedTenantTables.length) {
    throw new Error("Runtime database tenant-boundary policy shape is invalid.");
  }

  const currentOrg = "nullif(current_setting('app.current_org_id'::text,true),''::text)";
  const orgScope = `(orgid=${currentOrg})`;
  const expected = new Map<string, Readonly<{
    command: "ALL" | "SELECT";
    usingExpression: string;
    checkExpression: string | null;
  }>>();

  for (const table of ordinaryTenantTables) {
    expected.set(table, {
      command: "ALL",
      usingExpression: orgScope,
      checkExpression: orgScope
    });
  }
  for (const table of ["Membership", "AuthSession"] as const) {
    expected.set(table, {
      command: "ALL",
      usingExpression: orgScope,
      checkExpression: orgScope
    });
  }
  const organizationScope = `(id=${currentOrg})`;
  expected.set("Organization", {
    command: "ALL",
    usingExpression: organizationScope,
    checkExpression: organizationScope
  });
  expected.set("AppUser", {
    command: "SELECT",
    usingExpression:
      `(exists(select1frommembershipmembershipwhere((membership.userid=appuser.id)` +
      `and(membership.orgid=${currentOrg}))))`,
    checkExpression: null
  });
  const inviteScope = `((type='invite'::authtokentype)and(orgid=${currentOrg}))`;
  expected.set("AuthToken", {
    command: "ALL",
    usingExpression: inviteScope,
    checkExpression: inviteScope
  });

  for (const table of protectedTenantTables) {
    const row = byTable.get(table);
    const shape = expected.get(table);
    if (
      !row ||
      !shape ||
      row.policyName !== "tenant_scope" ||
      row.command !== shape.command ||
      row.permissive !== "PERMISSIVE" ||
      row.roles.length !== 1 ||
      row.roles[0] !== "signalstack_runtime" ||
      canonicalPolicyExpression(row.usingExpression) !== shape.usingExpression ||
      canonicalPolicyExpression(row.checkExpression) !== shape.checkExpression
    ) {
      throw new Error("Runtime database tenant-boundary policy shape is invalid.");
    }
  }
}

function canonicalPolicyExpression(value: string | null): string | null {
  return value === null ? null : value.toLowerCase().replaceAll('"', "").replace(/\s+/g, "");
}

export function assertDispatchCapabilityShape(rows: readonly DispatchCapabilityRow[]): void {
  const expectedFunctions = new Map<string, "worker" | "web">([
    ["claim_due_queue_jobs", "worker"],
    ["claim_due_customer_webhook_deliveries", "worker"],
    ["claim_due_message_attempts", "worker"],
    ["recover_expired_message_attempts", "worker"],
    ["resolve_verified_provider_destination", "web"]
  ]);
  if (rows.length !== expectedFunctions.size) {
    throw new Error("Database capability shape is invalid.");
  }
  for (const functionShape of rows) {
    const expectedCapability = expectedFunctions.get(functionShape.functionName);
    if (
      !expectedCapability ||
      !functionShape.securityDefiner ||
      functionShape.settings?.length !== 1 ||
      functionShape.settings[0] !== "search_path=pg_catalog, public" ||
      functionShape.publicExecute ||
      functionShape.workerExecute !== (expectedCapability === "worker") ||
      functionShape.runtimeExecute ||
      functionShape.controlExecute ||
      functionShape.webExecute !== (expectedCapability === "web") ||
      !functionShape.ownerMember
    ) {
      throw new Error("Database capability shape is invalid.");
    }
    expectedFunctions.delete(functionShape.functionName);
  }
  if (expectedFunctions.size !== 0) {
    throw new Error("Database capability shape is invalid.");
  }
}

/** The pre-tenant API-key lookup is SELECT-only and requires one exact transaction-local hash. */
export function assertApiKeyControlPolicyShape(
  rows: readonly ApiKeyControlPolicyRow[]
): void {
  const row = rows[0];
  const expectedUsing =
    `((current_setting('app.control_purpose'::text,true)='api_key'::text)` +
    `and(secrethash=nullif(current_setting('app.current_api_key_hash'::text,true),''::text)))`;
  if (
    rows.length !== 1 ||
    !row ||
    row.policyName !== "api_key_control_select_scope" ||
    row.command !== "SELECT" ||
    row.permissive !== "PERMISSIVE" ||
    row.roles.length !== 1 ||
    row.roles[0] !== "signalstack_control" ||
    canonicalPolicyExpression(row.usingExpression) !== expectedUsing ||
    row.checkExpression !== null ||
    !row.controlSelect ||
    row.controlInsert ||
    row.controlUpdate ||
    row.controlDelete ||
    row.publicPrivilege
  ) {
    throw new Error("API-key control database capability shape is invalid.");
  }
}
