-- A local disable is reversible only through the separately verified import workflow. Preserve the
-- immutable provider identity while allowing that workflow to clear disabledAt and restore VERIFIED.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_provider_messaging_service_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."orgId" IS DISTINCT FROM OLD."orgId"
    OR NEW."providerAccountId" IS DISTINCT FROM OLD."providerAccountId"
    OR NEW."provider" IS DISTINCT FROM OLD."provider"
    OR NEW."externalServiceId" IS DISTINCT FROM OLD."externalServiceId"
    OR NEW."externalServiceIdLast4" IS DISTINCT FROM OLD."externalServiceIdLast4"
    OR NEW."verifiedAt" IS DISTINCT FROM OLD."verifiedAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Provider messaging service identity is immutable.';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_verified_provider_phone_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF OLD."status" = 'VERIFIED'::public."ProviderPhoneNumberStatus"
    OR OLD."providerAccountId" IS NOT NULL THEN
    IF NEW."id" IS DISTINCT FROM OLD."id"
      OR NEW."orgId" IS DISTINCT FROM OLD."orgId"
      OR NEW."phoneNumber" IS DISTINCT FROM OLD."phoneNumber"
      OR NEW."phoneNumberHash" IS DISTINCT FROM OLD."phoneNumberHash"
      OR NEW."provider" IS DISTINCT FROM OLD."provider"
      OR NEW."providerAccountId" IS DISTINCT FROM OLD."providerAccountId"
      OR NEW."providerMessagingServiceId" IS DISTINCT FROM OLD."providerMessagingServiceId"
      OR NEW."externalNumberId" IS DISTINCT FROM OLD."externalNumberId"
      OR NEW."externalNumberIdLast4" IS DISTINCT FROM OLD."externalNumberIdLast4"
      OR NEW."verifiedAt" IS DISTINCT FROM OLD."verifiedAt"
      OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Verified provider phone identity is immutable.';
    END IF;
  END IF;
  IF OLD."status" = 'VERIFIED'::public."ProviderPhoneNumberStatus"
    AND NEW."status" NOT IN (
      'VERIFIED'::public."ProviderPhoneNumberStatus",
      'DISABLED'::public."ProviderPhoneNumberStatus"
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Verified provider phone lifecycle cannot regress.';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.enforce_provider_messaging_service_lifecycle()
  FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_web, signalstack_worker;
REVOKE ALL ON FUNCTION public.enforce_verified_provider_phone_lifecycle()
  FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_web, signalstack_worker;

COMMIT;
