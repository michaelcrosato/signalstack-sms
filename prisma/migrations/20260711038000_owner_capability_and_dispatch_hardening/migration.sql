-- M2 hardening: FORCE RLS must work with a non-superuser migration/operator owner, and the
-- SECURITY DEFINER dispatch capability must be installed atomically with bounded database time.

BEGIN;

DO $owner_role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'signalstack_owner') THEN
    CREATE ROLE signalstack_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS NOINHERIT;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_roles roles
    WHERE roles.rolname = 'signalstack_owner'
      AND (
        roles.rolcanlogin
        OR roles.rolsuper
        OR roles.rolcreatedb
        OR roles.rolcreaterole
        OR roles.rolreplication
        OR roles.rolbypassrls
      )
  ) THEN
    RAISE EXCEPTION 'Unsafe SignalStack owner capability role.';
  END IF;
  REVOKE signalstack_owner FROM signalstack_runtime, signalstack_control,
    signalstack_web, signalstack_worker;
  EXECUTE format('GRANT signalstack_owner TO %I', current_user);
END
$owner_role$;

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

DROP POLICY IF EXISTS queue_dispatch_scope ON "QueueJob";
DO $legacy_dispatch$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'signalstack_dispatch_owner') THEN
    REVOKE SELECT, UPDATE ON TABLE "QueueJob" FROM signalstack_dispatch_owner;
  END IF;
END
$legacy_dispatch$;

GRANT USAGE ON SCHEMA public TO signalstack_worker;

CREATE OR REPLACE FUNCTION public.claim_due_queue_jobs(
  max_jobs integer,
  now_at timestamptz,
  lease_ms integer,
  claim_token uuid
)
RETURNS TABLE("id" text, "orgId" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  effective_now timestamptz := clock_timestamp();
BEGIN
  IF max_jobs IS NULL OR max_jobs < 1 OR max_jobs > 100
    OR lease_ms IS NULL OR lease_ms < 1000 OR lease_ms > 3600000
    OR now_at IS NULL OR claim_token IS NULL
    OR abs(extract(epoch FROM (now_at - effective_now))) > 60 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Queue dispatch arguments are invalid.';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT queue_job."id"
    FROM public."QueueJob" queue_job
    WHERE queue_job."type" = 'SCHEDULED_CAMPAIGN'::public."QueueJobType"
      AND queue_job."runAt" <= effective_now
      AND (
        queue_job."status" = 'QUEUED'::public."QueueJobStatus"
        OR (
          queue_job."status" = 'PROCESSING'::public."QueueJobStatus"
          AND (
            queue_job."processingToken" IS NULL
            OR queue_job."processingExpiresAt" IS NULL
            OR queue_job."processingExpiresAt" <= effective_now
          )
        )
      )
    ORDER BY queue_job."runAt", queue_job."id"
    FOR UPDATE SKIP LOCKED
    LIMIT max_jobs
  ), claimed AS (
    UPDATE public."QueueJob" queue_job
    SET
      "status" = 'PROCESSING'::public."QueueJobStatus",
      "processingToken" = claim_token::text,
      "processingExpiresAt" = effective_now + (lease_ms * INTERVAL '1 millisecond'),
      "updatedAt" = effective_now
    FROM candidates
    WHERE queue_job."id" = candidates."id"
    RETURNING queue_job."id", queue_job."orgId"
  )
  SELECT claimed."id", claimed."orgId"
  FROM claimed
  ORDER BY claimed."id";
END
$function$;

DO $dispatch_owner$
BEGIN
  IF (
    SELECT pg_get_userbyid(functions.proowner) <> current_user
    FROM pg_proc functions
    JOIN pg_namespace namespaces ON namespaces.oid = functions.pronamespace
    WHERE namespaces.nspname = 'public'
      AND functions.proname = 'claim_due_queue_jobs'
      AND functions.proargtypes = '23 1184 23 2950'::oidvector
  ) THEN
    EXECUTE format(
      'ALTER FUNCTION public.claim_due_queue_jobs(integer, timestamptz, integer, uuid) OWNER TO %I',
      current_user
    );
  END IF;
END
$dispatch_owner$;

REVOKE ALL ON FUNCTION public.claim_due_queue_jobs(integer, timestamptz, integer, uuid)
  FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_web;
GRANT EXECUTE ON FUNCTION public.claim_due_queue_jobs(integer, timestamptz, integer, uuid)
  TO signalstack_worker;

COMMIT;
