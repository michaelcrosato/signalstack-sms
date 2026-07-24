import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { applyDemoSafeRuntimeDefaults } from "@/lib/env/defaults";

export type TenantIntegrityCheck = Readonly<{
  id: string;
  category: "strict-relation" | "current-membership" | "job-envelope";
  query: string;
}>;

export type TenantIntegrityFinding = Readonly<{
  id: string;
  category: TenantIntegrityCheck["category"];
  violations: number;
}>;

export type TenantIntegrityCountExecutor = (
  query: string
) => Promise<unknown>;

export const tenantIntegrityReadOnlyStatement = "SET TRANSACTION READ ONLY";

function strictRelation(id: string, query: string): TenantIntegrityCheck {
  return { id, category: "strict-relation", query };
}

function currentMembership(id: string, query: string): TenantIntegrityCheck {
  return { id, category: "current-membership", query };
}

/**
 * Read-only, count-only inventory used before M2 composite constraints are applied.
 * Queries intentionally return no identifiers, phone numbers, message bodies, email addresses, or JSON.
 */
export const tenantIntegrityChecks: readonly TenantIntegrityCheck[] = Object.freeze([
  strictRelation(
    "contact-tag.contact",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "ContactTag" child
     JOIN "Contact" parent ON parent."id" = child."contactId"
     WHERE child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "contact-tag.tag",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "ContactTag" child
     JOIN "Tag" parent ON parent."id" = child."tagId"
     WHERE child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "contact-list-member.list",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "ContactListMember" child
     JOIN "ContactList" parent ON parent."id" = child."listId"
     WHERE child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "contact-list-member.contact",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "ContactListMember" child
     JOIN "Contact" parent ON parent."id" = child."contactId"
     WHERE child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "campaign.template",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "Campaign" child
     JOIN "MessageTemplate" parent ON parent."id" = child."templateId"
     WHERE child."templateId" IS NOT NULL AND child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "campaign-recipient.campaign",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "CampaignRecipient" child
     JOIN "Campaign" parent ON parent."id" = child."campaignId"
     WHERE child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "campaign-recipient.contact",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "CampaignRecipient" child
     JOIN "Contact" parent ON parent."id" = child."contactId"
     WHERE child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "conversation.contact",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "Conversation" child
     JOIN "Contact" parent ON parent."id" = child."contactId"
     WHERE child."contactId" IS NOT NULL AND child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "queue-job.campaign",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "QueueJob" child
     JOIN "Campaign" parent ON parent."id" = child."campaignId"
     WHERE child."campaignId" IS NOT NULL AND child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "message.contact",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "Message" child
     JOIN "Contact" parent ON parent."id" = child."contactId"
     WHERE child."contactId" IS NOT NULL AND child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "message.conversation",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "Message" child
     JOIN "Conversation" parent ON parent."id" = child."conversationId"
     WHERE child."conversationId" IS NOT NULL AND child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "message.campaign",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "Message" child
     JOIN "Campaign" parent ON parent."id" = child."campaignId"
     WHERE child."campaignId" IS NOT NULL AND child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "message-attempt.message",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "MessageAttempt" child
     JOIN "Message" parent ON parent."id" = child."messageId"
     WHERE child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "message-attempt.retry-parent",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "MessageAttempt" child
     JOIN "MessageAttempt" parent ON parent."id" = child."retryOfAttemptId"
     WHERE child."retryOfAttemptId" IS NOT NULL
       AND (child."orgId" <> parent."orgId" OR child."messageId" <> parent."messageId")`
  ),
  strictRelation(
    "message-attempt.provider-account",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "MessageAttempt" child
     JOIN "ProviderAccount" parent ON parent."id" = child."providerAccountId"
     WHERE child."providerAccountId" IS NOT NULL AND child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "message-attempt.provider-credential",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "MessageAttempt" child
     JOIN "ProviderCredentialSecret" parent ON parent."id" = child."providerCredentialSecretId"
     WHERE child."providerCredentialSecretId" IS NOT NULL
       AND (
         child."orgId" <> parent."orgId"
         OR child."providerAccountId" <> parent."providerAccountId"
         OR child."providerCredentialVersion" <> parent."version"
       )`
  ),
  strictRelation(
    "message-attempt.provider-phone",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "MessageAttempt" child
     JOIN "ProviderPhoneNumber" parent ON parent."id" = child."providerPhoneNumberId"
     WHERE child."providerPhoneNumberId" IS NOT NULL
       AND (
         child."orgId" <> parent."orgId"
         OR child."providerAccountId" <> parent."providerAccountId"
       )`
  ),
  strictRelation(
    "message-attempt.reconciler-membership",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "MessageAttempt" child
     JOIN "Membership" parent ON parent."userId" = child."reconciledByUserId"
     WHERE child."reconciledByUserId" IS NOT NULL AND child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "internal-note.conversation",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "InternalNote" child
     JOIN "Conversation" parent ON parent."id" = child."conversationId"
     WHERE child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "provider-credential-rotation.credential",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "ProviderCredentialRotation" child
     JOIN "ProviderCredential" parent ON parent."id" = child."providerCredentialId"
     WHERE child."providerCredentialId" IS NOT NULL AND child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "provider-credential-secret.account",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "ProviderCredentialSecret" child
     JOIN "ProviderAccount" parent ON parent."id" = child."providerAccountId"
     WHERE child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "provider-messaging-service.account",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "ProviderMessagingService" child
     JOIN "ProviderAccount" parent ON parent."id" = child."providerAccountId"
     WHERE child."orgId" <> parent."orgId" OR child."provider" <> parent."provider"`
  ),
  strictRelation(
    "provider-phone-number.account",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "ProviderPhoneNumber" child
     JOIN "ProviderAccount" parent ON parent."id" = child."providerAccountId"
     WHERE child."providerAccountId" IS NOT NULL
       AND (child."orgId" <> parent."orgId" OR child."provider" <> parent."provider")`
  ),
  strictRelation(
    "provider-phone-number.messaging-service",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "ProviderPhoneNumber" child
     JOIN "ProviderMessagingService" parent ON parent."id" = child."providerMessagingServiceId"
     WHERE child."providerMessagingServiceId" IS NOT NULL
       AND (
         child."orgId" <> parent."orgId"
         OR child."providerAccountId" <> parent."providerAccountId"
         OR child."provider" <> parent."provider"
       )`
  ),
  strictRelation(
    "api-idempotency-record.credential",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "ApiIdempotencyRecord" child
     JOIN "ApiCredential" parent ON parent."id" = child."credentialId"
     WHERE child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "integration-audit-event.credential",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "IntegrationAuditEvent" child
     JOIN "ApiCredential" parent ON parent."id" = child."apiCredentialId"
     WHERE child."apiCredentialId" IS NOT NULL AND child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "integration-audit-event.subject",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "IntegrationAuditEvent" child
     WHERE child."subjectId" IS NOT NULL
       AND (
         (child."subjectType" = 'organization' AND child."subjectId" <> child."orgId")
         OR (child."subjectType" = 'api_credential' AND NOT EXISTS (
           SELECT 1 FROM "ApiCredential" parent
           WHERE parent."orgId" = child."orgId" AND parent."id" = child."subjectId"
         ))
         OR (child."subjectType" = 'customer_webhook_endpoint' AND NOT EXISTS (
           SELECT 1 FROM "CustomerWebhookEndpoint" parent
           WHERE parent."orgId" = child."orgId" AND parent."id" = child."subjectId"
         ))
         OR (child."subjectType" = 'customer_webhook_delivery' AND NOT EXISTS (
           SELECT 1 FROM "CustomerWebhookDelivery" parent
           WHERE parent."orgId" = child."orgId" AND parent."id" = child."subjectId"
         ))
         OR (child."subjectType" = 'provider_account' AND NOT EXISTS (
           SELECT 1 FROM "ProviderAccount" parent
           WHERE parent."orgId" = child."orgId" AND parent."id" = child."subjectId"
         ))
         OR (child."subjectType" = 'provider_credential_secret' AND NOT EXISTS (
           SELECT 1 FROM "ProviderCredentialSecret" parent
           WHERE parent."orgId" = child."orgId" AND parent."id" = child."subjectId"
         ))
         OR (child."subjectType" = 'provider_messaging_service' AND NOT EXISTS (
           SELECT 1 FROM "ProviderMessagingService" parent
           WHERE parent."orgId" = child."orgId" AND parent."id" = child."subjectId"
         ))
         OR (child."subjectType" = 'provider_phone_number' AND NOT EXISTS (
           SELECT 1 FROM "ProviderPhoneNumber" parent
           WHERE parent."orgId" = child."orgId" AND parent."id" = child."subjectId"
         ))
         OR (child."subjectType" = 'message_attempt' AND NOT EXISTS (
           SELECT 1 FROM "MessageAttempt" parent
           WHERE parent."orgId" = child."orgId" AND parent."id" = child."subjectId"
         ))
         OR child."subjectType" NOT IN (
           'organization', 'api_credential', 'customer_webhook_endpoint', 'customer_webhook_delivery',
           'provider_account', 'provider_credential_secret', 'provider_messaging_service',
           'provider_phone_number', 'message_attempt'
         )
       )`
  ),
  strictRelation(
    "customer-webhook-subscription.endpoint",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "CustomerWebhookSubscription" child
     JOIN "CustomerWebhookEndpoint" parent ON parent."id" = child."endpointId"
     WHERE child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "customer-webhook-signing-secret.subscription",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "CustomerWebhookSigningSecret" child
     JOIN "CustomerWebhookSubscription" parent ON parent."id" = child."subscriptionId"
     WHERE child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "customer-webhook-delivery.subscription",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "CustomerWebhookDelivery" child
     JOIN "CustomerWebhookSubscription" parent ON parent."id" = child."subscriptionId"
     WHERE child."orgId" <> parent."orgId" OR child."endpointId" <> parent."endpointId"`
  ),
  strictRelation(
    "customer-webhook-delivery.event",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "CustomerWebhookDelivery" child
     JOIN "CustomerWebhookEvent" parent ON parent."id" = child."eventId"
     WHERE child."orgId" <> parent."orgId"`
  ),
  strictRelation(
    "customer-webhook-delivery.signing-secret",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "CustomerWebhookDelivery" child
     JOIN "CustomerWebhookSigningSecret" parent ON parent."id" = child."signingSecretId"
     WHERE child."orgId" <> parent."orgId" OR child."subscriptionId" <> parent."subscriptionId"`
  ),
  strictRelation(
    "customer-webhook-delivery.replay",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "CustomerWebhookDelivery" child
     JOIN "CustomerWebhookDelivery" parent ON parent."id" = child."replayOfDeliveryId"
     WHERE child."replayOfDeliveryId" IS NOT NULL
       AND (child."orgId" <> parent."orgId"
         OR child."endpointId" <> parent."endpointId"
         OR child."eventId" <> parent."eventId")`
  ),
  strictRelation(
    "customer-webhook-delivery-attempt.delivery",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "CustomerWebhookDeliveryAttempt" child
     JOIN "CustomerWebhookDelivery" parent ON parent."id" = child."deliveryId"
     WHERE child."orgId" <> parent."orgId" OR child."generation" <> parent."generation"`
  ),
  currentMembership(
    "conversation.active-assignee",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "Conversation" child
     WHERE child."assignedToUserId" IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM "Membership" membership
         JOIN "AppUser" app_user ON app_user."id" = membership."userId"
         WHERE membership."orgId" = child."orgId"
           AND membership."userId" = child."assignedToUserId"
           AND membership."status" = 'ACTIVE'
           AND app_user."disabledAt" IS NULL
       )`
  ),
  currentMembership(
    "auth-session.active-membership",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "AuthSession" child
     WHERE child."revokedAt" IS NULL
       AND child."idleExpiresAt" > CURRENT_TIMESTAMP
       AND child."absoluteExpiresAt" > CURRENT_TIMESTAMP
       AND NOT EXISTS (
         SELECT 1 FROM "Membership" membership
         JOIN "AppUser" app_user ON app_user."id" = membership."userId"
         WHERE membership."orgId" = child."orgId"
           AND membership."userId" = child."userId"
           AND membership."status" = 'ACTIVE'
           AND app_user."disabledAt" IS NULL
       )`
  ),
  currentMembership(
    "auth-token.pending-invite-issuer",
    `SELECT COUNT(*)::bigint AS "count"
     FROM "AuthToken" child
     WHERE child."type" = 'INVITE'
       AND child."consumedAt" IS NULL
       AND child."revokedAt" IS NULL
       AND child."expiresAt" > CURRENT_TIMESTAMP
       AND NOT EXISTS (
         SELECT 1 FROM "Membership" membership
         JOIN "AppUser" app_user ON app_user."id" = membership."userId"
         WHERE membership."orgId" = child."orgId"
           AND membership."userId" = child."issuedByUserId"
           AND membership."status" = 'ACTIVE'
           AND app_user."disabledAt" IS NULL
       )`
  ),
  {
    id: "queue-job.scheduled-envelope",
    category: "job-envelope",
    query: `SELECT COUNT(*)::bigint AS "count"
            FROM "QueueJob" child
            WHERE child."type" = 'SCHEDULED_CAMPAIGN'
              AND (
                jsonb_typeof(child."payload") IS DISTINCT FROM 'object'
                OR child."payload" ->> 'orgId' IS DISTINCT FROM child."orgId"
                OR child."payload" ->> 'campaignId' IS DISTINCT FROM child."campaignId"
              )`
  }
]);

export async function runTenantIntegrityPreflight(
  executeCount: TenantIntegrityCountExecutor,
  checks: readonly TenantIntegrityCheck[] = tenantIntegrityChecks
): Promise<readonly TenantIntegrityFinding[]> {
  const findings: TenantIntegrityFinding[] = [];
  for (const check of checks) {
    const result = await executeCount(check.query);
    findings.push(
      Object.freeze({
        id: check.id,
        category: check.category,
        violations: readCount(result)
      })
    );
  }
  return Object.freeze(findings);
}

export function tenantIntegrityPreflightExitCode(
  findings: readonly TenantIntegrityFinding[]
): 0 | 1 {
  return findings.some(({ violations }) => violations > 0) ? 1 : 0;
}

export function formatTenantIntegrityFindings(
  findings: readonly TenantIntegrityFinding[]
): string {
  const lines = findings.map((finding) =>
    JSON.stringify({
      relation: finding.id,
      category: finding.category,
      violations: finding.violations
    })
  );
  const violatingRelations = findings.filter(({ violations }) => violations > 0).length;
  lines.push(
    JSON.stringify({
      summary: "tenant-integrity-preflight",
      relationsChecked: findings.length,
      violatingRelations,
      status: violatingRelations === 0 ? "ok" : "violations"
    })
  );
  return lines.join("\n");
}

async function runDatabasePreflight(client: PrismaClient) {
  return client.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(tenantIntegrityReadOnlyStatement);
    return runTenantIntegrityPreflight((query) =>
      transaction.$queryRawUnsafe<Array<{ count: bigint }>>(query)
    );
  });
}

function readCount(result: unknown): number {
  if (!Array.isArray(result) || result.length !== 1) {
    throw new Error("Tenant integrity count query returned an invalid shape.");
  }
  const row = result[0];
  if (!row || typeof row !== "object" || !("count" in row)) {
    throw new Error("Tenant integrity count query omitted its count.");
  }
  const rawCount = (row as { count: unknown }).count;
  const count =
    typeof rawCount === "bigint"
      ? Number(rawCount)
      : typeof rawCount === "number"
        ? rawCount
        : typeof rawCount === "string" && /^\d+$/.test(rawCount)
          ? Number(rawCount)
          : Number.NaN;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Tenant integrity count is invalid.");
  }
  return count;
}

async function runCli() {
  applyDemoSafeRuntimeDefaults();
  const client = new PrismaClient({
    log: []
  });
  try {
    const findings = await runDatabasePreflight(client);
    console.log(formatTenantIntegrityFindings(findings));
    return tenantIntegrityPreflightExitCode(findings);
  } finally {
    await client.$disconnect();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      // Print the failure class without echoing query results or connection strings.
      const reason = error instanceof Error ? `${error.name}: ${error.message.split("\n")[0]}` : "unknown error";
      if (reason.includes("PrismaClientInitializationError") || reason.includes("P1001") || reason.includes("Can't reach database")) {
        console.log(`TENANT_INTEGRITY_PREFLIGHT_SKIPPED (no live database connected)`);
        process.exitCode = 0;
        return;
      }
      console.error(`TENANT_INTEGRITY_PREFLIGHT_FAILED (${reason})`);
      process.exitCode = 1;
    });
}
