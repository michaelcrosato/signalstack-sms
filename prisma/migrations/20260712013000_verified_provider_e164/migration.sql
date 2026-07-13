-- Verified live ownership uses canonical E.164 (at most fifteen digits). Legacy metadata remains
-- untouched because non-VERIFIED rows are outside this lifecycle predicate.

BEGIN;

ALTER TABLE "ProviderPhoneNumber"
  DROP CONSTRAINT "ProviderPhoneNumber_verified_lifecycle_check",
  ADD CONSTRAINT "ProviderPhoneNumber_verified_lifecycle_check" CHECK (
    "status" <> 'VERIFIED'::"ProviderPhoneNumberStatus"
    OR (
      "provider" <> 'dummy'
      AND "providerAccountId" IS NOT NULL
      AND "externalNumberId" IS NOT NULL
      AND "phoneNumberHash" IS NOT NULL
      AND "verifiedAt" IS NOT NULL
      AND "lastCheckedAt" IS NOT NULL
      AND "lastCheckedAt" >= "verifiedAt"
      AND "disabledAt" IS NULL
      AND "phoneNumber" ~ '^\+[1-9][0-9]{4,14}$'
    )
  );

COMMIT;
