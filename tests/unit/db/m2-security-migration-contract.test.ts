import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("M2 security migration contract", () => {
  it("installs dispatch atomically with bounded database time and no ownership handoff", () => {
    const migration = readMigration("20260711035000_worker_dispatch_and_bootstrap_scope");
    expect(migration).toMatch(/^--[\s\S]*?\nBEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).toContain("max_jobs IS NULL");
    expect(migration).toContain("lease_ms IS NULL");
    expect(migration).toContain("effective_now timestamptz := clock_timestamp()");
    expect(migration).toContain("abs(extract(epoch FROM (now_at - effective_now))) > 60");
    expect(migration).not.toContain("OWNER TO signalstack_dispatch_owner");
    expect(migration.indexOf("CREATE OR REPLACE FUNCTION public.claim_due_queue_jobs")).toBeLessThan(
      migration.indexOf("REVOKE ALL ON FUNCTION public.claim_due_queue_jobs")
    );
  });

  it("gives a non-bypass owner an explicit FORCE-RLS capability", () => {
    const foundation = readMigration("20260711033000_fail_closed_tenant_runtime");
    const hardening = readMigration("20260711038000_owner_capability_and_dispatch_hardening");
    for (const migration of [foundation, hardening]) {
      expect(migration).toContain("signalstack_owner");
      expect(migration).toContain("CREATE POLICY owner_scope");
      expect(migration).toContain("GRANT signalstack_owner TO %I");
    }
    expect(foundation).toContain("Unsafe SignalStack capability role");
    expect(foundation).not.toMatch(/ALTER ROLE signalstack_owner[\s\S]*NOBYPASSRLS/);
  });

  it("uses exact-evidence command policies and removes control delete authority", () => {
    const migration = readMigration("20260711039000_control_policy_hardening");
    expect(migration).toMatch(/^--[\s\S]*?\nBEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    for (const table of ["Organization", "Membership", "AppUser"]) {
      expect(migration).toContain(`control_select_scope ON "${table}"`);
      expect(migration).not.toContain(`FOR ALL TO signalstack_control\n  USING`);
      expect(migration).toContain(`REVOKE INSERT, UPDATE, DELETE ON TABLE "${table}"`);
    }
    expect(migration).toContain("app.current_org_slug");
  });
});

function readMigration(name: string): string {
  return readFileSync(resolve("prisma", "migrations", name, "migration.sql"), "utf8");
}
