-- SPEC-010: Postgres Row-Level Security as tenant-isolation defense-in-depth.
--
-- Design (safe, incremental): each tenant table gets ENABLE + FORCE ROW LEVEL SECURITY and a
-- `tenant_isolation` policy that ALLOWS when the session var `app.current_org_id` is unset and otherwise
-- requires `"orgId"` to equal it. The application's default connection role (a superuser/owner with
-- BYPASSRLS, or any path that does not set the var) is therefore unaffected — app-level `orgId` scoping
-- still does the work, so this migration is a pure backstop with no functional regression.
--
-- Enforcement is opt-in via `lib/db/rls.ts#withTenantRls`, which (per request/transaction) runs
-- `set_config('app.current_org_id', <orgId>, true)` and `SET LOCAL ROLE app_rls` (a NON-superuser role, so
-- RLS actually applies). Both are transaction-local, so nothing leaks across pooled connections.
--
-- Rollback (reversible — run as a superuser): for each table below
--   DROP POLICY IF EXISTS tenant_isolation ON "<T>";
--   ALTER TABLE "<T>" NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE "<T>" DISABLE ROW LEVEL SECURITY;
--   REVOKE ALL ON "<T>" FROM app_rls;
-- then optionally: DROP ROLE app_rls;

DO $rls$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'Contact','Tag','ContactTag','ContactList','ContactListMember','Segment','MessageTemplate',
    'ContactImport','Campaign','CampaignRecipient','Conversation','QueueJob','Message','InternalNote',
    'ComplianceProfile','UsageEvent','BillingAccount','ProviderPhoneNumber','ProviderCredential',
    'ProviderCredentialRotation','LiveReadinessAuditEvent','WebhookEvent'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    CREATE ROLE app_rls NOLOGIN;
  END IF;
  GRANT USAGE ON SCHEMA public TO app_rls;

  FOREACH t IN ARRAY tenant_tables
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      $f$CREATE POLICY tenant_isolation ON %I FOR ALL
         USING (current_setting('app.current_org_id', true) IS NULL OR "orgId" = current_setting('app.current_org_id', true))
         WITH CHECK (current_setting('app.current_org_id', true) IS NULL OR "orgId" = current_setting('app.current_org_id', true))$f$,
      t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_rls', t);
  END LOOP;
END
$rls$;
