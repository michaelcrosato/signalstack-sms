-- M2: explicit pre-tenant control-plane purposes for bootstrap and organization creation.
-- The running login is NOINHERIT; these policies apply only after application code deliberately
-- selects `signalstack_control` in a transaction-local auth context.

DROP POLICY IF EXISTS control_scope ON "Organization";
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
  WITH CHECK (
    "id" = NULLIF(current_setting('app.current_org_id', true), '')
    OR current_setting('app.control_purpose', true) IN ('bootstrap', 'organization_create')
  );

DROP POLICY IF EXISTS control_scope ON "Membership";
CREATE POLICY control_scope ON "Membership"
  FOR ALL TO signalstack_control
  USING (
    "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
    OR "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
    OR current_setting('app.control_purpose', true) IN ('bootstrap', 'organization_create')
  );

DROP POLICY IF EXISTS control_insert_scope ON "LiveReadinessAuditEvent";
CREATE POLICY control_insert_scope ON "LiveReadinessAuditEvent"
  FOR INSERT TO signalstack_control
  WITH CHECK (
    "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
    OR current_setting('app.control_purpose', true) IN
      ('bootstrap', 'organization_create', 'password_reset', 'operator')
  );
GRANT INSERT ON TABLE "LiveReadinessAuditEvent" TO signalstack_control;
