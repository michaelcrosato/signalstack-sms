-- M4 provider resource hardening: canonical capability arrays, keyed messaging-service identity,
-- and one-way ownership binding. Existing legacy phone metadata remains unbound and untouched.

BEGIN;

ALTER TABLE "ProviderMessagingService"
  ADD COLUMN "externalServiceIdHash" TEXT;

DO $service_hash_preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM "ProviderMessagingService") THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Provider messaging-service hash preflight failed.';
  END IF;
END
$service_hash_preflight$;

ALTER TABLE "ProviderMessagingService"
  ALTER COLUMN "externalServiceIdHash" SET NOT NULL,
  ALTER COLUMN "capabilities" DROP DEFAULT,
  ADD CONSTRAINT "ProviderMessagingService_external_hash_check" CHECK (
    "externalServiceIdHash" ~ '^pvlookup_v1_[A-Za-z0-9_-]{43}$'
  ),
  ADD CONSTRAINT "ProviderMessagingService_capabilities_check" CHECK (
    "capabilities" IN (
      '["sms"]'::jsonb,
      '["mms"]'::jsonb,
      '["sms", "mms"]'::jsonb
    )
  );

CREATE UNIQUE INDEX "ProviderMessagingService_externalServiceIdHash_key"
  ON "ProviderMessagingService"("externalServiceIdHash");

ALTER TABLE "ProviderPhoneNumber"
  ADD CONSTRAINT "ProviderPhoneNumber_bound_capabilities_check" CHECK (
    "providerAccountId" IS NULL
    OR (
      "status" IN (
        'VERIFIED'::"ProviderPhoneNumberStatus",
        'DISABLED'::"ProviderPhoneNumberStatus"
      )
      AND "capabilities" IN (
        '["sms"]'::jsonb,
        '["mms"]'::jsonb,
        '["sms", "mms"]'::jsonb
      )
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_provider_messaging_service_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'VERIFIED'::public."ProviderMessagingServiceStatus" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Provider messaging service must begin verified.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."orgId" IS DISTINCT FROM OLD."orgId"
    OR NEW."providerAccountId" IS DISTINCT FROM OLD."providerAccountId"
    OR NEW."provider" IS DISTINCT FROM OLD."provider"
    OR NEW."externalServiceId" IS DISTINCT FROM OLD."externalServiceId"
    OR NEW."externalServiceIdHash" IS DISTINCT FROM OLD."externalServiceIdHash"
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
  IF TG_OP = 'INSERT' THEN
    IF NEW."providerAccountId" IS NOT NULL
      AND NEW."status" <> 'VERIFIED'::public."ProviderPhoneNumberStatus" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Owned provider phone must begin verified.';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."providerAccountId" IS NULL AND NEW."providerAccountId" IS NOT NULL THEN
    IF OLD."status" <> 'CONFIGURED'::public."ProviderPhoneNumberStatus"
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

DROP TRIGGER "ProviderMessagingService_lifecycle_trigger" ON "ProviderMessagingService";
CREATE TRIGGER "ProviderMessagingService_lifecycle_trigger"
  BEFORE INSERT OR UPDATE ON "ProviderMessagingService"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_provider_messaging_service_lifecycle();

DROP TRIGGER "ProviderPhoneNumber_verified_lifecycle_trigger" ON "ProviderPhoneNumber";
CREATE TRIGGER "ProviderPhoneNumber_verified_lifecycle_trigger"
  BEFORE INSERT OR UPDATE ON "ProviderPhoneNumber"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_verified_provider_phone_lifecycle();

REVOKE ALL ON FUNCTION public.enforce_provider_messaging_service_lifecycle()
  FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_web, signalstack_worker;
REVOKE ALL ON FUNCTION public.enforce_verified_provider_phone_lifecycle()
  FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_web, signalstack_worker;

COMMIT;
