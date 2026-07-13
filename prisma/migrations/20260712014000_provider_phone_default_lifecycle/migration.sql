-- Preserve legacy unbound metadata, but an account-bound disabled sender can never remain default.

BEGIN;

ALTER TABLE "ProviderPhoneNumber"
  DROP CONSTRAINT "ProviderPhoneNumber_disabled_lifecycle_check",
  ADD CONSTRAINT "ProviderPhoneNumber_disabled_lifecycle_check" CHECK (
    "providerAccountId" IS NULL
    OR "status" <> 'DISABLED'::"ProviderPhoneNumberStatus"
    OR (
      "disabledAt" IS NOT NULL
      AND "verifiedAt" IS NOT NULL
      AND "disabledAt" >= "verifiedAt"
      AND NOT "isDefault"
    )
  );

COMMIT;
