-- M2: Prisma INSERT ... RETURNING and user-global revocation need narrowly matching control policies.

DROP POLICY IF EXISTS control_scope ON "Organization";
CREATE POLICY control_scope ON "Organization"
  FOR ALL TO signalstack_control
  USING (
    current_setting('app.control_purpose', true) IN ('bootstrap', 'organization_create')
    OR "id" = NULLIF(current_setting('app.current_org_id', true), '')
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
    current_setting('app.control_purpose', true) IN ('bootstrap', 'organization_create')
    OR "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
    OR "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
    OR current_setting('app.control_purpose', true) IN ('bootstrap', 'organization_create')
  );

DROP POLICY IF EXISTS control_scope ON "AuthSession";
CREATE POLICY control_scope ON "AuthSession"
  FOR ALL TO signalstack_control
  USING (
    "tokenHash" = NULLIF(current_setting('app.current_session_hash', true), '')
    OR "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
    OR "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    "userId" = NULLIF(current_setting('app.current_user_id', true), '')
    OR (
      "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
      AND "tokenHash" = NULLIF(current_setting('app.current_session_hash', true), '')
    )
  );

DROP POLICY IF EXISTS control_audit_read_scope ON "LiveReadinessAuditEvent";
CREATE POLICY control_audit_read_scope ON "LiveReadinessAuditEvent"
  FOR SELECT TO signalstack_control
  USING (
    "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
    OR current_setting('app.control_purpose', true) IN
      ('bootstrap', 'organization_create', 'password_reset', 'operator')
  );
GRANT SELECT, INSERT ON TABLE "LiveReadinessAuditEvent" TO signalstack_control;
