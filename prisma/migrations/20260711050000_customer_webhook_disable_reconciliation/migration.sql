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

  -- Preserve a live processing owner long enough to append the real HTTP result. Polling only
  -- reconciles disabled-endpoint work that is still pending or whose processing lease expired.
  UPDATE public."CustomerWebhookDelivery" AS delivery
  SET
    "status" = 'CANCELED'::public."CustomerWebhookDeliveryStatus",
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
