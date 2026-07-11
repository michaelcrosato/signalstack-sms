-- Enforce the built-in identity normalization invariant in PostgreSQL itself.
-- The named normalized column supports direct lookups while this functional index prevents
-- case-variant identities even if a future writer bypasses the repository helper.
ALTER TABLE "AppUser"
  ADD CONSTRAINT "AppUser_normalizedEmail_matches_email_check"
  CHECK ("normalizedEmail" = lower(btrim("email")));

CREATE UNIQUE INDEX "AppUser_email_normalized_key"
  ON "AppUser" (lower(btrim("email")));

-- Auth sessions carry an organization boundary and must receive the same RLS defense-in-depth
-- as every other tenant-scoped table.
ALTER TABLE "AuthSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthSession" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "AuthSession";
CREATE POLICY tenant_isolation ON "AuthSession" FOR ALL
  USING (
    current_setting('app.current_org_id', true) IS NULL
    OR "orgId" = current_setting('app.current_org_id', true)
  )
  WITH CHECK (
    current_setting('app.current_org_id', true) IS NULL
    OR "orgId" = current_setting('app.current_org_id', true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON "AuthSession" TO app_rls;
