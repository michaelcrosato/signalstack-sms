-- M5: fail-closed attempt tenancy plus bounded worker-only claim and frontier recovery.

BEGIN;

ALTER TABLE "MessageAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessageAttempt" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_scope ON "MessageAttempt"
  AS PERMISSIVE
  FOR ALL
  TO signalstack_runtime
  USING ("orgId" = NULLIF(current_setting('app.current_org_id', true), ''))
  WITH CHECK ("orgId" = NULLIF(current_setting('app.current_org_id', true), ''));

CREATE POLICY owner_scope ON "MessageAttempt"
  FOR ALL
  TO signalstack_owner
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE "MessageAttempt"
  FROM PUBLIC, app_rls, signalstack_control, signalstack_web, signalstack_worker;
GRANT SELECT, INSERT, UPDATE ON TABLE "MessageAttempt" TO signalstack_runtime;
REVOKE DELETE ON TABLE "MessageAttempt" FROM signalstack_runtime;

CREATE OR REPLACE FUNCTION public.recover_expired_message_attempts(
  max_attempts integer
)
RETURNS TABLE("attemptId" text, "orgId" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  effective_now timestamptz := clock_timestamp();
BEGIN
  IF max_attempts IS NULL OR max_attempts < 1 OR max_attempts > 100 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Message-attempt recovery arguments are invalid.';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT attempt."id"
    FROM public."MessageAttempt" attempt
    JOIN public."Message" message
      ON message."orgId" = attempt."orgId"
     AND message."id" = attempt."messageId"
    WHERE attempt."status" = 'PROCESSING'::public."MessageAttemptStatus"
      AND attempt."providerCallStartedAt" IS NOT NULL
      AND attempt."processingExpiresAt" IS NOT NULL
      AND attempt."processingExpiresAt" <= effective_now
      AND attempt."completedAt" IS NULL
      AND message."applicationStatus" = 'PROCESSING'::public."MessageApplicationStatus"
    ORDER BY attempt."processingExpiresAt", attempt."id"
    FOR UPDATE OF attempt, message SKIP LOCKED
    LIMIT max_attempts
  ), ambiguous_attempts AS (
    UPDATE public."MessageAttempt" attempt
    SET
      "status" = 'AMBIGUOUS'::public."MessageAttemptStatus",
      "processingToken" = NULL,
      "processingExpiresAt" = NULL,
      "completedAt" = effective_now,
      "errorCode" = COALESCE(attempt."errorCode", 'WORKER_LEASE_EXPIRED_AFTER_FRONTIER'),
      "disposition" = 'ambiguous',
      "updatedAt" = effective_now
    FROM candidates
    WHERE attempt."id" = candidates."id"
    RETURNING attempt."id", attempt."orgId", attempt."messageId"
  ), ambiguous_messages AS (
    UPDATE public."Message" message
    SET
      "applicationStatus" = 'AMBIGUOUS'::public."MessageApplicationStatus",
      "ambiguousAt" = COALESCE(message."ambiguousAt", effective_now),
      "updatedAt" = effective_now
    FROM ambiguous_attempts attempt
    WHERE message."orgId" = attempt."orgId"
      AND message."id" = attempt."messageId"
      AND message."applicationStatus" = 'PROCESSING'::public."MessageApplicationStatus"
    RETURNING message."id", message."orgId"
  )
  SELECT attempt."id", attempt."orgId"
  FROM ambiguous_attempts attempt
  JOIN ambiguous_messages message
    ON message."orgId" = attempt."orgId"
   AND message."id" = attempt."messageId"
  ORDER BY attempt."id";
END
$function$;

CREATE OR REPLACE FUNCTION public.claim_due_message_attempts(
  max_attempts integer,
  lease_ms integer,
  claim_token uuid
)
RETURNS TABLE("attemptId" text, "orgId" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  effective_now timestamptz := clock_timestamp();
BEGIN
  IF max_attempts IS NULL OR max_attempts < 1 OR max_attempts > 100
    OR lease_ms IS NULL OR lease_ms < 1000 OR lease_ms > 3600000
    OR claim_token IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Message-attempt dispatch arguments are invalid.';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT attempt."id"
    FROM public."MessageAttempt" attempt
    JOIN public."Message" message
      ON message."orgId" = attempt."orgId"
     AND message."id" = attempt."messageId"
    WHERE attempt."dueAt" <= effective_now
      AND attempt."completedAt" IS NULL
      AND attempt."providerCallStartedAt" IS NULL
      AND message."applicationStatus" IN (
        'ACCEPTED'::public."MessageApplicationStatus",
        'SCHEDULED'::public."MessageApplicationStatus",
        'PROCESSING'::public."MessageApplicationStatus"
      )
      AND (
        attempt."status" = 'QUEUED'::public."MessageAttemptStatus"
        OR (
          attempt."status" = 'PROCESSING'::public."MessageAttemptStatus"
          AND (
            attempt."processingToken" IS NULL
            OR attempt."processingExpiresAt" IS NULL
            OR attempt."processingExpiresAt" <= effective_now
          )
        )
      )
    ORDER BY attempt."dueAt", attempt."id"
    FOR UPDATE OF attempt, message SKIP LOCKED
    LIMIT max_attempts
  ), claimed AS (
    UPDATE public."MessageAttempt" attempt
    SET
      "status" = 'PROCESSING'::public."MessageAttemptStatus",
      "processingToken" = claim_token::text,
      "processingExpiresAt" = effective_now + (lease_ms * INTERVAL '1 millisecond'),
      "claimedAt" = effective_now,
      "updatedAt" = effective_now
    FROM candidates
    WHERE attempt."id" = candidates."id"
    RETURNING attempt."id", attempt."orgId", attempt."messageId", attempt."attemptNumber"
  ), processing_messages AS (
    UPDATE public."Message" message
    SET
      "applicationStatus" = 'PROCESSING'::public."MessageApplicationStatus",
      "attemptCount" = GREATEST(message."attemptCount", claimed."attemptNumber"),
      "updatedAt" = effective_now
    FROM claimed
    WHERE message."orgId" = claimed."orgId"
      AND message."id" = claimed."messageId"
      AND message."applicationStatus" IN (
        'ACCEPTED'::public."MessageApplicationStatus",
        'SCHEDULED'::public."MessageApplicationStatus",
        'PROCESSING'::public."MessageApplicationStatus"
      )
    RETURNING message."id", message."orgId"
  )
  SELECT claimed."id", claimed."orgId"
  FROM claimed
  JOIN processing_messages message
    ON message."orgId" = claimed."orgId"
   AND message."id" = claimed."messageId"
  ORDER BY claimed."id";
END
$function$;

DO $dispatch_owner$
DECLARE
  function_name text;
  function_signature text;
BEGIN
  FOR function_name, function_signature IN
    SELECT * FROM (VALUES
      ('claim_due_message_attempts', 'integer, integer, uuid'),
      ('recover_expired_message_attempts', 'integer')
    ) AS functions(name, signature)
  LOOP
    IF (
      SELECT pg_get_userbyid(functions.proowner) <> current_user
      FROM pg_proc functions
      JOIN pg_namespace namespaces ON namespaces.oid = functions.pronamespace
      WHERE namespaces.nspname = 'public'
        AND functions.proname = function_name
      LIMIT 1
    ) THEN
      EXECUTE format(
        'ALTER FUNCTION public.%I(%s) OWNER TO %I',
        function_name,
        function_signature,
        current_user
      );
    END IF;
  END LOOP;
END
$dispatch_owner$;

GRANT USAGE ON SCHEMA public TO signalstack_worker;
REVOKE ALL ON FUNCTION public.claim_due_message_attempts(integer, integer, uuid)
  FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_web, signalstack_worker;
REVOKE ALL ON FUNCTION public.recover_expired_message_attempts(integer)
  FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_web, signalstack_worker;
GRANT EXECUTE ON FUNCTION public.claim_due_message_attempts(integer, integer, uuid)
  TO signalstack_worker;
GRANT EXECUTE ON FUNCTION public.recover_expired_message_attempts(integer)
  TO signalstack_worker;

COMMIT;
