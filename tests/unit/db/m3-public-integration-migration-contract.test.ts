import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ordinaryTenantTables } from "@/lib/db/tenant-manifest";
import { CUSTOMER_WEBHOOK_EVENT_TYPES } from "@/lib/integrations/customer-webhooks/catalog";
import { API_SCOPES } from "@/lib/public-api/scopes";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260711040000_public_integration_substrate/migration.sql"
  ),
  "utf8"
);
const reconciliationMigration = readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260711050000_customer_webhook_disable_reconciliation/migration.sql"
  ),
  "utf8"
);
const reservationMigration = readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260711060000_customer_webhook_attempt_reservations/migration.sql"
  ),
  "utf8"
);

const integrationTables = [
  "ApiCredential",
  "ApiIdempotencyRecord",
  "IntegrationAuditEvent",
  "CustomerWebhookEndpoint",
  "CustomerWebhookSubscription",
  "CustomerWebhookSigningSecret",
  "CustomerWebhookEvent",
  "CustomerWebhookDelivery",
  "CustomerWebhookDeliveryAttempt"
] as const;

describe("M3 public integration migration contract", () => {
  it("keeps every M3 table in the ordinary tenant manifest and forced-RLS migration", () => {
    for (const table of integrationTables) {
      expect(ordinaryTenantTables).toContain(table);
      expect(migration).toContain(`CREATE TABLE "${table}"`);
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain("ALTER TABLE %I FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("CREATE POLICY tenant_scope ON %I");
    expect(migration).toContain("CREATE POLICY owner_scope ON %I");
  });

  it("binds pre-tenant API-key lookup to one exact hash with SELECT-only control access", () => {
    expect(migration).toContain("CREATE POLICY api_key_control_select_scope");
    expect(migration).toContain("current_setting('app.control_purpose', true) = 'api_key'");
    expect(migration).toContain("current_setting('app.current_api_key_hash', true)");
    expect(migration).toContain('REVOKE ALL ON TABLE "ApiCredential" FROM signalstack_control');
    expect(migration).toContain('GRANT SELECT ON TABLE "ApiCredential" TO signalstack_control');
    for (const scope of API_SCOPES) {
      expect(migration).toContain(`'${scope}'`);
    }
  });

  it("pins same-tenant delivery identity, replay lineage, and append-only evidence", () => {
    expect(migration).toContain(
      'FOREIGN KEY ("orgId", "endpointId", "eventId", "replayOfDeliveryId")'
    );
    expect(migration).toContain(
      'FOREIGN KEY ("orgId", "deliveryId", "generation")'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "CustomerWebhookSigningSecret_active_key"'
    );
    expect(migration).toContain('WHERE "retiredAt" IS NULL');
    expect(migration).toContain('CREATE INDEX "CustomerWebhookDelivery_due_idx"');
    for (const eventType of CUSTOMER_WEBHOOK_EVENT_TYPES) {
      expect(migration).toContain(`'${eventType}'`);
    }
    expect(migration).toMatch(
      /REVOKE DELETE ON TABLE[\s\S]*"ApiCredential"[\s\S]*"CustomerWebhookEndpoint"[\s\S]*"CustomerWebhookDelivery"[\s\S]*FROM signalstack_runtime;/
    );
    expect(migration).toMatch(
      /REVOKE UPDATE ON TABLE[\s\S]*"IntegrationAuditEvent"[\s\S]*"CustomerWebhookEvent"[\s\S]*"CustomerWebhookDeliveryAttempt"[\s\S]*FROM signalstack_runtime;/
    );
  });

  it("installs one database-timed worker-only customer webhook claim capability", () => {
    const create = migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.claim_due_customer_webhook_deliveries"
    );
    const revoke = migration.indexOf(
      "REVOKE ALL ON FUNCTION public.claim_due_customer_webhook_deliveries"
    );
    const grant = migration.indexOf(
      "GRANT EXECUTE ON FUNCTION public.claim_due_customer_webhook_deliveries"
    );
    expect(create).toBeGreaterThan(-1);
    expect(revoke).toBeGreaterThan(create);
    expect(grant).toBeGreaterThan(revoke);
    expect(migration).toContain("effective_now timestamptz := clock_timestamp()");
    expect(reconciliationMigration).toContain("Preserve a live processing owner");
    expect(reservationMigration).toContain("delivery.\"processingExpiresAt\" <= effective_now");
    expect(reservationMigration).toContain("COALESCE(delivery.\"lastErrorCode\", 'ENDPOINT_DISABLED')");
    expect(reservationMigration).toContain("CustomerWebhookDeliveryAttempt_unfinished_key");
    expect(reservationMigration).toContain("enforce_customer_webhook_attempt_completion");
    expect(reservationMigration).toContain("attempt.\"attemptNumber\" = delivery.\"attemptCount\" + 1");
    expect(reservationMigration).toContain(
      'GRANT UPDATE ("statusCode", "outcome", "errorCode", "finishedAt")'
    );
    expect(migration).toContain("FOR UPDATE OF delivery SKIP LOCKED");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = pg_catalog, public");
    expect(migration).toContain("TO signalstack_worker");
  });
});
