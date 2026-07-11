import { PrismaClient } from "@prisma/client";

type Capability = "web" | "worker";

export type RuntimeRoleProvisioningInput = Readonly<{
  migrationUrl: string;
  runtimeUrl: string;
  capability: Capability;
}>;

export type ParsedRuntimeRoleProvisioning = Readonly<{
  ownerUrl: string;
  runtimeRole: string;
  runtimePassword: string;
  capabilityRole: "signalstack_web" | "signalstack_worker";
}>;

export function parseRuntimeRoleProvisioning(
  input: RuntimeRoleProvisioningInput
): ParsedRuntimeRoleProvisioning {
  if (input.migrationUrl === input.runtimeUrl) {
    throw new Error("Migration and runtime database credentials must be distinct.");
  }
  const owner = parsePostgresUrl(input.migrationUrl, "migration");
  const runtime = parsePostgresUrl(input.runtimeUrl, "runtime");
  if (
    owner.hostname !== runtime.hostname ||
    normalizedPort(owner) !== normalizedPort(runtime) ||
    owner.pathname !== runtime.pathname
  ) {
    throw new Error("Migration and runtime URLs must target the same PostgreSQL database.");
  }
  const runtimeRole = decodeURIComponent(runtime.username);
  const runtimePassword = decodeURIComponent(runtime.password);
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(runtimeRole)) {
    throw new Error("Runtime database role name is invalid.");
  }
  if (runtimePassword.length < 16 || runtimePassword.length > 1024) {
    throw new Error("Runtime database password must contain 16 to 1024 characters.");
  }
  const ownerRole = decodeURIComponent(owner.username);
  if (!ownerRole || ownerRole === runtimeRole) {
    throw new Error("Runtime database role must differ from the migration owner.");
  }
  return Object.freeze({
    ownerUrl: input.migrationUrl,
    runtimeRole,
    runtimePassword,
    capabilityRole: input.capability === "worker" ? "signalstack_worker" : "signalstack_web"
  });
}

export async function provisionRuntimeRole(input: RuntimeRoleProvisioningInput): Promise<string> {
  const parsed = parseRuntimeRoleProvisioning(input);
  const client = new PrismaClient({ datasourceUrl: parsed.ownerUrl, log: ["error"] });
  const identifier = quoteIdentifier(parsed.runtimeRole);
  const password = quoteLiteral(parsed.runtimePassword);
  try {
    const capability = await client.$queryRaw<Array<{ available: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = ${parsed.capabilityRole}
      ) AS "available"
    `;
    if (!capability[0]?.available) {
      throw new Error("Runtime capability roles are unavailable; deploy database migrations first.");
    }

    const role = await client.$queryRaw<Array<{ available: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${parsed.runtimeRole}) AS "available"
    `;
    if (!role[0]?.available) {
      await client.$executeRawUnsafe(`CREATE ROLE ${identifier} LOGIN PASSWORD ${password}`);
    }
    await client.$executeRawUnsafe(
      `ALTER ROLE ${identifier} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${password}`
    );
    await client.$executeRawUnsafe(
      `REVOKE signalstack_web, signalstack_worker, signalstack_runtime, signalstack_owner FROM ${identifier}`
    );
    const grantedRoles = parsed.capabilityRole === "signalstack_worker"
      ? "signalstack_worker, signalstack_runtime"
      : "signalstack_web";
    await client.$executeRawUnsafe(`GRANT ${grantedRoles} TO ${identifier}`);
    return parsed.runtimeRole;
  } finally {
    await client.$disconnect();
  }
}

function parsePostgresUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} database URL is invalid.`);
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname) {
    throw new Error(`${label} database URL must target PostgreSQL.`);
  }
  return url;
}

function normalizedPort(url: URL): string {
  return url.port || "5432";
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function runCli() {
  const capabilityArgument = process.argv.find((argument) => argument.startsWith("--capability="));
  const capability = capabilityArgument?.slice("--capability=".length) ?? "web";
  if (capability !== "web" && capability !== "worker") {
    throw new Error("Runtime capability must be web or worker.");
  }
  const migrationUrl = process.env.MIGRATION_DATABASE_URL;
  const runtimeUrl = process.env.DATABASE_URL;
  if (!migrationUrl || !runtimeUrl) {
    throw new Error("MIGRATION_DATABASE_URL and DATABASE_URL are required for role provisioning.");
  }
  const role = await provisionRuntimeRole({ migrationUrl, runtimeUrl, capability });
  console.log(`Provisioned non-owner ${capability} runtime database role: ${role}.`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/provision-runtime-role.ts")) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Runtime role provisioning failed.");
    process.exit(1);
  });
}
