-- M5: immutable accepted payloads, guarded attempt transitions, and retained operator evidence.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_message_m5_invariants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  media_url text;
  seen_media_urls text[] := ARRAY[]::text[];
BEGIN
  FOREACH media_url IN ARRAY NEW."mediaUrls" LOOP
    IF media_url IS NULL
      OR char_length(media_url) > 2048
      OR media_url !~ '^https://[^[:space:][:cntrl:]]+$'
      OR media_url = ANY(seen_media_urls) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Message media snapshot is invalid.';
    END IF;
    seen_media_urls := array_append(seen_media_urls, media_url);
  END LOOP;

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."orgId" IS DISTINCT FROM OLD."orgId"
    OR NEW."direction" IS DISTINCT FROM OLD."direction"
    OR NEW."body" IS DISTINCT FROM OLD."body"
    OR NEW."transport" IS DISTINCT FROM OLD."transport"
    OR NEW."destination" IS DISTINCT FROM OLD."destination"
    OR NEW."mediaUrls" IS DISTINCT FROM OLD."mediaUrls"
    OR NEW."requestFingerprint" IS DISTINCT FROM OLD."requestFingerprint"
    OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
    OR NEW."acceptedAt" IS DISTINCT FROM OLD."acceptedAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Accepted message payload identity is immutable.';
  END IF;

  IF NEW."attemptCount" < OLD."attemptCount"
    OR NEW."attemptCount" > OLD."attemptCount" + 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Message attempt count transition is invalid.';
  END IF;

  IF OLD."providerMessageId" IS NOT NULL
    AND NEW."providerMessageId" IS DISTINCT FROM OLD."providerMessageId" THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Message provider identity is immutable after binding.';
  END IF;

  IF OLD."sentAt" IS NOT NULL AND NEW."sentAt" IS DISTINCT FROM OLD."sentAt" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Message sent timestamp is immutable.';
  END IF;
  IF OLD."cancelledAt" IS NOT NULL AND NEW."cancelledAt" IS DISTINCT FROM OLD."cancelledAt" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Message cancellation timestamp is immutable.';
  END IF;
  IF OLD."ambiguousAt" IS NOT NULL AND NEW."ambiguousAt" IS DISTINCT FROM OLD."ambiguousAt" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Message ambiguity timestamp is immutable.';
  END IF;

  IF NEW."applicationStatus" IS DISTINCT FROM OLD."applicationStatus"
    AND NOT (
      (OLD."applicationStatus" = 'ACCEPTED'::public."MessageApplicationStatus"
        AND NEW."applicationStatus" IN (
          'SCHEDULED'::public."MessageApplicationStatus",
          'PROCESSING'::public."MessageApplicationStatus",
          'SENT'::public."MessageApplicationStatus",
          'DELIVERED'::public."MessageApplicationStatus",
          'FAILED'::public."MessageApplicationStatus",
          'CANCELLED'::public."MessageApplicationStatus",
          'AMBIGUOUS'::public."MessageApplicationStatus"
        ))
      OR (OLD."applicationStatus" = 'SCHEDULED'::public."MessageApplicationStatus"
        AND NEW."applicationStatus" IN (
          'PROCESSING'::public."MessageApplicationStatus",
          'SENT'::public."MessageApplicationStatus",
          'DELIVERED'::public."MessageApplicationStatus",
          'FAILED'::public."MessageApplicationStatus",
          'CANCELLED'::public."MessageApplicationStatus",
          'AMBIGUOUS'::public."MessageApplicationStatus"
        ))
      OR (OLD."applicationStatus" = 'PROCESSING'::public."MessageApplicationStatus"
        AND NEW."applicationStatus" IN (
          'SCHEDULED'::public."MessageApplicationStatus",
          'SENT'::public."MessageApplicationStatus",
          'DELIVERED'::public."MessageApplicationStatus",
          'FAILED'::public."MessageApplicationStatus",
          'CANCELLED'::public."MessageApplicationStatus",
          'AMBIGUOUS'::public."MessageApplicationStatus"
        ))
      OR (OLD."applicationStatus" = 'SENT'::public."MessageApplicationStatus"
        AND NEW."applicationStatus" IN (
          'DELIVERED'::public."MessageApplicationStatus",
          'FAILED'::public."MessageApplicationStatus",
          'AMBIGUOUS'::public."MessageApplicationStatus"
        ))
      OR (OLD."applicationStatus" = 'AMBIGUOUS'::public."MessageApplicationStatus"
        AND NEW."applicationStatus" IN (
          'SCHEDULED'::public."MessageApplicationStatus",
          'SENT'::public."MessageApplicationStatus",
          'DELIVERED'::public."MessageApplicationStatus",
          'FAILED'::public."MessageApplicationStatus",
          'CANCELLED'::public."MessageApplicationStatus"
        ))
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Message application-state transition is invalid.';
  END IF;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_message_attempt_invariants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  media_url text;
  seen_media_urls text[] := ARRAY[]::text[];
BEGIN
  FOREACH media_url IN ARRAY NEW."mediaUrls" LOOP
    IF media_url IS NULL
      OR char_length(media_url) > 2048
      OR media_url !~ '^https://[^[:space:][:cntrl:]]+$'
      OR media_url = ANY(seen_media_urls) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Message-attempt media snapshot is invalid.';
    END IF;
    seen_media_urls := array_append(seen_media_urls, media_url);
  END LOOP;

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."orgId" IS DISTINCT FROM OLD."orgId"
    OR NEW."messageId" IS DISTINCT FROM OLD."messageId"
    OR NEW."attemptNumber" IS DISTINCT FROM OLD."attemptNumber"
    OR NEW."retryOfAttemptId" IS DISTINCT FROM OLD."retryOfAttemptId"
    OR NEW."transport" IS DISTINCT FROM OLD."transport"
    OR NEW."dueAt" IS DISTINCT FROM OLD."dueAt"
    OR NEW."providerAccountId" IS DISTINCT FROM OLD."providerAccountId"
    OR NEW."providerPhoneNumberId" IS DISTINCT FROM OLD."providerPhoneNumberId"
    OR NEW."destination" IS DISTINCT FROM OLD."destination"
    OR NEW."body" IS DISTINCT FROM OLD."body"
    OR NEW."mediaUrls" IS DISTINCT FROM OLD."mediaUrls"
    OR NEW."requestFingerprint" IS DISTINCT FROM OLD."requestFingerprint"
    OR NEW."callbackCorrelationId" IS DISTINCT FROM OLD."callbackCorrelationId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Message-attempt payload identity is immutable.';
  END IF;

  IF OLD."providerCredentialSecretId" IS NOT NULL
    AND (
      NEW."providerCredentialSecretId" IS DISTINCT FROM OLD."providerCredentialSecretId"
      OR NEW."providerCredentialVersion" IS DISTINCT FROM OLD."providerCredentialVersion"
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Message-attempt credential generation is immutable after binding.';
  END IF;

  IF OLD."providerCredentialSecretId" IS NULL
    AND NEW."providerCredentialSecretId" IS NOT NULL
    AND NOT (
      OLD."status" = 'PROCESSING'::public."MessageAttemptStatus"
      AND NEW."status" = 'PROCESSING'::public."MessageAttemptStatus"
      AND OLD."providerCallStartedAt" IS NULL
      AND NEW."providerCallStartedAt" IS NOT NULL
      AND NEW."processingToken" IS NOT NULL
      AND NEW."processingToken" IS NOT DISTINCT FROM OLD."processingToken"
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Message-attempt credential binding must commit at the provider-call frontier.';
  END IF;

  IF OLD."providerCallStartedAt" IS NOT NULL
    AND NEW."providerCallStartedAt" IS DISTINCT FROM OLD."providerCallStartedAt" THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Message-attempt provider-call frontier is immutable.';
  END IF;

  IF OLD."providerCallStartedAt" IS NULL
    AND NEW."providerCallStartedAt" IS NOT NULL
    AND NOT (
      OLD."status" = 'PROCESSING'::public."MessageAttemptStatus"
      AND NEW."status" = 'PROCESSING'::public."MessageAttemptStatus"
      AND NEW."providerCredentialSecretId" IS NOT NULL
      AND NEW."providerCredentialVersion" IS NOT NULL
      AND NEW."processingToken" IS NOT NULL
      AND NEW."processingToken" IS NOT DISTINCT FROM OLD."processingToken"
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Message-attempt provider-call frontier transition is invalid.';
  END IF;

  IF OLD."providerCallStartedAt" IS NOT NULL
    AND NEW."status" = 'PROCESSING'::public."MessageAttemptStatus"
    AND (
      NEW."processingToken" IS DISTINCT FROM OLD."processingToken"
      OR NEW."processingExpiresAt" IS DISTINCT FROM OLD."processingExpiresAt"
      OR NEW."claimedAt" IS DISTINCT FROM OLD."claimedAt"
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Message-attempt owner cannot change after the provider-call frontier.';
  END IF;

  IF OLD."providerMessageId" IS NOT NULL
    AND NEW."providerMessageId" IS DISTINCT FROM OLD."providerMessageId" THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Message-attempt provider identity is immutable after binding.';
  END IF;

  IF OLD."completedAt" IS NOT NULL
    AND NEW."completedAt" IS DISTINCT FROM OLD."completedAt" THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Message-attempt completion timestamp is immutable.';
  END IF;

  IF OLD."reconciledAt" IS NOT NULL
    AND (
      NEW."reconciledAt" IS DISTINCT FROM OLD."reconciledAt"
      OR NEW."reconciledByUserId" IS DISTINCT FROM OLD."reconciledByUserId"
      OR NEW."reconciliationNote" IS DISTINCT FROM OLD."reconciliationNote"
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Message-attempt reconciliation evidence is immutable.';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status"
    AND NOT (
      (OLD."status" = 'QUEUED'::public."MessageAttemptStatus"
        AND NEW."status" IN (
          'PROCESSING'::public."MessageAttemptStatus",
          'CANCELLED'::public."MessageAttemptStatus"
        ))
      OR (OLD."status" = 'QUEUED'::public."MessageAttemptStatus"
        AND OLD."transport" = 'DUMMY'::public."MessageTransport"
        AND NEW."transport" = 'DUMMY'::public."MessageTransport"
        AND NEW."status" = 'SUCCEEDED'::public."MessageAttemptStatus")
      OR (OLD."status" = 'PROCESSING'::public."MessageAttemptStatus"
        AND NEW."status" IN (
          'SUCCEEDED'::public."MessageAttemptStatus",
          'FAILED'::public."MessageAttemptStatus",
          'CANCELLED'::public."MessageAttemptStatus",
          'AMBIGUOUS'::public."MessageAttemptStatus"
        ))
      OR (OLD."status" = 'AMBIGUOUS'::public."MessageAttemptStatus"
        AND NEW."status" IN (
          'SUCCEEDED'::public."MessageAttemptStatus",
          'FAILED'::public."MessageAttemptStatus",
          'RESOLVED_NOT_SENT'::public."MessageAttemptStatus"
        ))
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Message-attempt state transition is invalid.';
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.enforce_message_m5_invariants()
  FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_web, signalstack_worker;
REVOKE ALL ON FUNCTION public.enforce_message_attempt_invariants()
  FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_web, signalstack_worker;

CREATE TRIGGER "Message_m5_invariants_trigger"
  BEFORE INSERT OR UPDATE ON "Message"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_m5_invariants();
CREATE TRIGGER "MessageAttempt_invariants_trigger"
  BEFORE INSERT OR UPDATE ON "MessageAttempt"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_attempt_invariants();

CREATE OR REPLACE FUNCTION public.enforce_integration_audit_actor_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW."actorUserId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."Membership"
    WHERE "orgId" = NEW."orgId" AND "userId" = NEW."actorUserId"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Integration-audit actor must be a member of the audit organization.';
  END IF;
  IF NEW."subjectId" IS NOT NULL THEN
    IF NEW."subjectType" = 'organization' AND NEW."subjectId" <> NEW."orgId" THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Integration-audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" = 'api_credential' AND NOT EXISTS (
      SELECT 1 FROM public."ApiCredential"
      WHERE "orgId" = NEW."orgId" AND "id" = NEW."subjectId"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Integration-audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" = 'customer_webhook_endpoint' AND NOT EXISTS (
      SELECT 1 FROM public."CustomerWebhookEndpoint"
      WHERE "orgId" = NEW."orgId" AND "id" = NEW."subjectId"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Integration-audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" = 'customer_webhook_delivery' AND NOT EXISTS (
      SELECT 1 FROM public."CustomerWebhookDelivery"
      WHERE "orgId" = NEW."orgId" AND "id" = NEW."subjectId"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Integration-audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" = 'provider_account' AND NOT EXISTS (
      SELECT 1 FROM public."ProviderAccount"
      WHERE "orgId" = NEW."orgId" AND "id" = NEW."subjectId"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Integration-audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" = 'provider_credential_secret' AND NOT EXISTS (
      SELECT 1 FROM public."ProviderCredentialSecret"
      WHERE "orgId" = NEW."orgId" AND "id" = NEW."subjectId"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Integration-audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" = 'provider_messaging_service' AND NOT EXISTS (
      SELECT 1 FROM public."ProviderMessagingService"
      WHERE "orgId" = NEW."orgId" AND "id" = NEW."subjectId"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Integration-audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" = 'provider_phone_number' AND NOT EXISTS (
      SELECT 1 FROM public."ProviderPhoneNumber"
      WHERE "orgId" = NEW."orgId" AND "id" = NEW."subjectId"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Integration-audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" = 'message_attempt' AND NOT EXISTS (
      SELECT 1 FROM public."MessageAttempt"
      WHERE "orgId" = NEW."orgId" AND "id" = NEW."subjectId"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Integration-audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" NOT IN (
      'organization',
      'api_credential',
      'customer_webhook_endpoint',
      'customer_webhook_delivery',
      'provider_account',
      'provider_credential_secret',
      'provider_messaging_service',
      'provider_phone_number',
      'message_attempt'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Integration-audit subject type is invalid.';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.enforce_integration_audit_actor_org()
  FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_web, signalstack_worker;

COMMIT;
