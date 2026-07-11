import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

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
  const client = new PrismaClient({
    log: [],
    datasourceUrl: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
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
    .catch(() => {
      console.error("TENANT_INTEGRITY_PREFLIGHT_FAILED");
      process.exitCode = 1;
    });
}
