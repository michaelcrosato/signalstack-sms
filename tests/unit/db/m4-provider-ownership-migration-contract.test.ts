import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  nonDeletableTenantTables,
  ordinaryTenantTables
} from "@/lib/db/tenant-manifest";

const enumMigration = readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260712010000_provider_status_enums/migration.sql"
  ),
  "utf8"
);
const migration = readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260712011000_provider_ownership_substrate/migration.sql"
  ),
  "utf8"
);
const e164Migration = readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260712013000_verified_provider_e164/migration.sql"
  ),
  "utf8"
);
const defaultLifecycleMigration = readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260712014000_provider_phone_default_lifecycle/migration.sql"
  ),
  "utf8"
);
const credentialFingerprintMigration = readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260712015000_provider_credential_fingerprint/migration.sql"
  ),
  "utf8"
);
const resourceInvariantMigration = readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260712016000_provider_resource_invariants/migration.sql"
  ),
  "utf8"
);
const legacyPromotionIdentityMigration = readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260712017000_provider_legacy_promotion_identity/migration.sql"
  ),
  "utf8"
);

const providerTables = [
  "ProviderAccount",
  "ProviderCredentialSecret",
  "ProviderMessagingService"
] as const;

describe("M4 provider ownership migration contract", () => {
  it("pins verified provider models into the forced tenant boundary", () => {
    expect(enumMigration).toContain(
      'ALTER TYPE "ProviderPhoneNumberStatus" ADD VALUE \'VERIFIED\''
    );
    expect(enumMigration).toContain('CREATE TYPE "ProviderAccountStatus"');
    expect(enumMigration).toContain('CREATE TYPE "ProviderMessagingServiceStatus"');
    for (const table of providerTables) {
      expect(ordinaryTenantTables).toContain(table);
      expect(nonDeletableTenantTables).toContain(table);
      expect(migration).toContain(`CREATE TABLE "${table}"`);
      expect(migration).toContain(`'${table}'`);
    }
    expect(nonDeletableTenantTables).toContain("ProviderPhoneNumber");
    expect(migration).toContain("ALTER TABLE %I FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("CREATE POLICY tenant_scope ON %I");
    expect(migration).toContain("CREATE POLICY owner_scope ON %I");
    expect(migration).toMatch(
      /REVOKE DELETE ON TABLE[\s\S]*"ProviderAccount"[\s\S]*"ProviderCredentialSecret"[\s\S]*"ProviderMessagingService"[\s\S]*"ProviderPhoneNumber"[\s\S]*FROM signalstack_runtime;/
    );
  });

  it("enforces provider-scoped exact IDs and global hash ownership", () => {
    expect(migration).toContain(
      '"ProviderAccount_provider_externalAccountId_key"'
    );
    expect(migration).toContain(
      'ON "ProviderAccount"("provider", "externalAccountId")'
    );
    expect(migration).toContain(
      '"ProviderMessagingService_provider_externalServiceId_key"'
    );
    expect(migration).toContain(
      'ON "ProviderMessagingService"("provider", "externalServiceId")'
    );
    expect(migration).toContain(
      'ON "ProviderPhoneNumber"("provider", "externalNumberId")'
    );
    expect(migration).toContain('"ProviderAccount_externalAccountIdHash_key"');
    expect(migration).toContain("^pvlookup_v1_[A-Za-z0-9_-]{43}$");
    expect(migration).toContain('"ProviderPhoneNumber_verified_ownership_key"');
    expect(migration).toContain('ON "ProviderPhoneNumber"("phoneNumberHash")');
    expect(migration).toContain(
      'WHERE "status" = \'VERIFIED\'::"ProviderPhoneNumberStatus" AND "provider" <> \'dummy\''
    );
    expect(e164Migration).toContain('"phoneNumber" ~ \'^\\+[1-9][0-9]{4,14}$\'');
    expect(defaultLifecycleMigration).toContain('AND NOT "isDefault"');
  });

  it("pins same-tenant account/service relations and immutable active-secret rotation", () => {
    expect(migration).toContain(
      'FOREIGN KEY ("orgId", "providerAccountId", "provider")'
    );
    expect(migration).toContain(
      'FOREIGN KEY ("orgId", "providerAccountId", "provider", "providerMessagingServiceId")'
    );
    expect(migration).toContain('"ProviderCredentialSecret_active_key"');
    expect(migration).toContain('WHERE "retiredAt" IS NULL');
    expect(credentialFingerprintMigration).toContain(
      '"fingerprint" ~ \'^pvfp_[A-Za-z0-9_-]{22}$\''
    );
    expect(migration).toContain("enforce_provider_credential_secret_material");
    for (const field of [
      "envelopeVersion",
      "algorithm",
      "keyVersion",
      "iv",
      "ciphertext",
      "authTag",
      "fingerprint",
      "activeFrom"
    ]) {
      expect(migration).toContain(`NEW."${field}" IS DISTINCT FROM OLD."${field}"`);
    }
    for (const subjectType of [
      "provider_account",
      "provider_credential_secret",
      "provider_messaging_service",
      "provider_phone_number"
    ]) {
      expect(migration).toContain(`NEW."subjectType" = '${subjectType}'`);
    }
  });

  it("pins canonical resource capabilities and immutable keyed service ownership", () => {
    expect(resourceInvariantMigration).toContain('ADD COLUMN "externalServiceIdHash" TEXT');
    expect(resourceInvariantMigration).toContain(
      'ALTER COLUMN "externalServiceIdHash" SET NOT NULL'
    );
    expect(resourceInvariantMigration).toContain(
      '"externalServiceIdHash" ~ \'^pvlookup_v1_[A-Za-z0-9_-]{43}$\''
    );
    expect(resourceInvariantMigration).toContain(
      '"ProviderMessagingService_externalServiceIdHash_key"'
    );
    expect(resourceInvariantMigration).toContain('ALTER COLUMN "capabilities" DROP DEFAULT');
    expect(resourceInvariantMigration).toContain(
      'CONSTRAINT "ProviderMessagingService_capabilities_check"'
    );
    expect(resourceInvariantMigration).toContain(
      'CONSTRAINT "ProviderPhoneNumber_bound_capabilities_check"'
    );
    expect(resourceInvariantMigration).toContain("'[\"sms\", \"mms\"]'::jsonb");
    expect(resourceInvariantMigration).toContain(
      'NEW."externalServiceIdHash" IS DISTINCT FROM OLD."externalServiceIdHash"'
    );
    expect(resourceInvariantMigration).toContain(
      'BEFORE INSERT OR UPDATE ON "ProviderMessagingService"'
    );
    expect(resourceInvariantMigration).toContain(
      'BEFORE INSERT OR UPDATE ON "ProviderPhoneNumber"'
    );
    expect(resourceInvariantMigration).toContain(
      "OLD.\"status\" <> 'CONFIGURED'::public.\"ProviderPhoneNumberStatus\""
    );
  });

  it("preserves local row identity during one-time legacy phone promotion", () => {
    expect(legacyPromotionIdentityMigration).toContain(
      'OLD."providerAccountId" IS NULL AND NEW."providerAccountId" IS NOT NULL'
    );
    for (const field of ["id", "orgId", "createdAt"]) {
      expect(legacyPromotionIdentityMigration).toContain(
        `NEW."${field}" IS DISTINCT FROM OLD."${field}"`
      );
    }
  });

  it("installs one bounded hash-only pretenant resolver granted only to web", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.resolve_verified_provider_destination"
    );
    expect(migration).toContain("external_account_id_hash text");
    expect(migration).toContain("destination_phone_number_hash text");
    expect(migration).not.toContain("destination_phone_number text");
    expect(migration).toContain('"providerPhoneNumberId" text');
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = pg_catalog, public");
    expect(migration).toContain("octet_length(provider_name) > 64");
    expect(migration).toContain("functions.proargtypes = '25 25 25'::oidvector");
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.resolve_verified_provider_destination\(text, text, text\)[\s\S]*FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_worker, signalstack_web;/
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.resolve_verified_provider_destination\(text, text, text\)[\s\S]*TO signalstack_web;/
    );
  });
});
