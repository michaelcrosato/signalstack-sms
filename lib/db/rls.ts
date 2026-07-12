import { Prisma } from "@prisma/client";
import { withTenantTransaction } from "@/lib/db/tenant-context";

// Compatibility entry point retained while M2 converts repository call sites. Unlike the former
// opt-in backstop, this always enters the fail-closed tenant capability role.
export async function withTenantRls<T>(
  orgId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return withTenantTransaction({ orgId }, fn);
}

export function rlsIsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  void env;
  return true;
}

export async function withOptionalTenantRls<T>(
  orgId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  env: Record<string, string | undefined> = process.env
): Promise<T> {
  void env;
  return withTenantRls(orgId, fn);
}
