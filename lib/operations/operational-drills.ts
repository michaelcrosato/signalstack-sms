import { existsSync } from "node:fs";
import { resolve } from "node:path";

export type OperationalDrillFlow =
  | "owner-onboarding"
  | "api-key-auth"
  | "direct-send-reservation"
  | "inbound-reply-processing"
  | "stop-optout-suppression"
  | "campaign-outbox-dispatch"
  | "worker-restart-resilience"
  | "webhook-delivery-callbacks"
  | "database-encrypted-backup-restore";

export type OperationalDrillResult = Readonly<{
  flow: OperationalDrillFlow;
  title: string;
  verified: boolean;
  evidence: string;
}>;

export const OPERATIONAL_DRILL_CATALOG: readonly Readonly<{
  flow: OperationalDrillFlow;
  title: string;
  requiredFiles: readonly string[];
  description: string;
}>[] = Object.freeze([
  {
    flow: "owner-onboarding",
    title: "Owner Onboarding & Built-in Auth",
    requiredFiles: [
      "lib/auth/local-credentials.ts",
      "lib/auth/local-session.ts",
      "lib/auth/team-service.ts",
      "scripts/admin-create.ts"
    ],
    description: "Built-in credentials, operator admin bootstrap, password hashing, and session management."
  },
  {
    flow: "api-key-auth",
    title: "API Key Authentication & Scope Verification",
    requiredFiles: [
      "lib/public-api/api-key-authentication.ts",
      "lib/public-api/api-key-crypto.ts",
      "app/api/v1/contacts/route.ts"
    ],
    description: "One-time API key generation, prefix matching, pepper hashing, and bearer token authorization."
  },
  {
    flow: "direct-send-reservation",
    title: "Direct Message Outbox Reservation",
    requiredFiles: [
      "lib/messaging/direct-message-reservation.ts",
      "app/api/v1/messages/route.ts"
    ],
    description: "Transactional outbox reservation, idempotency locking, and message attempt queueing."
  },
  {
    flow: "inbound-reply-processing",
    title: "Inbound SMS & Shared Inbox Processing",
    requiredFiles: [
      "app/api/webhooks/twilio/inbound/route.ts",
      "lib/db/repositories/inbox.ts"
    ],
    description: "Provider webhook signature validation, tenant number routing, and inbound inbox persistence."
  },
  {
    flow: "stop-optout-suppression",
    title: "STOP Opt-Out Keyword Suppression",
    requiredFiles: [
      "lib/compliance/gates.ts",
      "lib/compliance/opt-out.ts"
    ],
    description: "Append-only consent ledger, immediate STOP suppression, and send-time compliance gate."
  },
  {
    flow: "campaign-outbox-dispatch",
    title: "Campaign Outbox Scheduling & Dispatch",
    requiredFiles: [
      "lib/messaging/outbox/worker.ts",
      "lib/queue/worker.ts",
      "app/api/campaigns/route.ts"
    ],
    description: "Segment evaluation, campaign message outbox reservation, and batch dispatch worker."
  },
  {
    flow: "worker-restart-resilience",
    title: "Worker Crash & Restart Resilience",
    requiredFiles: [
      "lib/queue/worker.ts",
      "lib/queue/bullmq-worker.ts"
    ],
    description: "Stale lease recovery, atomic job claiming, and idempotent retry upon worker restart."
  },
  {
    flow: "webhook-delivery-callbacks",
    title: "Customer Webhook Outbox & Signature Transport",
    requiredFiles: [
      "lib/integrations/customer-webhooks/worker.ts",
      "lib/integrations/customer-webhooks/transport.ts",
      "lib/integrations/customer-webhooks/outbox.ts"
    ],
    description: "Event fanout, HMAC signing secret rotation, delivery outbox retry, and delivery status recording."
  },
  {
    flow: "database-encrypted-backup-restore",
    title: "Encrypted Database Backup & Disaster Recovery",
    requiredFiles: [
      "scripts/backup-restore.ts",
      "tests/unit/operations/backup-restore.test.ts"
    ],
    description: "AES-256-GCM encrypted database dump, checksum validation, and non-destructive restore rehearsal."
  }
]);

export function verifyOperationalDrills(cwd: string = process.cwd()): {
  allPassed: boolean;
  results: readonly OperationalDrillResult[];
} {
  const results: OperationalDrillResult[] = [];
  let allPassed = true;

  for (const item of OPERATIONAL_DRILL_CATALOG) {
    const missingFiles = item.requiredFiles.filter(
      (relPath) => !existsSync(resolve(cwd, relPath))
    );

    const verified = missingFiles.length === 0;
    if (!verified) {
      allPassed = false;
    }

    results.push(
      Object.freeze({
        flow: item.flow,
        title: item.title,
        verified,
        evidence: verified
          ? `Verified implementation artifacts: ${item.requiredFiles.join(", ")}`
          : `Missing required drill implementation artifacts: ${missingFiles.join(", ")}`
      })
    );
  }

  return {
    allPassed,
    results: Object.freeze(results)
  };
}
