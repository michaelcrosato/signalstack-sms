-- M4: verified provider-account, credential-envelope, messaging-service, and phone-number
-- ownership substrate. Hashes are domain-separated keyed HMACs supplied by the application;
-- the database never derives lookup hashes from provider identifiers or phone numbers.

BEGIN;

CREATE TABLE "ProviderAccount" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalAccountId" TEXT NOT NULL,
  "externalAccountIdHash" TEXT NOT NULL,
  "externalAccountIdLast4" TEXT NOT NULL,
  "status" "ProviderAccountStatus" NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "accountStatus" TEXT,
  "accountType" TEXT,
  "verifiedAt" TIMESTAMP(3) NOT NULL,
  "lastCheckedAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderAccount_provider_check" CHECK (
    "provider" ~ '^[a-z][a-z0-9_-]{0,63}$'
  ),
  CONSTRAINT "ProviderAccount_external_id_check" CHECK (
    char_length("externalAccountId") BETWEEN 4 AND 191
    AND "externalAccountId" = btrim("externalAccountId")
    AND "externalAccountIdLast4" = right("externalAccountId", 4)
  ),
  CONSTRAINT "ProviderAccount_external_hash_check" CHECK (
    "externalAccountIdHash" ~ '^pvlookup_v1_[A-Za-z0-9_-]{43}$'
  ),
  CONSTRAINT "ProviderAccount_lifecycle_check" CHECK (
    "lastCheckedAt" >= "verifiedAt"
    AND (
      ("status" <> 'REVOKED'::"ProviderAccountStatus" AND "revokedAt" IS NULL)
      OR (
        "status" = 'REVOKED'::"ProviderAccountStatus"
        AND "revokedAt" IS NOT NULL
        AND "revokedAt" >= "verifiedAt"
        AND NOT "isDefault"
      )
    )
  ),
  CONSTRAINT "ProviderAccount_metadata_check" CHECK (
    ("accountStatus" IS NULL OR char_length("accountStatus") BETWEEN 1 AND 128)
    AND ("accountType" IS NULL OR char_length("accountType") BETWEEN 1 AND 128)
  )
);

CREATE TABLE "ProviderCredentialSecret" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "envelopeVersion" INTEGER NOT NULL DEFAULT 1,
  "algorithm" TEXT NOT NULL DEFAULT 'aes-256-gcm',
  "keyVersion" INTEGER NOT NULL,
  "iv" TEXT NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "authTag" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderCredentialSecret_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderCredentialSecret_version_check" CHECK (
    "version" > 0 AND "envelopeVersion" > 0 AND "keyVersion" > 0
  ),
  CONSTRAINT "ProviderCredentialSecret_material_check" CHECK (
    char_length("algorithm") BETWEEN 1 AND 64
    AND char_length("iv") BETWEEN 1 AND 4096
    AND char_length("ciphertext") BETWEEN 1 AND 65536
    AND char_length("authTag") BETWEEN 1 AND 4096
    AND char_length("fingerprint") BETWEEN 1 AND 512
  ),
  CONSTRAINT "ProviderCredentialSecret_retirement_check" CHECK (
    "retiredAt" IS NULL OR "retiredAt" >= "activeFrom"
  )
);

CREATE TABLE "ProviderMessagingService" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalServiceId" TEXT NOT NULL,
  "externalServiceIdLast4" TEXT NOT NULL,
  "status" "ProviderMessagingServiceStatus" NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "capabilities" JSONB NOT NULL DEFAULT '{}',
  "verifiedAt" TIMESTAMP(3) NOT NULL,
  "lastCheckedAt" TIMESTAMP(3) NOT NULL,
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderMessagingService_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderMessagingService_provider_check" CHECK (
    "provider" ~ '^[a-z][a-z0-9_-]{0,63}$'
  ),
  CONSTRAINT "ProviderMessagingService_external_id_check" CHECK (
    char_length("externalServiceId") BETWEEN 4 AND 191
    AND "externalServiceId" = btrim("externalServiceId")
    AND "externalServiceIdLast4" = right("externalServiceId", 4)
  ),
  CONSTRAINT "ProviderMessagingService_lifecycle_check" CHECK (
    "lastCheckedAt" >= "verifiedAt"
    AND (
      (
        "status" = 'VERIFIED'::"ProviderMessagingServiceStatus"
        AND "disabledAt" IS NULL
      )
      OR (
        "status" = 'DISABLED'::"ProviderMessagingServiceStatus"
        AND "disabledAt" IS NOT NULL
        AND "disabledAt" >= "verifiedAt"
        AND NOT "isDefault"
      )
    )
  )
);

ALTER TABLE "ProviderPhoneNumber"
  ADD COLUMN "phoneNumberHash" TEXT,
  ADD COLUMN "providerAccountId" TEXT,
  ADD COLUMN "providerMessagingServiceId" TEXT,
  ADD COLUMN "externalNumberId" TEXT,
  ADD COLUMN "externalNumberIdLast4" TEXT,
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "lastCheckedAt" TIMESTAMP(3),
  ADD COLUMN "disabledAt" TIMESTAMP(3),
  ADD CONSTRAINT "ProviderPhoneNumber_hash_check" CHECK (
    "phoneNumberHash" IS NULL OR "phoneNumberHash" ~ '^pvlookup_v1_[A-Za-z0-9_-]{43}$'
  ),
  ADD CONSTRAINT "ProviderPhoneNumber_external_id_check" CHECK (
    ("externalNumberId" IS NULL AND "externalNumberIdLast4" IS NULL)
    OR (
      char_length("externalNumberId") BETWEEN 4 AND 191
      AND "externalNumberId" = btrim("externalNumberId")
      AND "externalNumberIdLast4" = right("externalNumberId", 4)
    )
  ),
  ADD CONSTRAINT "ProviderPhoneNumber_service_account_check" CHECK (
    "providerMessagingServiceId" IS NULL OR "providerAccountId" IS NOT NULL
  ),
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
      AND "phoneNumber" ~ '^\+[1-9][0-9]{4,31}$'
    )
  ),
  ADD CONSTRAINT "ProviderPhoneNumber_disabled_lifecycle_check" CHECK (
    "providerAccountId" IS NULL
    OR "status" <> 'DISABLED'::"ProviderPhoneNumberStatus"
    OR (
      "disabledAt" IS NOT NULL
      AND "verifiedAt" IS NOT NULL
      AND "disabledAt" >= "verifiedAt"
    )
  );

CREATE UNIQUE INDEX "ProviderAccount_orgId_id_key"
  ON "ProviderAccount"("orgId", "id");
CREATE UNIQUE INDEX "ProviderAccount_orgId_id_provider_key"
  ON "ProviderAccount"("orgId", "id", "provider");
CREATE UNIQUE INDEX "ProviderAccount_provider_externalAccountId_key"
  ON "ProviderAccount"("provider", "externalAccountId");
CREATE UNIQUE INDEX "ProviderAccount_externalAccountIdHash_key"
  ON "ProviderAccount"("externalAccountIdHash");
CREATE UNIQUE INDEX "ProviderAccount_default_key"
  ON "ProviderAccount"("orgId", "provider")
  WHERE "isDefault" AND "status" <> 'REVOKED'::"ProviderAccountStatus";
CREATE INDEX "ProviderAccount_orgId_idx" ON "ProviderAccount"("orgId");
CREATE INDEX "ProviderAccount_orgId_provider_status_idx"
  ON "ProviderAccount"("orgId", "provider", "status");

CREATE UNIQUE INDEX "ProviderCredentialSecret_orgId_id_key"
  ON "ProviderCredentialSecret"("orgId", "id");
CREATE UNIQUE INDEX "ProviderCredentialSecret_providerAccountId_version_key"
  ON "ProviderCredentialSecret"("providerAccountId", "version");
CREATE UNIQUE INDEX "ProviderCredentialSecret_active_key"
  ON "ProviderCredentialSecret"("providerAccountId")
  WHERE "retiredAt" IS NULL;
CREATE INDEX "ProviderCredentialSecret_orgId_idx"
  ON "ProviderCredentialSecret"("orgId");
CREATE INDEX "ProviderCredentialSecret_orgId_providerAccountId_idx"
  ON "ProviderCredentialSecret"("orgId", "providerAccountId");
CREATE INDEX "ProviderCredentialSecret_providerAccountId_retiredAt_idx"
  ON "ProviderCredentialSecret"("providerAccountId", "retiredAt");

CREATE UNIQUE INDEX "ProviderMessagingService_orgId_id_key"
  ON "ProviderMessagingService"("orgId", "id");
CREATE UNIQUE INDEX "ProviderMessagingService_orgId_providerAccountId_provider_id_key"
  ON "ProviderMessagingService"("orgId", "providerAccountId", "provider", "id");
CREATE UNIQUE INDEX "ProviderMessagingService_provider_externalServiceId_key"
  ON "ProviderMessagingService"("provider", "externalServiceId");
CREATE UNIQUE INDEX "ProviderMessagingService_default_key"
  ON "ProviderMessagingService"("providerAccountId")
  WHERE "isDefault" AND "status" = 'VERIFIED'::"ProviderMessagingServiceStatus";
CREATE INDEX "ProviderMessagingService_orgId_idx"
  ON "ProviderMessagingService"("orgId");
CREATE INDEX "ProviderMessagingService_orgId_providerAccountId_status_idx"
  ON "ProviderMessagingService"("orgId", "providerAccountId", "status");

CREATE UNIQUE INDEX "ProviderPhoneNumber_orgId_id_key"
  ON "ProviderPhoneNumber"("orgId", "id");
CREATE UNIQUE INDEX "ProviderPhoneNumber_provider_externalNumberId_key"
  ON "ProviderPhoneNumber"("provider", "externalNumberId");
CREATE UNIQUE INDEX "ProviderPhoneNumber_verified_ownership_key"
  ON "ProviderPhoneNumber"("phoneNumberHash")
  WHERE "status" = 'VERIFIED'::"ProviderPhoneNumberStatus" AND "provider" <> 'dummy';
CREATE INDEX "ProviderPhoneNumber_orgId_providerAccountId_idx"
  ON "ProviderPhoneNumber"("orgId", "providerAccountId");
CREATE INDEX "ProviderPhoneNumber_orgId_providerMessagingServiceId_idx"
  ON "ProviderPhoneNumber"("orgId", "providerMessagingServiceId");
CREATE INDEX "ProviderPhoneNumber_orgId_status_idx"
  ON "ProviderPhoneNumber"("orgId", "status");

ALTER TABLE "ProviderAccount"
  ADD CONSTRAINT "ProviderAccount_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProviderCredentialSecret"
  ADD CONSTRAINT "ProviderCredentialSecret_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProviderCredentialSecret_orgId_providerAccountId_fkey"
    FOREIGN KEY ("orgId", "providerAccountId")
    REFERENCES "ProviderAccount"("orgId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderMessagingService"
  ADD CONSTRAINT "ProviderMessagingService_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProviderMessagingService_orgId_providerAccountId_provider_fkey"
    FOREIGN KEY ("orgId", "providerAccountId", "provider")
    REFERENCES "ProviderAccount"("orgId", "id", "provider")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderPhoneNumber"
  ADD CONSTRAINT "ProviderPhoneNumber_orgId_providerAccountId_provider_fkey"
    FOREIGN KEY ("orgId", "providerAccountId", "provider")
    REFERENCES "ProviderAccount"("orgId", "id", "provider")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProviderPhoneNumber_orgId_providerAccountId_provider_serviceId_fkey"
    FOREIGN KEY ("orgId", "providerAccountId", "provider", "providerMessagingServiceId")
    REFERENCES "ProviderMessagingService"("orgId", "providerAccountId", "provider", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION public.enforce_provider_account_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."orgId" IS DISTINCT FROM OLD."orgId"
    OR NEW."provider" IS DISTINCT FROM OLD."provider"
    OR NEW."externalAccountId" IS DISTINCT FROM OLD."externalAccountId"
    OR NEW."externalAccountIdHash" IS DISTINCT FROM OLD."externalAccountIdHash"
    OR NEW."externalAccountIdLast4" IS DISTINCT FROM OLD."externalAccountIdLast4"
    OR NEW."verifiedAt" IS DISTINCT FROM OLD."verifiedAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Provider account identity is immutable.';
  END IF;
  IF OLD."status" = 'REVOKED'::public."ProviderAccountStatus"
    AND (
      NEW."status" IS DISTINCT FROM OLD."status"
      OR NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt"
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Revoked provider account lifecycle is immutable.';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_provider_credential_secret_material()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."orgId" IS DISTINCT FROM OLD."orgId"
    OR NEW."providerAccountId" IS DISTINCT FROM OLD."providerAccountId"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."envelopeVersion" IS DISTINCT FROM OLD."envelopeVersion"
    OR NEW."algorithm" IS DISTINCT FROM OLD."algorithm"
    OR NEW."keyVersion" IS DISTINCT FROM OLD."keyVersion"
    OR NEW."iv" IS DISTINCT FROM OLD."iv"
    OR NEW."ciphertext" IS DISTINCT FROM OLD."ciphertext"
    OR NEW."authTag" IS DISTINCT FROM OLD."authTag"
    OR NEW."fingerprint" IS DISTINCT FROM OLD."fingerprint"
    OR NEW."activeFrom" IS DISTINCT FROM OLD."activeFrom"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR (OLD."retiredAt" IS NOT NULL AND NEW."retiredAt" IS DISTINCT FROM OLD."retiredAt") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Provider credential secret material is immutable.';
  END IF;
  RETURN NEW;
END
$function$;

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
  IF OLD."status" = 'DISABLED'::public."ProviderMessagingServiceStatus"
    AND (
      NEW."status" IS DISTINCT FROM OLD."status"
      OR NEW."disabledAt" IS DISTINCT FROM OLD."disabledAt"
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Disabled provider messaging service lifecycle is immutable.';
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
  IF OLD."status" = 'DISABLED'::public."ProviderPhoneNumberStatus"
    AND OLD."providerAccountId" IS NOT NULL
    AND (
      NEW."status" IS DISTINCT FROM OLD."status"
      OR NEW."disabledAt" IS DISTINCT FROM OLD."disabledAt"
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Disabled provider phone lifecycle is immutable.';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.enforce_provider_account_lifecycle()
  FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_web, signalstack_worker;
REVOKE ALL ON FUNCTION public.enforce_provider_credential_secret_material()
  FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_web, signalstack_worker;
REVOKE ALL ON FUNCTION public.enforce_provider_messaging_service_lifecycle()
  FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_web, signalstack_worker;
REVOKE ALL ON FUNCTION public.enforce_verified_provider_phone_lifecycle()
  FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_web, signalstack_worker;

CREATE TRIGGER "ProviderAccount_lifecycle_trigger"
  BEFORE UPDATE ON "ProviderAccount"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_provider_account_lifecycle();
CREATE TRIGGER "ProviderCredentialSecret_material_trigger"
  BEFORE UPDATE ON "ProviderCredentialSecret"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_provider_credential_secret_material();
CREATE TRIGGER "ProviderMessagingService_lifecycle_trigger"
  BEFORE UPDATE ON "ProviderMessagingService"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_provider_messaging_service_lifecycle();
CREATE TRIGGER "ProviderPhoneNumber_verified_lifecycle_trigger"
  BEFORE UPDATE ON "ProviderPhoneNumber"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_verified_provider_phone_lifecycle();

-- Extend integration-audit subject validation without introducing reverse foreign keys that would
-- erase or block retained evidence when an individual provider object reaches terminal lifecycle.
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
    ELSIF NEW."subjectType" NOT IN (
      'organization',
      'api_credential',
      'customer_webhook_endpoint',
      'customer_webhook_delivery',
      'provider_account',
      'provider_credential_secret',
      'provider_messaging_service',
      'provider_phone_number'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Integration-audit subject type is invalid.';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.enforce_integration_audit_actor_org()
  FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_web, signalstack_worker;

-- New provider rows use the same fail-closed tenant policy and owner capability as every ordinary
-- tenant table. Capability roles receive no direct table grant; web code must SET LOCAL ROLE runtime.
DO $tenant_tables$
DECLARE
  table_name text;
  tenant_tables constant text[] := ARRAY[
    'ProviderAccount',
    'ProviderCredentialSecret',
    'ProviderMessagingService'
  ];
BEGIN
  FOREACH table_name IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      $policy$
        CREATE POLICY tenant_scope ON %I
        AS PERMISSIVE
        FOR ALL
        TO signalstack_runtime
        USING ("orgId" = NULLIF(current_setting('app.current_org_id', true), ''))
        WITH CHECK ("orgId" = NULLIF(current_setting('app.current_org_id', true), ''))
      $policy$,
      table_name
    );
    EXECUTE format(
      'CREATE POLICY owner_scope ON %I FOR ALL TO signalstack_owner USING (true) WITH CHECK (true)',
      table_name
    );
    EXECUTE format(
      'REVOKE ALL ON TABLE %I FROM PUBLIC, app_rls, signalstack_control, signalstack_web, signalstack_worker',
      table_name
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO signalstack_runtime',
      table_name
    );
  END LOOP;
END
$tenant_tables$;

-- Provider ownership evidence is disabled/revoked/retired, never hard-deleted by app runtime.
REVOKE DELETE ON TABLE
  "ProviderAccount",
  "ProviderCredentialSecret",
  "ProviderMessagingService",
  "ProviderPhoneNumber"
  FROM signalstack_runtime;

-- Pre-tenant webhook routing reveals only tenant/account/number identifiers for one exact verified
-- provider+account-hash+destination-hash tuple. It never returns provider IDs or secret material.
CREATE OR REPLACE FUNCTION public.resolve_verified_provider_destination(
  provider_name text,
  external_account_id_hash text,
  destination_phone_number_hash text
)
RETURNS TABLE(
  "orgId" text,
  "providerAccountId" text,
  "providerPhoneNumberId" text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF provider_name IS NULL
    OR octet_length(provider_name) < 1
    OR octet_length(provider_name) > 64
    OR provider_name !~ '^[a-z][a-z0-9_-]{0,63}$'
    OR external_account_id_hash IS NULL
    OR external_account_id_hash !~ '^pvlookup_v1_[A-Za-z0-9_-]{43}$'
    OR destination_phone_number_hash IS NULL
    OR destination_phone_number_hash !~ '^pvlookup_v1_[A-Za-z0-9_-]{43}$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Provider destination resolver arguments are invalid.';
  END IF;

  RETURN QUERY
  SELECT
    account."orgId",
    account."id",
    phone."id"
  FROM public."ProviderAccount" account
  JOIN public."ProviderPhoneNumber" phone
    ON phone."orgId" = account."orgId"
   AND phone."providerAccountId" = account."id"
   AND phone."provider" = account."provider"
  WHERE account."provider" = provider_name
    AND account."externalAccountIdHash" = external_account_id_hash
    AND account."status" = 'VERIFIED'::public."ProviderAccountStatus"
    AND account."revokedAt" IS NULL
    AND phone."phoneNumberHash" = destination_phone_number_hash
    AND phone."status" = 'VERIFIED'::public."ProviderPhoneNumberStatus"
    AND phone."provider" <> 'dummy'
    AND phone."externalNumberId" IS NOT NULL
    AND phone."verifiedAt" IS NOT NULL
    AND phone."disabledAt" IS NULL
  LIMIT 1;
END
$function$;

DO $resolver_owner$
BEGIN
  IF (
    SELECT pg_get_userbyid(functions.proowner) <> current_user
    FROM pg_proc functions
    JOIN pg_namespace namespaces ON namespaces.oid = functions.pronamespace
    WHERE namespaces.nspname = 'public'
      AND functions.proname = 'resolve_verified_provider_destination'
      AND functions.proargtypes = '25 25 25'::oidvector
  ) THEN
    EXECUTE format(
      'ALTER FUNCTION public.resolve_verified_provider_destination(text, text, text) OWNER TO %I',
      current_user
    );
  END IF;
END
$resolver_owner$;

GRANT USAGE ON SCHEMA public TO signalstack_web;
REVOKE ALL ON FUNCTION public.resolve_verified_provider_destination(text, text, text)
  FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_worker, signalstack_web;
GRANT EXECUTE ON FUNCTION public.resolve_verified_provider_destination(text, text, text)
  TO signalstack_web;

COMMIT;
