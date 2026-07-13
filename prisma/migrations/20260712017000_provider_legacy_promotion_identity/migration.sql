-- Preserve legacy row identity during the sole CONFIGURED -> owned VERIFIED promotion.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_verified_provider_phone_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."providerAccountId" IS NOT NULL
      AND NEW."status" <> 'VERIFIED'::public."ProviderPhoneNumberStatus" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Owned provider phone must begin verified.';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."providerAccountId" IS NULL AND NEW."providerAccountId" IS NOT NULL THEN
    IF NEW."id" IS DISTINCT FROM OLD."id"
      OR NEW."orgId" IS DISTINCT FROM OLD."orgId"
      OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
      OR OLD."status" <> 'CONFIGURED'::public."ProviderPhoneNumberStatus"
      OR OLD."provider" IS DISTINCT FROM NEW."provider"
      OR OLD."phoneNumber" IS DISTINCT FROM NEW."phoneNumber"
      OR OLD."phoneNumberHash" IS NOT NULL
      OR OLD."providerMessagingServiceId" IS NOT NULL
      OR OLD."externalNumberId" IS NOT NULL
      OR OLD."externalNumberIdLast4" IS NOT NULL
      OR OLD."verifiedAt" IS NOT NULL
      OR OLD."lastCheckedAt" IS NOT NULL
      OR OLD."disabledAt" IS NOT NULL
      OR NEW."status" <> 'VERIFIED'::public."ProviderPhoneNumberStatus" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Legacy provider phone promotion is invalid.';
    END IF;
  ELSIF OLD."providerAccountId" IS NOT NULL THEN
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

REVOKE ALL ON FUNCTION public.enforce_verified_provider_phone_lifecycle()
  FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_web, signalstack_worker;

COMMIT;
