-- M2: fail-closed tenant runtime capabilities.
--
-- Login roles are intentionally NOT created here because passwords and LOGIN attributes are operator
-- concerns. A web login is granted `signalstack_web`; a worker login is granted
-- `signalstack_worker`; migrations retain a separate table-owning credential. These NOLOGIN roles are
-- the stable capability and policy targets shared by fresh installs and upgrades.

BEGIN;

DO $roles$
DECLARE
  unsafe_role text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'signalstack_runtime') THEN
    CREATE ROLE signalstack_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS INHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'signalstack_control') THEN
    CREATE ROLE signalstack_control NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS INHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'signalstack_web') THEN
    CREATE ROLE signalstack_web NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS INHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'signalstack_worker') THEN
    CREATE ROLE signalstack_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS INHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'signalstack_owner') THEN
    CREATE ROLE signalstack_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS NOINHERIT;
  END IF;

  SELECT roles.rolname
  INTO unsafe_role
  FROM pg_roles roles
  WHERE roles.rolname = ANY(ARRAY[
      'signalstack_runtime',
      'signalstack_control',
      'signalstack_web',
      'signalstack_worker',
      'signalstack_owner'
    ])
    AND (
      roles.rolcanlogin
      OR roles.rolsuper
      OR roles.rolcreatedb
      OR roles.rolcreaterole
      OR roles.rolreplication
      OR roles.rolbypassrls
    )
  LIMIT 1;
  IF unsafe_role IS NOT NULL THEN
    RAISE EXCEPTION 'Unsafe SignalStack capability role: %', unsafe_role;
  END IF;

  GRANT signalstack_runtime, signalstack_control TO signalstack_web;
  GRANT signalstack_runtime TO signalstack_worker;
  REVOKE signalstack_owner FROM signalstack_runtime, signalstack_control,
    signalstack_web, signalstack_worker;
  -- FORCE RLS also applies to a non-superuser table owner. This explicit capability preserves
  -- migration/operator authority without requiring SUPERUSER or BYPASSRLS.
  EXECUTE format('GRANT signalstack_owner TO %I', current_user);
END
$roles$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO signalstack_runtime, signalstack_control;

-- All ordinary product tables have one required orgId. The same manifest is consumed by catalog and
-- integration checks; missing or empty context makes both predicates evaluate false/null.
DO $tenant_tables$
DECLARE
  table_name text;
  tenant_tables constant text[] := ARRAY[
    'Contact',
    'Tag',
    'ContactTag',
    'ContactList',
    'ContactListMember',
    'Segment',
    'MessageTemplate',
    'ContactImport',
    'Campaign',
    'CampaignRecipient',
    'Conversation',
    'QueueJob',
    'Message',
    'InternalNote',
    'ComplianceProfile',
    'UsageEvent',
    'BillingAccount',
    'ProviderPhoneNumber',
    'ProviderCredential',
    'ProviderCredentialRotation',
    'LiveReadinessAuditEvent',
    'WebhookEvent'
  ];
BEGIN
  FOREACH table_name IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_scope ON %I', table_name);
    EXECUTE format(
      $policy$
        CREATE POLICY tenant_scope ON %I
        AS PERMISSIVE
        FOR ALL
        TO signalstack_runtime
        USING ("orgId" = NULLIF(current_setting('app.current_org_id', true), ''))
        WITH CHECK ("orgId" = NULLIF(current_setting('app.current_org_id', true), ''))
      $policy$,
      table_name
    );
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', table_name);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM app_rls', table_name);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO signalstack_runtime',
      table_name
    );
  END LOOP;
END
$tenant_tables$;

-- Tenant roots and identity relations require policies shaped to their actual tenant column.
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scope ON "Organization";
DROP POLICY IF EXISTS control_scope ON "Organization";
CREATE POLICY tenant_scope ON "Organization"
  FOR ALL TO signalstack_runtime
  USING ("id" = NULLIF(current_setting('app.current_org_id', true), ''))
  WITH CHECK ("id" = NULLIF(current_setting('app.current_org_id', true), ''));
CREATE POLICY control_scope ON "Organization"
  FOR ALL TO signalstack_control
  USING (
    "id" = NULLIF(current_setting('app.current_org_id', true), '')
    OR EXISTS (
      SELECT 1
      FROM "Membership" membership
      WHERE membership."orgId" = "Organization"."id"
        AND membership."userId" = NULLIF(current_setting('app.current_user_id', true), '')
    )
  )
  WITH CHECK ("id" = NULLIF(current_setting('app.current_org_id', true), ''));

ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scope ON "Membership";
DROP POLICY IF EXISTS control_scope ON "Membership";
CREATE POLICY tenant_scope ON "Membership"
  FOR ALL TO signalstack_runtime
  USING ("orgId" = NULLIF(current_setting('app.current_org_id', true), ''))
  WITH CHECK ("orgId" = NULLIF(current_setting('app.current_org_id', true), ''));
CREATE POLICY control_scope ON "Membership"
  FOR ALL TO signalstack_control
  USING (
    "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
    OR "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK ("orgId" = NULLIF(current_setting('app.current_org_id', true), ''));

ALTER TABLE "AppUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppUser" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scope ON "AppUser";
DROP POLICY IF EXISTS control_scope ON "AppUser";
CREATE POLICY tenant_scope ON "AppUser"
  FOR SELECT TO signalstack_runtime
  USING (
    EXISTS (
      SELECT 1
      FROM "Membership" membership
      WHERE membership."userId" = "AppUser"."id"
        AND membership."orgId" = NULLIF(current_setting('app.current_org_id', true), '')
    )
  );
-- AppUser is the deliberately global identity directory. Product operations select the tenant role;
-- only explicit authentication/operator transactions select the control role.
CREATE POLICY control_scope ON "AppUser"
  FOR ALL TO signalstack_control
  USING (true)
  WITH CHECK (true);

ALTER TABLE "AuthSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthSession" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AuthSession";
DROP POLICY IF EXISTS tenant_scope ON "AuthSession";
DROP POLICY IF EXISTS control_scope ON "AuthSession";
CREATE POLICY tenant_scope ON "AuthSession"
  FOR ALL TO signalstack_runtime
  USING ("orgId" = NULLIF(current_setting('app.current_org_id', true), ''))
  WITH CHECK ("orgId" = NULLIF(current_setting('app.current_org_id', true), ''));
CREATE POLICY control_scope ON "AuthSession"
  FOR ALL TO signalstack_control
  USING (
    "tokenHash" = NULLIF(current_setting('app.current_session_hash', true), '')
    OR "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
    OR "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
    AND "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  );

ALTER TABLE "AuthToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthToken" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scope ON "AuthToken";
DROP POLICY IF EXISTS control_scope ON "AuthToken";
CREATE POLICY tenant_scope ON "AuthToken"
  FOR ALL TO signalstack_runtime
  USING (
    "type" = 'INVITE'::"AuthTokenType"
    AND "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
  )
  WITH CHECK (
    "type" = 'INVITE'::"AuthTokenType"
    AND "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
  );
CREATE POLICY control_scope ON "AuthToken"
  FOR ALL TO signalstack_control
  USING (
    "tokenHash" = NULLIF(current_setting('app.current_token_hash', true), '')
    OR "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
    OR "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    "tokenHash" = NULLIF(current_setting('app.current_token_hash', true), '')
    OR "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
    OR "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  );

REVOKE ALL ON TABLE "Organization", "Membership", "AppUser", "AuthSession", "AuthToken"
  FROM PUBLIC, app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "Organization", "Membership", "AuthSession", "AuthToken"
  TO signalstack_runtime;
GRANT SELECT ON TABLE "AppUser" TO signalstack_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "Organization", "Membership", "AppUser", "AuthSession", "AuthToken"
  TO signalstack_control;

-- Global authentication state contains no orgId and is inaccessible to the product capability role.
REVOKE ALL ON TABLE "LocalCredential", "AuthThrottle" FROM PUBLIC, app_rls, signalstack_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "LocalCredential", "AuthThrottle"
  TO signalstack_control;

-- The owner credential already controls DDL and is intentionally withheld from running services.
-- Give it an explicit RLS policy so FORCE RLS does not silently break migrations, validation
-- triggers, or operator-only maintenance on a least-privileged non-superuser owner.
DO $owner_policies$
DECLARE
  table_name text;
  protected_tables constant text[] := ARRAY[
    'Contact',
    'Tag',
    'ContactTag',
    'ContactList',
    'ContactListMember',
    'Segment',
    'MessageTemplate',
    'ContactImport',
    'Campaign',
    'CampaignRecipient',
    'Conversation',
    'QueueJob',
    'Message',
    'InternalNote',
    'ComplianceProfile',
    'UsageEvent',
    'BillingAccount',
    'ProviderPhoneNumber',
    'ProviderCredential',
    'ProviderCredentialRotation',
    'LiveReadinessAuditEvent',
    'WebhookEvent',
    'Organization',
    'Membership',
    'AppUser',
    'AuthSession',
    'AuthToken'
  ];
BEGIN
  FOREACH table_name IN ARRAY protected_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS owner_scope ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY owner_scope ON %I FOR ALL TO signalstack_owner USING (true) WITH CHECK (true)',
      table_name
    );
  END LOOP;
END
$owner_policies$;

REVOKE ALL ON TABLE "_prisma_migrations" FROM PUBLIC, signalstack_runtime, signalstack_control;

COMMIT;
