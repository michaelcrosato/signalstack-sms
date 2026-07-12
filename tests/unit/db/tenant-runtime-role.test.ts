import { createHash, randomUUID } from "node:crypto";
import {
  AuthTokenType,
  MembershipRole,
  PrismaClient,
  QueueJobType,
  UsageEventType,
  type Prisma
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { inspectRuntimeDatabasePostureForClient } from "@/lib/db/runtime-posture";
import {
  currentTenantDatabaseContext,
  withTenantTransaction
} from "@/lib/db/tenant-context";
import {
  appendOnlyTenantTables,
  nonDeletableTenantTables,
  ordinaryTenantTables,
  protectedTenantTables
} from "@/lib/db/tenant-manifest";

const run = process.env.RUN_DB_TESTS === "true";
const suiteToken = randomUUID().replaceAll("-", "").slice(0, 20);
const loginRole = `signalstack_test_runtime_${suiteToken}`;
const loginPassword = `tenant-runtime-${suiteToken}-A9`;

type OrdinaryTenantTable = (typeof ordinaryTenantTables)[number];
type ProtectedTenantTable = (typeof protectedTenantTables)[number];
type FixtureSide = "a" | "b";
type FixtureIds = Record<ProtectedTenantTable, Record<FixtureSide, string>>;
type TenantRow = Readonly<{ id: string; orgId?: string }>;
type ProtectedRows = Record<ProtectedTenantTable, readonly TenantRow[]>;
const appendOnlyTenantTableSet = new Set<OrdinaryTenantTable>(appendOnlyTenantTables);
const nonDeletableTenantTableSet = new Set<OrdinaryTenantTable>(nonDeletableTenantTables);

type OwnerFixture = Readonly<{
  ids: FixtureIds;
  orgAId: string;
  orgBId: string;
  userAId: string;
  userBId: string;
}>;

describe.runIf(run)("non-owner tenant runtime role", () => {
  let runtime: PrismaClient | undefined;
  let parallelRuntime: PrismaClient | undefined;
  let roleCreated = false;
  let fixture: OwnerFixture | undefined;

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`
      CREATE ROLE ${quoteIdentifier(loginRole)}
      LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
      PASSWORD ${quoteLiteral(loginPassword)}
    `);
    roleCreated = true;
    await prisma.$executeRawUnsafe(
      `GRANT signalstack_web TO ${quoteIdentifier(loginRole)}`
    );

    runtime = new PrismaClient({ datasourceUrl: runtimeDatabaseUrl(1) });
    parallelRuntime = new PrismaClient({ datasourceUrl: runtimeDatabaseUrl(4) });
    await Promise.all([runtime.$connect(), parallelRuntime.$connect()]);

    fixture = await seedOwnerFixtures();
  });

  afterAll(async () => {
    if (fixture) {
      await prisma.organization.deleteMany({
        where: { id: { in: [fixture.orgAId, fixture.orgBId] } }
      });
      await prisma.appUser.deleteMany({
        where: { id: { in: [fixture.userAId, fixture.userBId] } }
      });
    }

    await Promise.all([
      runtime?.$disconnect() ?? Promise.resolve(),
      parallelRuntime?.$disconnect() ?? Promise.resolve()
    ]);

    if (roleCreated) {
      await prisma.$executeRawUnsafe(
        `REVOKE signalstack_web FROM ${quoteIdentifier(loginRole)}`
      );
      await prisma.$executeRawUnsafe(`DROP ROLE ${quoteIdentifier(loginRole)}`);
    }
  });

  it("attests a real NOINHERIT login and complete owner fixture matrix", async () => {
    const client = requireClient(runtime);
    const seeded = requireFixture(fixture);
    await expect(inspectRuntimeDatabasePostureForClient(client)).resolves.toBeUndefined();

    const [role] = await client.$queryRaw<
      Array<{ superuser: boolean; bypassRls: boolean; inherits: boolean; runtimeMember: boolean }>
    >`
      SELECT
        roles.rolsuper AS "superuser",
        roles.rolbypassrls AS "bypassRls",
        roles.rolinherit AS "inherits",
        pg_has_role(current_user, 'signalstack_runtime', 'MEMBER') AS "runtimeMember"
      FROM pg_roles roles
      WHERE roles.rolname = current_user
    `;
    expect(role).toEqual({
      superuser: false,
      bypassRls: false,
      inherits: false,
      runtimeMember: true
    });

    expect(Object.keys(seeded.ids).sort()).toEqual([...protectedTenantTables].sort());
  });

  it("returns no rows from every protected table when tenant context is missing", async () => {
    const snapshot = await readMissingContextSnapshot(requireClient(runtime));
    expect(snapshot.settings).toEqual({
      orgId: null,
      userId: null,
      sessionHash: null,
      tokenHash: null,
      apiKeyHash: null
    });
    for (const table of protectedTenantTables) {
      expect(snapshot.rows[table], `${table} must fail closed without context`).toEqual([]);
    }
  });

  it("limits every unfiltered protected-table read to organization A", async () => {
    const client = requireClient(runtime);
    const seeded = requireFixture(fixture);
    const rows = await readTenantRows(client, seeded.orgAId, seeded.userAId);

    for (const table of ordinaryTenantTables) {
      expect(rows[table], `${table} must expose only the A fixture`).toEqual([
        { id: fixtureId(seeded, table, "a"), orgId: seeded.orgAId }
      ]);
    }

    expect(rows.Organization).toEqual([{ id: seeded.orgAId }]);
    // AppUser has no orgId; its policy derives visibility through the A membership.
    expect(rows.AppUser).toEqual([{ id: seeded.userAId }]);
    for (const table of ["Membership", "AuthSession", "AuthToken"] as const) {
      expect(rows[table]).toEqual([
        { id: fixtureId(seeded, table, "a"), orgId: seeded.orgAId }
      ]);
    }
  });

  it("rejects forged organization changes on every ordinary tenant table", async () => {
    const client = requireClient(runtime);
    const seeded = requireFixture(fixture);

    for (const table of ordinaryTenantTables) {
      await expectRejectedWrite(
        table,
        withTenantTransaction(
          { orgId: seeded.orgAId, userId: seeded.userAId },
          (tx) =>
            tx.$executeRawUnsafe(
              `UPDATE ${quoteIdentifier(table)} SET "orgId" = $1 WHERE "id" = $2`,
              seeded.orgBId,
              fixtureId(seeded, table, "a")
            ),
          { client, attest: false }
        )
      );
    }

    const rows = await readTenantRows(client, seeded.orgAId, seeded.userAId);
    for (const table of ordinaryTenantTables) {
      expect(rows[table]).toEqual([
        { id: fixtureId(seeded, table, "a"), orgId: seeded.orgAId }
      ]);
    }
  });

  it("makes B updates and deletes affect zero rows under organization A", async () => {
    const client = requireClient(runtime);
    const seeded = requireFixture(fixture);
    const affected = await withTenantTransaction(
      { orgId: seeded.orgAId, userId: seeded.userAId },
      async (tx) => {
        const result = {} as Record<
          OrdinaryTenantTable,
          Readonly<{ updated: number; deleted: number }>
        >;
        for (const table of ordinaryTenantTables) {
          const id = fixtureId(seeded, table, "b");
          if (appendOnlyTenantTableSet.has(table)) {
            result[table] = { updated: 0, deleted: 0 };
            continue;
          }
          const updated = await tx.$executeRawUnsafe(
            `UPDATE ${quoteIdentifier(table)} SET "orgId" = "orgId" WHERE "id" = $1`,
            id
          );
          const deleted = nonDeletableTenantTableSet.has(table)
            ? 0
            : await tx.$executeRawUnsafe(
                `DELETE FROM ${quoteIdentifier(table)} WHERE "id" = $1`,
                id
              );
          result[table] = { updated, deleted };
        }
        return result;
      },
      { client, attest: false }
    );

    for (const table of ordinaryTenantTables) {
      expect(affected[table], `${table} must hide B writes from A`).toEqual({
        updated: 0,
        deleted: 0
      });
    }

    const bRows = await readTenantRows(client, seeded.orgBId, seeded.userBId);
    for (const table of ordinaryTenantTables) {
      expect(bRows[table]).toEqual([
        { id: fixtureId(seeded, table, "b"), orgId: seeded.orgBId }
      ]);
    }
  });

  it("denies updates to append-only rows and hard deletes of durable M3 rows", async () => {
    const client = requireClient(runtime);
    const seeded = requireFixture(fixture);

    for (const table of appendOnlyTenantTables) {
      const id = fixtureId(seeded, table, "a");
      await expect(
        withTenantTransaction(
          { orgId: seeded.orgAId, userId: seeded.userAId },
          (tx) =>
            tx.$executeRawUnsafe(
              `UPDATE ${quoteIdentifier(table)} SET "orgId" = "orgId" WHERE "id" = $1`,
              id
            ),
          { client, attest: false }
        )
      ).rejects.toThrow();
    }
    for (const table of nonDeletableTenantTables) {
      const id = fixtureId(seeded, table, "a");
      await expect(
        withTenantTransaction(
          { orgId: seeded.orgAId, userId: seeded.userAId },
          (tx) =>
            tx.$executeRawUnsafe(
              `DELETE FROM ${quoteIdentifier(table)} WHERE "id" = $1`,
              id
            ),
          { client, attest: false }
        )
      ).rejects.toThrow();
    }
  });

  it("clears every context value after commit and rollback on one pooled connection", async () => {
    const client = requireClient(runtime);
    const seeded = requireFixture(fixture);

    await withTenantTransaction(
      { orgId: seeded.orgAId, userId: seeded.userAId },
      async (tx) => {
        expect(await selectTableRows(tx, "Contact")).toEqual([
          { id: fixtureId(seeded, "Contact", "a"), orgId: seeded.orgAId }
        ]);
      },
      { client, attest: false }
    );
    assertMissingContext(await readMissingContextSnapshot(client));

    await expect(
      withTenantTransaction(
        { orgId: seeded.orgBId, userId: seeded.userBId },
        async (tx) => {
          expect(await selectTableRows(tx, "Contact")).toEqual([
            { id: fixtureId(seeded, "Contact", "b"), orgId: seeded.orgBId }
          ]);
          throw new Error("intentional tenant rollback");
        },
        { client, attest: false }
      )
    ).rejects.toThrow("intentional tenant rollback");
    assertMissingContext(await readMissingContextSnapshot(client));
  });

  it("keeps parallel A/B transactions isolated across a multi-connection pool", async () => {
    const client = requireClient(parallelRuntime);
    const seeded = requireFixture(fixture);
    const results = await Promise.all(
      Array.from({ length: 12 }, async (_, index) => {
        const side: FixtureSide = index % 2 === 0 ? "a" : "b";
        const orgId = side === "a" ? seeded.orgAId : seeded.orgBId;
        const userId = side === "a" ? seeded.userAId : seeded.userBId;
        return withTenantTransaction(
          { orgId, userId },
          async (tx) => {
            await tx.$queryRawUnsafe('SELECT 1 AS "one" FROM pg_sleep(0.01)');
            const [setting] = await tx.$queryRaw<Array<{ orgId: string | null }>>`
              SELECT NULLIF(current_setting('app.current_org_id', true), '') AS "orgId"
            `;
            return {
              side,
              setting: setting?.orgId ?? null,
              activeContext: currentTenantDatabaseContext(),
              contacts: await selectTableRows(tx, "Contact")
            };
          },
          { client, attest: false }
        );
      })
    );

    for (const result of results) {
      const orgId = result.side === "a" ? seeded.orgAId : seeded.orgBId;
      expect(result.setting).toBe(orgId);
      expect(result.activeContext?.orgId).toBe(orgId);
      expect(result.contacts).toEqual([
        { id: fixtureId(seeded, "Contact", result.side), orgId }
      ]);
    }
    expect(currentTenantDatabaseContext()).toBeNull();

    const cleared = await Promise.all(
      Array.from({ length: 8 }, () => readMissingContactState(client))
    );
    expect(cleared).toEqual(
      Array.from({ length: 8 }, () => ({ orgId: null, contactCount: 0 }))
    );
  });

  it("reuses only matching nested context and rejects client, org, and user switches", async () => {
    const client = requireClient(runtime);
    const otherClient = requireClient(parallelRuntime);
    const seeded = requireFixture(fixture);

    const result = await withTenantTransaction(
      { orgId: seeded.orgAId, userId: seeded.userAId },
      async (outer) => {
        const [outerTransaction] = await outer.$queryRaw<Array<{ id: string }>>`
          SELECT txid_current()::text AS "id"
        `;
        const nested = await withTenantTransaction(
          { orgId: seeded.orgAId },
          async (inner) => {
            const [innerTransaction] = await inner.$queryRaw<Array<{ id: string }>>`
              SELECT txid_current()::text AS "id"
            `;
            return {
              transactionId: innerTransaction?.id,
              activeContext: currentTenantDatabaseContext(),
              contacts: await selectTableRows(inner, "Contact")
            };
          },
          { client, attest: false }
        );

        await expect(
          withTenantTransaction(
            { orgId: seeded.orgBId, userId: seeded.userBId },
            async () => undefined,
            { client, attest: false }
          )
        ).rejects.toThrow("cannot switch organizations");
        await expect(
          withTenantTransaction(
            { orgId: seeded.orgAId, userId: seeded.userBId },
            async () => undefined,
            { client, attest: false }
          )
        ).rejects.toThrow("cannot switch users");
        await expect(
          withTenantTransaction(
            { orgId: seeded.orgAId },
            async () => undefined,
            { client: otherClient, attest: false }
          )
        ).rejects.toThrow("cannot switch clients");

        return {
          outerTransactionId: outerTransaction?.id,
          nested,
          finalContext: currentTenantDatabaseContext(),
          finalContacts: await selectTableRows(outer, "Contact")
        };
      },
      { client, attest: false }
    );

    expect(result.nested.transactionId).toBe(result.outerTransactionId);
    expect(result.nested.activeContext).toEqual({
      orgId: seeded.orgAId,
      userId: seeded.userAId
    });
    expect(result.nested.contacts).toEqual([
      { id: fixtureId(seeded, "Contact", "a"), orgId: seeded.orgAId }
    ]);
    expect(result.finalContext).toEqual({ orgId: seeded.orgAId, userId: seeded.userAId });
    expect(result.finalContacts).toEqual(result.nested.contacts);
    expect(currentTenantDatabaseContext()).toBeNull();
    await expect(readMissingContactState(client)).resolves.toEqual({
      orgId: null,
      contactCount: 0
    });
  });
});

async function seedOwnerFixtures(): Promise<OwnerFixture> {
  return prisma.$transaction(async (tx) => {
    const ids = {} as FixtureIds;
    const remember = (table: ProtectedTenantTable, a: string, b: string) => {
      ids[table] = { a, b };
    };
    const fixtureLabel = `runtime-${suiteToken}`;
    const future = new Date(Date.now() + 60 * 60 * 1_000);
    const scheduledAt = new Date(Date.now() + 30 * 60 * 1_000);
    const phoneTail = numericTail(suiteToken);

    const orgA = await tx.organization.create({
      data: { slug: `${fixtureLabel}-a`, name: "Runtime Matrix", demoMode: true }
    });
    const orgB = await tx.organization.create({
      data: { slug: `${fixtureLabel}-b`, name: "Runtime Matrix", demoMode: true }
    });
    remember("Organization", orgA.id, orgB.id);

    const userA = await tx.appUser.create({
      data: {
        email: `${fixtureLabel}-a@example.test`,
        normalizedEmail: `${fixtureLabel}-a@example.test`
      }
    });
    const userB = await tx.appUser.create({
      data: {
        email: `${fixtureLabel}-b@example.test`,
        normalizedEmail: `${fixtureLabel}-b@example.test`
      }
    });
    remember("AppUser", userA.id, userB.id);

    const membershipA = await tx.membership.create({
      data: { orgId: orgA.id, userId: userA.id, role: MembershipRole.OWNER }
    });
    const membershipB = await tx.membership.create({
      data: { orgId: orgB.id, userId: userB.id, role: MembershipRole.OWNER }
    });
    remember("Membership", membershipA.id, membershipB.id);

    const contactA = await tx.contact.create({
      data: { orgId: orgA.id, phone: `+1555${phoneTail}` }
    });
    const contactB = await tx.contact.create({
      data: { orgId: orgB.id, phone: `+1555${phoneTail}` }
    });
    remember("Contact", contactA.id, contactB.id);

    const tagA = await tx.tag.create({ data: { orgId: orgA.id, name: fixtureLabel } });
    const tagB = await tx.tag.create({ data: { orgId: orgB.id, name: fixtureLabel } });
    remember("Tag", tagA.id, tagB.id);

    const contactTagA = await tx.contactTag.create({
      data: { orgId: orgA.id, contactId: contactA.id, tagId: tagA.id }
    });
    const contactTagB = await tx.contactTag.create({
      data: { orgId: orgB.id, contactId: contactB.id, tagId: tagB.id }
    });
    remember("ContactTag", contactTagA.id, contactTagB.id);

    const listA = await tx.contactList.create({
      data: { orgId: orgA.id, name: fixtureLabel }
    });
    const listB = await tx.contactList.create({
      data: { orgId: orgB.id, name: fixtureLabel }
    });
    remember("ContactList", listA.id, listB.id);

    const listMemberA = await tx.contactListMember.create({
      data: { orgId: orgA.id, listId: listA.id, contactId: contactA.id }
    });
    const listMemberB = await tx.contactListMember.create({
      data: { orgId: orgB.id, listId: listB.id, contactId: contactB.id }
    });
    remember("ContactListMember", listMemberA.id, listMemberB.id);

    const segmentA = await tx.segment.create({
      data: { orgId: orgA.id, name: fixtureLabel, definition: {} }
    });
    const segmentB = await tx.segment.create({
      data: { orgId: orgB.id, name: fixtureLabel, definition: {} }
    });
    remember("Segment", segmentA.id, segmentB.id);

    const templateA = await tx.messageTemplate.create({
      data: { orgId: orgA.id, name: fixtureLabel, body: "Runtime matrix", variables: {} }
    });
    const templateB = await tx.messageTemplate.create({
      data: { orgId: orgB.id, name: fixtureLabel, body: "Runtime matrix", variables: {} }
    });
    remember("MessageTemplate", templateA.id, templateB.id);

    const contactImportA = await tx.contactImport.create({
      data: { orgId: orgA.id, filename: "runtime.csv" }
    });
    const contactImportB = await tx.contactImport.create({
      data: { orgId: orgB.id, filename: "runtime.csv" }
    });
    remember("ContactImport", contactImportA.id, contactImportB.id);

    const campaignA = await tx.campaign.create({
      data: {
        orgId: orgA.id,
        templateId: templateA.id,
        name: fixtureLabel,
        body: "Runtime matrix"
      }
    });
    const campaignB = await tx.campaign.create({
      data: {
        orgId: orgB.id,
        templateId: templateB.id,
        name: fixtureLabel,
        body: "Runtime matrix"
      }
    });
    remember("Campaign", campaignA.id, campaignB.id);

    const recipientA = await tx.campaignRecipient.create({
      data: { orgId: orgA.id, campaignId: campaignA.id, contactId: contactA.id }
    });
    const recipientB = await tx.campaignRecipient.create({
      data: { orgId: orgB.id, campaignId: campaignB.id, contactId: contactB.id }
    });
    remember("CampaignRecipient", recipientA.id, recipientB.id);

    const conversationA = await tx.conversation.create({
      data: { orgId: orgA.id, contactId: contactA.id, assignedToUserId: userA.id }
    });
    const conversationB = await tx.conversation.create({
      data: { orgId: orgB.id, contactId: contactB.id, assignedToUserId: userB.id }
    });
    remember("Conversation", conversationA.id, conversationB.id);

    const queuePayloadA = {
      version: 1,
      orgId: orgA.id,
      campaignId: campaignA.id,
      scheduledAt: scheduledAt.toISOString()
    };
    const queuePayloadB = {
      version: 1,
      orgId: orgB.id,
      campaignId: campaignB.id,
      scheduledAt: scheduledAt.toISOString()
    };
    const queueA = await tx.queueJob.create({
      data: {
        orgId: orgA.id,
        campaignId: campaignA.id,
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        idempotencyKey: fixtureLabel,
        payload: queuePayloadA,
        runAt: scheduledAt
      }
    });
    const queueB = await tx.queueJob.create({
      data: {
        orgId: orgB.id,
        campaignId: campaignB.id,
        type: QueueJobType.SCHEDULED_CAMPAIGN,
        idempotencyKey: fixtureLabel,
        payload: queuePayloadB,
        runAt: scheduledAt
      }
    });
    remember("QueueJob", queueA.id, queueB.id);

    const messageA = await tx.message.create({
      data: {
        orgId: orgA.id,
        contactId: contactA.id,
        conversationId: conversationA.id,
        campaignId: campaignA.id,
        direction: "OUTBOUND",
        body: "Runtime matrix",
        providerMessageId: fixtureLabel,
        idempotencyKey: fixtureLabel
      }
    });
    const messageB = await tx.message.create({
      data: {
        orgId: orgB.id,
        contactId: contactB.id,
        conversationId: conversationB.id,
        campaignId: campaignB.id,
        direction: "OUTBOUND",
        body: "Runtime matrix",
        providerMessageId: fixtureLabel,
        idempotencyKey: fixtureLabel
      }
    });
    remember("Message", messageA.id, messageB.id);

    const noteA = await tx.internalNote.create({
      data: {
        orgId: orgA.id,
        conversationId: conversationA.id,
        authorUserId: userA.id,
        body: "Runtime matrix"
      }
    });
    const noteB = await tx.internalNote.create({
      data: {
        orgId: orgB.id,
        conversationId: conversationB.id,
        authorUserId: userB.id,
        body: "Runtime matrix"
      }
    });
    remember("InternalNote", noteA.id, noteB.id);

    const complianceA = await tx.complianceProfile.create({ data: { orgId: orgA.id } });
    const complianceB = await tx.complianceProfile.create({ data: { orgId: orgB.id } });
    remember("ComplianceProfile", complianceA.id, complianceB.id);

    const usageA = await tx.usageEvent.create({
      data: { orgId: orgA.id, type: UsageEventType.AI_REQUEST }
    });
    const usageB = await tx.usageEvent.create({
      data: { orgId: orgB.id, type: UsageEventType.AI_REQUEST }
    });
    remember("UsageEvent", usageA.id, usageB.id);

    const billingA = await tx.billingAccount.create({ data: { orgId: orgA.id } });
    const billingB = await tx.billingAccount.create({ data: { orgId: orgB.id } });
    remember("BillingAccount", billingA.id, billingB.id);

    const providerPhoneA = await tx.providerPhoneNumber.create({
      data: {
        orgId: orgA.id,
        phoneNumber: `+1666${phoneTail}`,
        provider: fixtureLabel,
        capabilities: { sms: true }
      }
    });
    const providerPhoneB = await tx.providerPhoneNumber.create({
      data: {
        orgId: orgB.id,
        phoneNumber: `+1666${phoneTail}`,
        provider: fixtureLabel,
        capabilities: { sms: true }
      }
    });
    remember("ProviderPhoneNumber", providerPhoneA.id, providerPhoneB.id);

    const credentialA = await tx.providerCredential.create({
      data: { orgId: orgA.id, provider: fixtureLabel }
    });
    const credentialB = await tx.providerCredential.create({
      data: { orgId: orgB.id, provider: fixtureLabel }
    });
    remember("ProviderCredential", credentialA.id, credentialB.id);

    const rotationA = await tx.providerCredentialRotation.create({
      data: {
        orgId: orgA.id,
        provider: fixtureLabel,
        providerCredentialId: credentialA.id,
        actorUserId: userA.id,
        action: "RUNTIME_MATRIX_CREATED"
      }
    });
    const rotationB = await tx.providerCredentialRotation.create({
      data: {
        orgId: orgB.id,
        provider: fixtureLabel,
        providerCredentialId: credentialB.id,
        actorUserId: userB.id,
        action: "RUNTIME_MATRIX_CREATED"
      }
    });
    remember("ProviderCredentialRotation", rotationA.id, rotationB.id);

    const auditA = await tx.liveReadinessAuditEvent.create({
      data: {
        orgId: orgA.id,
        actorUserId: userA.id,
        action: "RUNTIME_MATRIX_CREATED",
        subjectType: "Organization",
        subjectId: orgA.id
      }
    });
    const auditB = await tx.liveReadinessAuditEvent.create({
      data: {
        orgId: orgB.id,
        actorUserId: userB.id,
        action: "RUNTIME_MATRIX_CREATED",
        subjectType: "Organization",
        subjectId: orgB.id
      }
    });
    remember("LiveReadinessAuditEvent", auditA.id, auditB.id);

    const webhookA = await tx.webhookEvent.create({
      data: {
        orgId: orgA.id,
        provider: fixtureLabel,
        eventType: "runtime.matrix",
        idempotencyKey: fixtureLabel,
        rawPayload: {}
      }
    });
    const webhookB = await tx.webhookEvent.create({
      data: {
        orgId: orgB.id,
        provider: fixtureLabel,
        eventType: "runtime.matrix",
        idempotencyKey: fixtureLabel,
        rawPayload: {}
      }
    });
    remember("WebhookEvent", webhookA.id, webhookB.id);

    const apiCredentialA = await tx.apiCredential.create({
      data: {
        orgId: orgA.id,
        name: fixtureLabel,
        prefix: `${fixtureLabel}-a`,
        secretHash: tokenHash("api-key-a"),
        scopes: ["contacts:read"]
      }
    });
    const apiCredentialB = await tx.apiCredential.create({
      data: {
        orgId: orgB.id,
        name: fixtureLabel,
        prefix: `${fixtureLabel}-b`,
        secretHash: tokenHash("api-key-b"),
        scopes: ["contacts:read"]
      }
    });
    remember("ApiCredential", apiCredentialA.id, apiCredentialB.id);

    const idempotencyA = await tx.apiIdempotencyRecord.create({
      data: {
        orgId: orgA.id,
        credentialId: apiCredentialA.id,
        key: fixtureLabel,
        method: "POST",
        canonicalRoute: "/api/v1/contacts",
        requestHash: tokenHash("request-a"),
        responseStatus: 201,
        responseBody: {},
        responseHeaders: {},
        expiresAt: future
      }
    });
    const idempotencyB = await tx.apiIdempotencyRecord.create({
      data: {
        orgId: orgB.id,
        credentialId: apiCredentialB.id,
        key: fixtureLabel,
        method: "POST",
        canonicalRoute: "/api/v1/contacts",
        requestHash: tokenHash("request-b"),
        responseStatus: 201,
        responseBody: {},
        responseHeaders: {},
        expiresAt: future
      }
    });
    remember("ApiIdempotencyRecord", idempotencyA.id, idempotencyB.id);

    const integrationAuditA = await tx.integrationAuditEvent.create({
      data: {
        orgId: orgA.id,
        actorUserId: userA.id,
        apiCredentialId: apiCredentialA.id,
        action: "RUNTIME_MATRIX_CREATED",
        subjectType: "api_credential",
        subjectId: apiCredentialA.id
      }
    });
    const integrationAuditB = await tx.integrationAuditEvent.create({
      data: {
        orgId: orgB.id,
        actorUserId: userB.id,
        apiCredentialId: apiCredentialB.id,
        action: "RUNTIME_MATRIX_CREATED",
        subjectType: "api_credential",
        subjectId: apiCredentialB.id
      }
    });
    remember("IntegrationAuditEvent", integrationAuditA.id, integrationAuditB.id);

    const customerEndpointA = await tx.customerWebhookEndpoint.create({
      data: {
        orgId: orgA.id,
        name: fixtureLabel,
        canonicalUrl: `https://a-${suiteToken}.example.test/events`
      }
    });
    const customerEndpointB = await tx.customerWebhookEndpoint.create({
      data: {
        orgId: orgB.id,
        name: fixtureLabel,
        canonicalUrl: `https://b-${suiteToken}.example.test/events`
      }
    });
    remember("CustomerWebhookEndpoint", customerEndpointA.id, customerEndpointB.id);

    const customerSubscriptionA = await tx.customerWebhookSubscription.create({
      data: {
        orgId: orgA.id,
        endpointId: customerEndpointA.id,
        eventTypes: ["contact.created"]
      }
    });
    const customerSubscriptionB = await tx.customerWebhookSubscription.create({
      data: {
        orgId: orgB.id,
        endpointId: customerEndpointB.id,
        eventTypes: ["contact.created"]
      }
    });
    remember(
      "CustomerWebhookSubscription",
      customerSubscriptionA.id,
      customerSubscriptionB.id
    );

    const signingSecretA = await tx.customerWebhookSigningSecret.create({
      data: {
        orgId: orgA.id,
        subscriptionId: customerSubscriptionA.id,
        version: 1,
        ciphertext: tokenHash("ciphertext-a"),
        iv: tokenHash("iv-a"),
        authTag: tokenHash("tag-a"),
        keyVersion: 1,
        fingerprint: tokenHash("fingerprint-a")
      }
    });
    const signingSecretB = await tx.customerWebhookSigningSecret.create({
      data: {
        orgId: orgB.id,
        subscriptionId: customerSubscriptionB.id,
        version: 1,
        ciphertext: tokenHash("ciphertext-b"),
        iv: tokenHash("iv-b"),
        authTag: tokenHash("tag-b"),
        keyVersion: 1,
        fingerprint: tokenHash("fingerprint-b")
      }
    });
    remember("CustomerWebhookSigningSecret", signingSecretA.id, signingSecretB.id);

    const customerEventA = await tx.customerWebhookEvent.create({
      data: {
        orgId: orgA.id,
        deduplicationKey: fixtureLabel,
        type: "contact.created",
        aggregateType: "contact",
        aggregateId: contactA.id,
        payloadText: "{}",
        payloadHash: tokenHash("payload-a"),
        occurredAt: new Date()
      }
    });
    const customerEventB = await tx.customerWebhookEvent.create({
      data: {
        orgId: orgB.id,
        deduplicationKey: fixtureLabel,
        type: "contact.created",
        aggregateType: "contact",
        aggregateId: contactB.id,
        payloadText: "{}",
        payloadHash: tokenHash("payload-b"),
        occurredAt: new Date()
      }
    });
    remember("CustomerWebhookEvent", customerEventA.id, customerEventB.id);

    const customerDeliveryA = await tx.customerWebhookDelivery.create({
      data: {
        orgId: orgA.id,
        endpointId: customerEndpointA.id,
        subscriptionId: customerSubscriptionA.id,
        eventId: customerEventA.id,
        signingSecretId: signingSecretA.id
      }
    });
    const customerDeliveryB = await tx.customerWebhookDelivery.create({
      data: {
        orgId: orgB.id,
        endpointId: customerEndpointB.id,
        subscriptionId: customerSubscriptionB.id,
        eventId: customerEventB.id,
        signingSecretId: signingSecretB.id
      }
    });
    remember("CustomerWebhookDelivery", customerDeliveryA.id, customerDeliveryB.id);

    const attemptStartedAt = new Date();
    const customerAttemptA = await tx.customerWebhookDeliveryAttempt.create({
      data: {
        orgId: orgA.id,
        deliveryId: customerDeliveryA.id,
        generation: customerDeliveryA.generation,
        attemptNumber: 1,
        requestTimestamp: attemptStartedAt,
        outcome: "ACKNOWLEDGED",
        startedAt: attemptStartedAt,
        finishedAt: attemptStartedAt
      }
    });
    const customerAttemptB = await tx.customerWebhookDeliveryAttempt.create({
      data: {
        orgId: orgB.id,
        deliveryId: customerDeliveryB.id,
        generation: customerDeliveryB.generation,
        attemptNumber: 1,
        requestTimestamp: attemptStartedAt,
        outcome: "ACKNOWLEDGED",
        startedAt: attemptStartedAt,
        finishedAt: attemptStartedAt
      }
    });
    remember(
      "CustomerWebhookDeliveryAttempt",
      customerAttemptA.id,
      customerAttemptB.id
    );

    const sessionA = await tx.authSession.create({
      data: {
        tokenHash: tokenHash("session-a"),
        userId: userA.id,
        orgId: orgA.id,
        authVersion: userA.authVersion,
        idleExpiresAt: future,
        absoluteExpiresAt: future
      }
    });
    const sessionB = await tx.authSession.create({
      data: {
        tokenHash: tokenHash("session-b"),
        userId: userB.id,
        orgId: orgB.id,
        authVersion: userB.authVersion,
        idleExpiresAt: future,
        absoluteExpiresAt: future
      }
    });
    remember("AuthSession", sessionA.id, sessionB.id);

    const inviteA = await tx.authToken.create({
      data: {
        type: AuthTokenType.INVITE,
        tokenHash: tokenHash("invite-a"),
        orgId: orgA.id,
        email: `${fixtureLabel}-invite-a@example.test`,
        role: MembershipRole.MEMBER,
        issuedByUserId: userA.id,
        expiresAt: future
      }
    });
    const inviteB = await tx.authToken.create({
      data: {
        type: AuthTokenType.INVITE,
        tokenHash: tokenHash("invite-b"),
        orgId: orgB.id,
        email: `${fixtureLabel}-invite-b@example.test`,
        role: MembershipRole.MEMBER,
        issuedByUserId: userB.id,
        expiresAt: future
      }
    });
    remember("AuthToken", inviteA.id, inviteB.id);

    for (const table of protectedTenantTables) {
      if (!ids[table]?.a || !ids[table]?.b) {
        throw new Error(`Owner fixture is missing protected table ${table}.`);
      }
    }

    return {
      ids,
      orgAId: orgA.id,
      orgBId: orgB.id,
      userAId: userA.id,
      userBId: userB.id
    };
  });
}

async function readTenantRows(
  client: PrismaClient,
  orgId: string,
  userId: string
): Promise<ProtectedRows> {
  return withTenantTransaction(
    { orgId, userId },
    async (tx) => {
      const rows = {} as ProtectedRows;
      for (const table of protectedTenantTables) {
        rows[table] = await selectTableRows(tx, table);
      }
      return rows;
    },
    { client, attest: false }
  );
}

async function readMissingContextSnapshot(client: PrismaClient) {
  return client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_runtime");
    const [settings] = await tx.$queryRaw<
      Array<{
        orgId: string | null;
        userId: string | null;
        sessionHash: string | null;
        tokenHash: string | null;
        apiKeyHash: string | null;
      }>
    >`
      SELECT
        NULLIF(current_setting('app.current_org_id', true), '') AS "orgId",
        NULLIF(current_setting('app.current_user_id', true), '') AS "userId",
        NULLIF(current_setting('app.current_session_hash', true), '') AS "sessionHash",
        NULLIF(current_setting('app.current_token_hash', true), '') AS "tokenHash",
        NULLIF(current_setting('app.current_api_key_hash', true), '') AS "apiKeyHash"
    `;
    const rows = {} as ProtectedRows;
    for (const table of protectedTenantTables) {
      rows[table] = await selectTableRows(tx, table);
    }
    return {
      settings: settings ?? {
        orgId: null,
        userId: null,
        sessionHash: null,
        tokenHash: null,
        apiKeyHash: null
      },
      rows
    };
  });
}

async function readMissingContactState(client: PrismaClient) {
  return client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_runtime");
    const [setting] = await tx.$queryRaw<Array<{ orgId: string | null }>>`
      SELECT NULLIF(current_setting('app.current_org_id', true), '') AS "orgId"
    `;
    return {
      orgId: setting?.orgId ?? null,
      contactCount: await tx.contact.count()
    };
  });
}

async function selectTableRows(
  tx: Prisma.TransactionClient,
  table: ProtectedTenantTable
): Promise<readonly TenantRow[]> {
  const organizationColumn = table === "Organization" || table === "AppUser" ? "" : ', "orgId"';
  return tx.$queryRawUnsafe<Array<{ id: string; orgId?: string }>>(
    `SELECT "id"${organizationColumn} FROM ${quoteIdentifier(table)} ORDER BY "id"`
  );
}

function assertMissingContext(snapshot: Awaited<ReturnType<typeof readMissingContextSnapshot>>) {
  expect(snapshot.settings).toEqual({
    orgId: null,
    userId: null,
    sessionHash: null,
    tokenHash: null,
    apiKeyHash: null
  });
  for (const table of protectedTenantTables) {
    expect(snapshot.rows[table], `${table} leaked after transaction completion`).toEqual([]);
  }
}

async function expectRejectedWrite(table: OrdinaryTenantTable, operation: Promise<unknown>) {
  try {
    await operation;
  } catch {
    return;
  }
  throw new Error(`Cross-organization UPDATE unexpectedly succeeded for ${table}.`);
}

function fixtureId(
  fixture: OwnerFixture,
  table: ProtectedTenantTable,
  side: FixtureSide
): string {
  const value = fixture.ids[table]?.[side];
  if (!value) {
    throw new Error(`Missing ${side.toUpperCase()} fixture ID for ${table}.`);
  }
  return value;
}

function requireFixture(value: OwnerFixture | undefined): OwnerFixture {
  if (!value) {
    throw new Error("Tenant runtime owner fixture was not initialized.");
  }
  return value;
}

function requireClient(value: PrismaClient | undefined): PrismaClient {
  if (!value) {
    throw new Error("Tenant runtime client was not initialized.");
  }
  return value;
}

function runtimeDatabaseUrl(connectionLimit: number): string {
  const source = process.env.DATABASE_URL;
  if (!source) {
    throw new Error("DATABASE_URL is required for tenant runtime integration tests.");
  }
  const url = new URL(source);
  url.username = loginRole;
  url.password = loginPassword;
  url.searchParams.set("connection_limit", connectionLimit.toString());
  return url.toString();
}

function tokenHash(label: string): string {
  return createHash("sha256")
    .update(`${suiteToken}:${label}`, "utf8")
    .digest("base64url");
}

function numericTail(value: string): string {
  const numeric = BigInt(`0x${createHash("sha256").update(value).digest("hex").slice(0, 12)}`);
  return (numeric % 10_000_000n).toString().padStart(7, "0");
}

function quoteIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error("Unsafe SQL identifier in tenant runtime test.");
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
