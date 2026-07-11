-- M2: narrow global queue dispatch plus repeatable bootstrap visibility under the explicit control
-- capability. Ordinary tenant tables remain fail closed and are never exposed to the dispatcher.

BEGIN;

GRANT USAGE ON SCHEMA public TO signalstack_worker;

DROP POLICY IF EXISTS control_scope ON "Organization";
CREATE POLICY control_scope ON "Organization"
  FOR ALL TO signalstack_control
  USING (
    current_setting('app.control_purpose', true) = 'bootstrap'
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
    current_setting('app.control_purpose', true) = 'bootstrap'
    OR "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
    OR "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    "orgId" = NULLIF(current_setting('app.current_org_id', true), '')
    OR current_setting('app.control_purpose', true) IN ('bootstrap', 'organization_create')
  );

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

REVOKE ALL ON FUNCTION public.claim_due_queue_jobs(integer, timestamptz, integer, uuid)
  FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_web;
GRANT EXECUTE ON FUNCTION public.claim_due_queue_jobs(integer, timestamptz, integer, uuid)
  TO signalstack_worker;

COMMIT;
