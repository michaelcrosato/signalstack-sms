ALTER TABLE "CustomerWebhookDeliveryAttempt"
  ALTER COLUMN "outcome" DROP NOT NULL,
  ALTER COLUMN "finishedAt" DROP NOT NULL;

ALTER TABLE "CustomerWebhookDeliveryAttempt"
  DROP CONSTRAINT "CustomerWebhookDeliveryAttempt_shape_check",
  ADD CONSTRAINT "CustomerWebhookDeliveryAttempt_shape_check" CHECK (
    "generation" > 0
    AND "attemptNumber" > 0
    AND ("statusCode" IS NULL OR "statusCode" BETWEEN 100 AND 599)
    AND "requestTimestamp" <= "startedAt"
    AND "startedAt" - "requestTimestamp" < INTERVAL '1 second'
    AND (
      (
        "outcome" IS NULL
        AND "statusCode" IS NULL
        AND "errorCode" IS NULL
        AND "finishedAt" IS NULL
      )
      OR (
        "outcome" IS NOT NULL
        AND length("outcome") > 0
        AND "finishedAt" IS NOT NULL
        AND "finishedAt" >= "startedAt"
      )
    )
  );

CREATE UNIQUE INDEX "CustomerWebhookDeliveryAttempt_unfinished_key"
  ON "CustomerWebhookDeliveryAttempt"("orgId", "deliveryId", "generation")
  WHERE "outcome" IS NULL AND "finishedAt" IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_customer_webhook_attempt_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF OLD."outcome" IS NOT NULL OR OLD."finishedAt" IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Completed customer webhook attempt evidence is immutable.';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."orgId" IS DISTINCT FROM OLD."orgId"
    OR NEW."deliveryId" IS DISTINCT FROM OLD."deliveryId"
    OR NEW."generation" IS DISTINCT FROM OLD."generation"
    OR NEW."attemptNumber" IS DISTINCT FROM OLD."attemptNumber"
    OR NEW."requestTimestamp" IS DISTINCT FROM OLD."requestTimestamp"
    OR NEW."startedAt" IS DISTINCT FROM OLD."startedAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR NEW."outcome" IS NULL
    OR NEW."finishedAt" IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Customer webhook attempt reservation identity is immutable.';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.enforce_customer_webhook_attempt_completion() FROM PUBLIC;
CREATE TRIGGER "CustomerWebhookDeliveryAttempt_completion_trigger"
  BEFORE UPDATE ON "CustomerWebhookDeliveryAttempt"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_webhook_attempt_completion();

GRANT UPDATE ("statusCode", "outcome", "errorCode", "finishedAt")
  ON TABLE "CustomerWebhookDeliveryAttempt" TO signalstack_runtime;

CREATE OR REPLACE FUNCTION public.claim_due_customer_webhook_deliveries(
  max_deliveries integer,
  lease_ms integer,
  claim_token uuid
)
RETURNS TABLE("deliveryId" text, "orgId" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  effective_now timestamptz := clock_timestamp();
BEGIN
  IF max_deliveries IS NULL OR max_deliveries < 1 OR max_deliveries > 100
    OR lease_ms IS NULL OR lease_ms < 1000 OR lease_ms > 3600000
    OR claim_token IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Customer webhook dispatch arguments are invalid.';
  END IF;

  -- A disabled endpoint cannot retry an abandoned external attempt. Complete the durable
  -- reservation as ambiguous before terminalizing its expired delivery lease.
  UPDATE public."CustomerWebhookDeliveryAttempt" AS attempt
  SET
    "outcome" = 'ambiguous',
    "errorCode" = 'ENDPOINT_DISABLED_LEASE_EXPIRED',
    "finishedAt" = effective_now
  FROM public."CustomerWebhookDelivery" AS delivery
  JOIN public."CustomerWebhookEndpoint" AS endpoint
    ON endpoint."orgId" = delivery."orgId"
   AND endpoint."id" = delivery."endpointId"
  WHERE attempt."orgId" = delivery."orgId"
    AND attempt."deliveryId" = delivery."id"
    AND attempt."generation" = delivery."generation"
    AND attempt."attemptNumber" = delivery."attemptCount" + 1
    AND attempt."outcome" IS NULL
    AND attempt."finishedAt" IS NULL
    AND endpoint."status" = 'DISABLED'::public."CustomerWebhookEndpointStatus"
    AND delivery."status" = 'PROCESSING'::public."CustomerWebhookDeliveryStatus"
    AND delivery."processingExpiresAt" <= effective_now;

  UPDATE public."CustomerWebhookDelivery" AS delivery
  SET
    "status" = 'CANCELED'::public."CustomerWebhookDeliveryStatus",
    "attemptCount" = GREATEST(
      delivery."attemptCount",
      COALESCE((
        SELECT MAX(attempt."attemptNumber")
        FROM public."CustomerWebhookDeliveryAttempt" AS attempt
        WHERE attempt."orgId" = delivery."orgId"
          AND attempt."deliveryId" = delivery."id"
          AND attempt."generation" = delivery."generation"
      ), delivery."attemptCount")
    ),
    "processingToken" = NULL,
    "processingExpiresAt" = NULL,
    "lastErrorCode" = COALESCE(delivery."lastErrorCode", 'ENDPOINT_DISABLED'),
    "updatedAt" = effective_now
  FROM public."CustomerWebhookEndpoint" AS endpoint
  WHERE endpoint."orgId" = delivery."orgId"
    AND endpoint."id" = delivery."endpointId"
    AND endpoint."status" = 'DISABLED'::public."CustomerWebhookEndpointStatus"
    AND (
      delivery."status" = 'PENDING'::public."CustomerWebhookDeliveryStatus"
      OR (
        delivery."status" = 'PROCESSING'::public."CustomerWebhookDeliveryStatus"
        AND delivery."processingExpiresAt" <= effective_now
      )
    );

  RETURN QUERY
  WITH candidates AS (
    SELECT delivery."id"
    FROM public."CustomerWebhookDelivery" delivery
    JOIN public."CustomerWebhookEndpoint" endpoint
      ON endpoint."orgId" = delivery."orgId"
     AND endpoint."id" = delivery."endpointId"
    WHERE endpoint."status" = 'ACTIVE'::public."CustomerWebhookEndpointStatus"
      AND delivery."attemptCount" < delivery."maxAttempts"
      AND delivery."nextAttemptAt" <= effective_now
      AND (
        delivery."status" = 'PENDING'::public."CustomerWebhookDeliveryStatus"
        OR (
          delivery."status" = 'PROCESSING'::public."CustomerWebhookDeliveryStatus"
          AND (
            delivery."processingToken" IS NULL
            OR delivery."processingExpiresAt" IS NULL
            OR delivery."processingExpiresAt" <= effective_now
          )
        )
      )
    ORDER BY delivery."nextAttemptAt", delivery."id"
    FOR UPDATE OF delivery SKIP LOCKED
    LIMIT max_deliveries
  ), claimed AS (
    UPDATE public."CustomerWebhookDelivery" delivery
    SET
      "status" = 'PROCESSING'::public."CustomerWebhookDeliveryStatus",
      "processingToken" = claim_token::text,
      "processingExpiresAt" = effective_now + (lease_ms * INTERVAL '1 millisecond'),
      "updatedAt" = effective_now
    FROM candidates
    WHERE delivery."id" = candidates."id"
    RETURNING delivery."id", delivery."orgId"
  )
  SELECT claimed."id", claimed."orgId"
  FROM claimed
  ORDER BY claimed."id";
END
$function$;

REVOKE ALL ON FUNCTION public.claim_due_customer_webhook_deliveries(integer, integer, uuid)
  FROM PUBLIC, signalstack_runtime, signalstack_control;
GRANT EXECUTE ON FUNCTION public.claim_due_customer_webhook_deliveries(integer, integer, uuid)
  TO signalstack_worker;
