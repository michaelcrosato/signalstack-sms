import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  AuthTokenType,
  MembershipRole,
  PrismaClient,
  QueueJobType
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { protectedTenantTables } from "@/lib/db/tenant-manifest";

const run = process.env.RUN_DB_TESTS === "true";

describe.runIf(run)("least-privilege migration owner", () => {
  it("installs all migrations and runs owner, trigger, and dispatch capabilities without RLS bypass", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
    const role = `signalstack_migrator_${suffix}`;
    const database = `signalstack_owner_${suffix}`;
    const password = `Owner-${suffix}-password`;
    const roleIdentifier = quoteIdentifier(role);
    const databaseIdentifier = quoteIdentifier(database);
    let roleCreated = false;
    let databaseCreated = false;
    let owner: PrismaClient | undefined;

    try {
      await prisma.$executeRawUnsafe(`
        CREATE ROLE ${roleIdentifier}
        LOGIN INHERIT NOSUPERUSER CREATEDB CREATEROLE NOREPLICATION NOBYPASSRLS
        PASSWORD ${quoteLiteral(password)}
      `);
      roleCreated = true;
      await prisma.$executeRawUnsafe(
        `GRANT signalstack_runtime, signalstack_control, signalstack_web, signalstack_worker, signalstack_owner TO ${roleIdentifier} WITH ADMIN OPTION`
      );
      await prisma.$executeRawUnsafe(`CREATE DATABASE ${databaseIdentifier} OWNER ${roleIdentifier}`);
      databaseCreated = true;

      const ownerUrl = databaseUrl(role, password, database);
      await deployMigrations(ownerUrl);
      owner = new PrismaClient({ datasourceUrl: ownerUrl });
      await owner.$connect();

      const [posture] = await owner.$queryRaw<Array<{
        superuser: boolean;
        bypassRls: boolean;
        ownerMember: boolean;
        ownedTables: bigint;
      }>>`
        SELECT
          roles.rolsuper AS "superuser",
          roles.rolbypassrls AS "bypassRls",
          pg_has_role(current_user, 'signalstack_owner', 'MEMBER') AS "ownerMember",
          (
            SELECT count(*)
            FROM pg_class relations
            JOIN pg_namespace namespaces ON namespaces.oid = relations.relnamespace
            WHERE namespaces.nspname = current_schema()
              AND relations.relname = ANY(${[...protectedTenantTables]})
              AND pg_get_userbyid(relations.relowner) = current_user
          ) AS "ownedTables"
        FROM pg_roles roles
        WHERE roles.rolname = current_user
      `;
      expect(posture).toMatchObject({
        superuser: false,
        bypassRls: false,
        ownerMember: true,
        ownedTables: BigInt(protectedTenantTables.length)
      });

      const org = await owner.organization.create({
        data: { slug: `least-owner-${suffix}`, name: "Least Owner", demoMode: false }
      });
      const user = await owner.appUser.create({
        data: {
          email: `least-owner-${suffix}@example.test`,
          normalizedEmail: `least-owner-${suffix}@example.test`
        }
      });
      await owner.membership.create({
        data: { orgId: org.id, userId: user.id, role: MembershipRole.OWNER }
      });
      await owner.authToken.create({
        data: {
          type: AuthTokenType.INVITE,
          tokenHash: createHash("sha256").update(`invite-${suffix}`).digest("base64url"),
          orgId: org.id,
          email: `invite-${suffix}@example.test`,
          role: MembershipRole.MEMBER,
          issuedByUserId: user.id,
          expiresAt: new Date(Date.now() + 60_000)
        }
      });
      const contact = await owner.contact.create({
        data: { orgId: org.id, phone: `+1555${numericTail(suffix)}` }
      });
      const conversation = await owner.conversation.create({
        data: { orgId: org.id, contactId: contact.id }
      });
      await owner.internalNote.create({
        data: {
          orgId: org.id,
          conversationId: conversation.id,
          authorUserId: user.id,
          body: "Least-owner trigger proof"
        }
      });
      const credential = await owner.providerCredential.create({
        data: { orgId: org.id, provider: "least-owner" }
      });
      await owner.providerCredentialRotation.create({
        data: {
          orgId: org.id,
          provider: "least-owner",
          providerCredentialId: credential.id,
          actorUserId: user.id,
          action: "LEAST_OWNER_PROOF"
        }
      });
      await owner.liveReadinessAuditEvent.create({
        data: {
          orgId: org.id,
          actorUserId: user.id,
          action: "LEAST_OWNER_PROOF",
          subjectType: "Organization",
          subjectId: org.id
        }
      });

      const campaign = await owner.campaign.create({
        data: { orgId: org.id, name: "Least-owner dispatch", body: "Proof" }
      });
      const scheduledAt = new Date(Date.now() - 1_000);
      const job = await owner.queueJob.create({
        data: {
          orgId: org.id,
          campaignId: campaign.id,
          type: QueueJobType.SCHEDULED_CAMPAIGN,
          idempotencyKey: `least-owner-${suffix}`,
          payload: { orgId: org.id, campaignId: campaign.id, scheduledAt: scheduledAt.toISOString() },
          runAt: scheduledAt
        }
      });
      const claimToken = randomUUID();
      const claimed = await owner.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_worker");
        return tx.$queryRaw<Array<{ id: string; orgId: string }>>`
          SELECT claim.id, claim."orgId"
          FROM public.claim_due_queue_jobs(
            1,
            clock_timestamp(),
            300000,
            ${claimToken}::uuid
          ) claim
        `;
      });
      expect(claimed).toEqual([{ id: job.id, orgId: org.id }]);

      const endpoint = await owner.customerWebhookEndpoint.create({
        data: {
          orgId: org.id,
          name: "Least-owner webhook",
          canonicalUrl: `https://least-owner-${suffix}.example.test/events`
        }
      });
      const subscription = await owner.customerWebhookSubscription.create({
        data: { orgId: org.id, endpointId: endpoint.id, eventTypes: ["contact.created"] }
      });
      const signingSecret = await owner.customerWebhookSigningSecret.create({
        data: {
          orgId: org.id,
          subscriptionId: subscription.id,
          version: 1,
          ciphertext: `ciphertext-${suffix}`,
          iv: `iv-${suffix}`,
          authTag: `tag-${suffix}`,
          keyVersion: 1,
          fingerprint: `fingerprint-${suffix}`
        }
      });
      const event = await owner.customerWebhookEvent.create({
        data: {
          orgId: org.id,
          deduplicationKey: `least-owner-${suffix}`,
          type: "contact.created",
          aggregateType: "contact",
          payloadText: "{}",
          payloadHash: `payload-${suffix}`,
          occurredAt: scheduledAt
        }
      });
      const delivery = await owner.customerWebhookDelivery.create({
        data: {
          orgId: org.id,
          endpointId: endpoint.id,
          subscriptionId: subscription.id,
          eventId: event.id,
          signingSecretId: signingSecret.id,
          nextAttemptAt: scheduledAt
        }
      });
      const webhookClaimToken = randomUUID();
      const claimedWebhooks = await owner.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_worker");
        return tx.$queryRaw<Array<{ deliveryId: string; orgId: string }>>`
          SELECT claim."deliveryId", claim."orgId"
          FROM public.claim_due_customer_webhook_deliveries(
            1,
            300000,
            ${webhookClaimToken}::uuid
          ) claim
        `;
      });
      expect(claimedWebhooks).toEqual([{ deliveryId: delivery.id, orgId: org.id }]);
      expect(await owner.organization.count()).toBe(1);

      const publicExecute = await owner.$queryRaw<Array<{ grants: bigint }>>`
        SELECT count(*) AS grants
        FROM information_schema.routine_privileges
        WHERE routine_schema = 'public'
          AND routine_name IN (
            'claim_due_queue_jobs',
            'claim_due_customer_webhook_deliveries',
            'resolve_verified_provider_destination'
          )
          AND grantee = 'PUBLIC'
          AND privilege_type = 'EXECUTE'
      `;
      expect(publicExecute[0]?.grants).toBe(0n);
    } finally {
      await owner?.$disconnect();
      if (databaseCreated) {
        await prisma.$executeRawUnsafe(`DROP DATABASE ${databaseIdentifier} WITH (FORCE)`);
      }
      if (roleCreated) {
        // PostgreSQL 16 records role-membership grantors. Remove only grants attributed to the
        // disposable migrator; the installation's existing capability graph remains untouched.
        await prisma.$executeRawUnsafe(
          `REVOKE signalstack_runtime, signalstack_control FROM signalstack_web GRANTED BY ${roleIdentifier}`
        );
        await prisma.$executeRawUnsafe(
          `REVOKE signalstack_runtime FROM signalstack_worker GRANTED BY ${roleIdentifier}`
        );
        await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS ${roleIdentifier}`);
      }
    }
  }, 120_000);
});

async function deployMigrations(databaseUrl: string): Promise<void> {
  const npmCli = process.env.npm_execpath;
  if (!npmCli || !existsSync(npmCli)) {
    throw new Error("npm_execpath is required for least-privilege migration proof.");
  }
  const result = spawnSync(
    process.execPath,
    [npmCli, "exec", "--", "prisma", "migrate", "deploy"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        MIGRATION_DATABASE_URL: databaseUrl
      }
    }
  );
  if (result.status !== 0) {
    const failedDatabase = new PrismaClient({ datasourceUrl: databaseUrl });
    let migrationLogs = "";
    try {
      const rows = await failedDatabase.$queryRaw<Array<{ migrationName: string; logs: string | null }>>`
        SELECT migration_name AS "migrationName", logs
        FROM "_prisma_migrations"
        WHERE finished_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1
      `;
      migrationLogs = JSON.stringify(rows);
    } catch (error) {
      migrationLogs = error instanceof Error ? error.message : "migration log query failed";
    } finally {
      await failedDatabase.$disconnect();
    }
    throw new Error(
      `Least-privilege migration deployment failed:\n${result.stdout}\n${result.stderr}\n${migrationLogs}`
    );
  }
}

function databaseUrl(role: string, password: string, database: string): string {
  const source = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!source) throw new Error("A migration database URL is required.");
  const url = new URL(source);
  url.username = role;
  url.password = password;
  url.pathname = `/${database}`;
  url.searchParams.set("schema", "public");
  return url.toString();
}

function numericTail(value: string): string {
  return BigInt(`0x${value}`).toString().slice(-7).padStart(7, "0");
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value)) throw new Error("Unsafe database identifier.");
  return `"${value}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
