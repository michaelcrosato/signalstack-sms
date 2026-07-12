-- M2: control-plane purposes are routing labels, not authority. Bind every control operation on
-- tenant roots and the global user directory to exact transaction-local evidence, and split
-- command policies so a read capability cannot silently become a write capability.

BEGIN;

DROP POLICY IF EXISTS control_scope ON "Organization";
DROP POLICY IF EXISTS control_select_scope ON "Organization";
DROP POLICY IF EXISTS control_insert_scope ON "Organization";
DROP POLICY IF EXISTS control_update_scope ON "Organization";
DROP POLICY IF EXISTS control_delete_scope ON "Organization";

CREATE POLICY control_select_scope ON "Organization"
  FOR SELECT TO signalstack_control
  USING (
    "id" = NULLIF(current_setting('app.current_org_id', true), '')
    OR EXISTS (
      SELECT 1
      FROM "Membership" membership
      WHERE membership."orgId" = "Organization"."id"
        AND membership."userId" = NULLIF(current_setting('app.current_user_id', true), '')
    )
    OR (
      current_setting('app.control_purpose', true) = 'bootstrap'
      AND "slug" = NULLIF(current_setting('app.current_org_slug', true), '')
      AND (
        (
          NULLIF(current_setting('app.current_token_hash', true), '') IS NOT NULL
          AND "demoMode"
        )
        OR (
          NULLIF(current_setting('app.current_token_hash', true), '') IS NULL
          AND NOT EXISTS (SELECT 1 FROM "LocalCredential")
        )
      )
    )
    OR (
      current_setting('app.control_purpose', true) = 'organization_create'
      AND "slug" = NULLIF(current_setting('app.current_org_slug', true), '')
    )
  );

CREATE POLICY control_insert_scope ON "Organization"
  FOR INSERT TO signalstack_control
  WITH CHECK (
    (
      current_setting('app.control_purpose', true) = 'bootstrap'
      AND "slug" = NULLIF(current_setting('app.current_org_slug', true), '')
      AND (
        (
          NULLIF(current_setting('app.current_token_hash', true), '') IS NOT NULL
          AND "demoMode"
        )
        OR (
          NULLIF(current_setting('app.current_token_hash', true), '') IS NULL
          AND NOT "demoMode"
          AND NOT EXISTS (SELECT 1 FROM "LocalCredential")
        )
      )
    )
    OR (
      current_setting('app.control_purpose', true) = 'organization_create'
      AND "slug" = NULLIF(current_setting('app.current_org_slug', true), '')
      AND NOT "demoMode"
      AND EXISTS (
        SELECT 1
        FROM "AppUser" actor
        WHERE actor."id" = NULLIF(current_setting('app.current_user_id', true), '')
          AND actor."disabledAt" IS NULL
      )
    )
  );

CREATE POLICY control_update_scope ON "Organization"
  FOR UPDATE TO signalstack_control
  USING (
    current_setting('app.control_purpose', true) = 'bootstrap'
    AND NULLIF(current_setting('app.current_token_hash', true), '') IS NOT NULL
    AND "slug" = NULLIF(current_setting('app.current_org_slug', true), '')
    AND "demoMode"
  )
  WITH CHECK (
    current_setting('app.control_purpose', true) = 'bootstrap'
    AND NULLIF(current_setting('app.current_token_hash', true), '') IS NOT NULL
    AND "slug" = NULLIF(current_setting('app.current_org_slug', true), '')
    AND "demoMode"
  );

REVOKE INSERT, UPDATE, DELETE ON TABLE "Organization" FROM signalstack_control;
GRANT SELECT, INSERT, UPDATE ON TABLE "Organization" TO signalstack_control;

DROP POLICY IF EXISTS control_scope ON "Membership";
DROP POLICY IF EXISTS control_select_scope ON "Membership";
DROP POLICY IF EXISTS control_insert_scope ON "Membership";
DROP POLICY IF EXISTS control_update_scope ON "Membership";
DROP POLICY IF EXISTS control_delete_scope ON "Membership";

CREATE POLICY control_select_scope ON "Membership"
  FOR SELECT TO signalstack_control
  USING (
    "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
    OR "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY control_insert_scope ON "Membership"
  FOR INSERT TO signalstack_control
  WITH CHECK (
    "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
    AND "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY control_update_scope ON "Membership"
  FOR UPDATE TO signalstack_control
  USING (
    "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
    AND "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
    AND "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  );

REVOKE INSERT, UPDATE, DELETE ON TABLE "Membership" FROM signalstack_control;
GRANT SELECT, INSERT, UPDATE ON TABLE "Membership" TO signalstack_control;

DROP POLICY IF EXISTS control_scope ON "AppUser";
DROP POLICY IF EXISTS control_select_scope ON "AppUser";
DROP POLICY IF EXISTS control_insert_scope ON "AppUser";
DROP POLICY IF EXISTS control_update_scope ON "AppUser";
DROP POLICY IF EXISTS control_delete_scope ON "AppUser";

CREATE POLICY control_select_scope ON "AppUser"
  FOR SELECT TO signalstack_control
  USING (
    "id" = NULLIF(current_setting('app.current_user_id', true), '')
    OR (
      current_setting('app.control_purpose', true) = 'login'
      AND (
        "normalizedEmail" = NULLIF(current_setting('app.current_login_email', true), '')
        OR "clerkUserId" = NULLIF(current_setting('app.current_token_hash', true), '')
      )
    )
    OR (
      current_setting('app.control_purpose', true) = 'invite'
      AND "normalizedEmail" = NULLIF(current_setting('app.current_login_email', true), '')
    )
    OR (
      current_setting('app.control_purpose', true) = 'bootstrap'
      AND (
        (
          NULLIF(current_setting('app.current_token_hash', true), '') IS NOT NULL
          AND "clerkUserId" = NULLIF(current_setting('app.current_token_hash', true), '')
        )
        OR (
          NULLIF(current_setting('app.current_token_hash', true), '') IS NULL
          AND "normalizedEmail" = NULLIF(current_setting('app.current_login_email', true), '')
          AND NOT EXISTS (SELECT 1 FROM "LocalCredential")
        )
      )
    )
  );

CREATE POLICY control_insert_scope ON "AppUser"
  FOR INSERT TO signalstack_control
  WITH CHECK (
    (
      current_setting('app.control_purpose', true) = 'bootstrap'
      AND "normalizedEmail" = NULLIF(current_setting('app.current_login_email', true), '')
      AND (
        (
          NULLIF(current_setting('app.current_token_hash', true), '') IS NOT NULL
          AND "clerkUserId" = NULLIF(current_setting('app.current_token_hash', true), '')
        )
        OR (
          NULLIF(current_setting('app.current_token_hash', true), '') IS NULL
          AND "clerkUserId" IS NULL
          AND NOT EXISTS (SELECT 1 FROM "LocalCredential")
        )
      )
    )
    OR (
      current_setting('app.control_purpose', true) = 'invite'
      AND "clerkUserId" IS NULL
      AND "normalizedEmail" = NULLIF(current_setting('app.current_login_email', true), '')
      AND EXISTS (
        SELECT 1
        FROM "AuthToken" invite
        WHERE invite."tokenHash" = NULLIF(current_setting('app.current_token_hash', true), '')
          AND invite."type" = 'INVITE'::"AuthTokenType"
          AND invite."orgId" = NULLIF(current_setting('app.current_org_id', true), '')
          AND invite."email" = "AppUser"."normalizedEmail"
          AND invite."consumedAt" IS NULL
          AND invite."revokedAt" IS NULL
          AND invite."expiresAt" > CURRENT_TIMESTAMP
      )
    )
  );

CREATE POLICY control_update_scope ON "AppUser"
  FOR UPDATE TO signalstack_control
  USING (
    (
      current_setting('app.control_purpose', true) IN ('session', 'password_reset')
      AND "id" = NULLIF(current_setting('app.current_user_id', true), '')
    )
    OR (
      current_setting('app.control_purpose', true) = 'bootstrap'
      AND NULLIF(current_setting('app.current_token_hash', true), '') IS NOT NULL
      AND "clerkUserId" = NULLIF(current_setting('app.current_token_hash', true), '')
    )
  )
  WITH CHECK (
    (
      current_setting('app.control_purpose', true) IN ('session', 'password_reset')
      AND "id" = NULLIF(current_setting('app.current_user_id', true), '')
    )
    OR (
      current_setting('app.control_purpose', true) = 'bootstrap'
      AND NULLIF(current_setting('app.current_token_hash', true), '') IS NOT NULL
      AND "clerkUserId" = NULLIF(current_setting('app.current_token_hash', true), '')
    )
  );

REVOKE INSERT, UPDATE, DELETE ON TABLE "AppUser" FROM signalstack_control;
GRANT SELECT, INSERT, UPDATE ON TABLE "AppUser" TO signalstack_control;

COMMIT;
