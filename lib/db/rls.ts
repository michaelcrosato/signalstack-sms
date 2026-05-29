import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

// SPEC-010 — tenant-isolation backstop. Runs `fn` inside a transaction with `app.current_org_id` set and the
// non-superuser `app_rls` role active, so the RLS policies (migration 20260529130000_tenant_rls) enforce
// `"orgId" = orgId` at the database even if an app-level filter is omitted. Both settings are
// transaction-local, so nothing leaks across pooled connections.
//
// The default application path does NOT call this: with the var unset (and/or a superuser/BYPASSRLS role)
// the policies allow and the existing app-level `orgId` scoping does the work. This is therefore a pure
// backstop with no behavior change until a request path adopts it (the production enablement step also
// requires the app to connect as a non-superuser role).
export async function withTenantRls<T>(
  orgId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Parameterized (no injection); transaction-local so it auto-resets at commit/rollback.
    await tx.$queryRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
    // Fixed role name (no user input); RLS applies because app_rls is a non-superuser, non-owner role.
    await tx.$executeRawUnsafe("SET LOCAL ROLE app_rls");
    return fn(tx);
  });
}
