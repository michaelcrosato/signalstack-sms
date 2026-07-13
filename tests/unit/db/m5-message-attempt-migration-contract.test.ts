import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  nonDeletableTenantTables,
  ordinaryTenantTables
} from "@/lib/db/tenant-manifest";

function migration(name: string) {
  return readFileSync(
    path.join(process.cwd(), "prisma", "migrations", name, "migration.sql"),
    "utf8"
  );
}

const substrate = migration("20260712018000_message_attempt_outbox");
const invariants = migration("20260712019000_message_attempt_invariants");
const dispatch = migration("20260712020000_message_attempt_dispatch_security");
const payloadBounds = migration("20260712021000_message_attempt_payload_bounds");

describe("M5 message-attempt migration contract", () => {
  it("installs distinct application, transport, and attempt states", () => {
    expect(substrate).toContain('CREATE TYPE "MessageApplicationStatus"');
    expect(substrate).toContain('CREATE TYPE "MessageTransport"');
    expect(substrate).toContain('CREATE TYPE "MessageAttemptStatus"');
    for (const status of [
      "ACCEPTED",
      "SCHEDULED",
      "PROCESSING",
      "SENT",
      "DELIVERED",
      "FAILED",
      "CANCELLED",
      "AMBIGUOUS"
    ]) {
      expect(substrate).toContain(`'${status}'`);
    }
    for (const status of ["QUEUED", "SUCCEEDED", "RESOLVED_NOT_SENT"]) {
      expect(substrate).toContain(`'${status}'`);
    }
  });

  it("pins attempts into the tenant and no-delete manifests", () => {
    expect(ordinaryTenantTables).toContain("MessageAttempt");
    expect(nonDeletableTenantTables).toContain("MessageAttempt");
    expect(substrate).toContain('CREATE TABLE "MessageAttempt"');
    expect(dispatch).toContain('ALTER TABLE "MessageAttempt" FORCE ROW LEVEL SECURITY');
    expect(dispatch).toContain('CREATE POLICY tenant_scope ON "MessageAttempt"');
    expect(dispatch).toContain('CREATE POLICY owner_scope ON "MessageAttempt"');
    expect(dispatch).toContain(
      'GRANT SELECT, INSERT, UPDATE ON TABLE "MessageAttempt" TO signalstack_runtime'
    );
    expect(dispatch).toContain(
      'REVOKE DELETE ON TABLE "MessageAttempt" FROM signalstack_runtime'
    );
  });

  it("enforces same-tenant message, retry, credential-generation, sender, and reconciler relations", () => {
    for (const constraint of [
      "MessageAttempt_orgId_messageId_fkey",
      "MessageAttempt_orgId_messageId_retryOfAttemptId_fkey",
      "MessageAttempt_orgId_providerAccountId_fkey",
      "MessageAttempt_provider_credential_generation_fkey",
      "MessageAttempt_provider_phone_binding_fkey",
      "MessageAttempt_reconciler_membership_fkey"
    ]) {
      expect(substrate).toContain(`CONSTRAINT "${constraint}"`);
    }
    expect(substrate).toContain(
      '"ProviderCredentialSecret"("orgId", "providerAccountId", "id", "version")'
    );
    expect(substrate).toContain(
      '"ProviderPhoneNumber"("orgId", "providerAccountId", "id")'
    );
    expect(substrate).toContain(
      'CREATE UNIQUE INDEX "MessageAttempt_callbackCorrelationId_key"'
    );
  });

  it("makes payload/frontier identity immutable while permitting deterministic dummy completion", () => {
    for (const field of [
      "messageId",
      "attemptNumber",
      "retryOfAttemptId",
      "transport",
      "providerAccountId",
      "providerPhoneNumberId",
      "destination",
      "body",
      "mediaUrls",
      "requestFingerprint",
      "callbackCorrelationId"
    ]) {
      expect(invariants).toContain(`NEW."${field}" IS DISTINCT FROM OLD."${field}"`);
    }
    expect(invariants).toContain(
      'OLD."providerCallStartedAt" IS NULL\n    AND NEW."providerCallStartedAt" IS NOT NULL'
    );
    expect(invariants).toContain(
      "OLD.\"transport\" = 'DUMMY'::public.\"MessageTransport\""
    );
    expect(invariants).toContain(
      "NEW.\"status\" = 'SUCCEEDED'::public.\"MessageAttemptStatus\""
    );
    expect(invariants).toContain("NEW.\"subjectType\" = 'message_attempt'");
  });

  it("bounds destinations to E.164 and persists UUID callback correlation", () => {
    expect(payloadBounds).toContain("[0-9]{4,14}");
    expect(payloadBounds).toContain('CONSTRAINT "Message_m5_e164_bounds_check"');
    expect(payloadBounds).toContain('CONSTRAINT "MessageAttempt_e164_bounds_check"');
    expect(payloadBounds).toContain(
      'CONSTRAINT "MessageAttempt_callback_correlation_uuid_check"'
    );
    expect(payloadBounds).toContain("[89ab][0-9a-f]{3}");
  });

  it("separates bounded pre-frontier claims from post-frontier ambiguity recovery", () => {
    expect(dispatch).toContain(
      "CREATE OR REPLACE FUNCTION public.claim_due_message_attempts"
    );
    expect(dispatch).toContain(
      "CREATE OR REPLACE FUNCTION public.recover_expired_message_attempts"
    );
    expect(dispatch).toContain('attempt."providerCallStartedAt" IS NULL');
    expect(dispatch).toContain('attempt."providerCallStartedAt" IS NOT NULL');
    expect(dispatch).toContain(
      '"status" = \'AMBIGUOUS\'::public."MessageAttemptStatus"'
    );
    expect(dispatch).toContain(
      '"applicationStatus" = \'AMBIGUOUS\'::public."MessageApplicationStatus"'
    );
    expect(dispatch).toContain("FOR UPDATE OF attempt, message SKIP LOCKED");
    expect(dispatch).toContain("SET search_path = pg_catalog, public");
    expect(dispatch).toMatch(
      /REVOKE ALL ON FUNCTION public\.claim_due_message_attempts\(integer, integer, uuid\)[\s\S]*FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_web, signalstack_worker;/
    );
    expect(dispatch).toMatch(
      /REVOKE ALL ON FUNCTION public\.recover_expired_message_attempts\(integer\)[\s\S]*FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_web, signalstack_worker;/
    );
    expect(dispatch).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.claim_due_message_attempts\(integer, integer, uuid\)[\s\S]*TO signalstack_worker;/
    );
    expect(dispatch).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.recover_expired_message_attempts\(integer\)[\s\S]*TO signalstack_worker;/
    );
  });
});
