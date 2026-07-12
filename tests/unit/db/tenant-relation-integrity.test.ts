import { createHash, randomUUID } from "node:crypto";
import { MembershipRole, Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";

// Postgres-backed proof for the M2 tenant-relation migration. The default
// unit suite skips it so local tests never require infrastructure. Run with:
//   RUN_DB_TESTS=true DATABASE_URL=postgresql://... npx vitest run tests/unit/db/tenant-relation-integrity.test.ts
const run = process.env.RUN_DB_TESTS === "true";

const suffix = randomUUID().replaceAll("-", "");
const future = new Date("2030-01-01T00:00:00.000Z");

let orgAId = "";
let orgBId = "";
let userAId = "";
let userBId = "";
let contactAId = "";
let contactBId = "";
let tagAId = "";
let tagBId = "";
let listAId = "";
let listBId = "";
let templateAId = "";
let templateBId = "";
let campaignAId = "";
let campaignBId = "";
let conversationAId = "";
let conversationBId = "";
let providerCredentialAId = "";
let providerCredentialBId = "";

function rowId(label: string) {
  return `${label}_${suffix}`;
}

function bearerHash(label: string) {
  return createHash("sha256").update(`${label}_${suffix}`).digest("base64url");
}

function sqlState(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const meta = Reflect.get(error, "meta");
  if (typeof meta === "object" && meta !== null) {
    const nestedCode = Reflect.get(meta, "code");
    if (typeof nestedCode === "string") {
      return nestedCode;
    }
  }

  const directCode = Reflect.get(error, "code");
  return typeof directCode === "string" ? directCode : undefined;
}

async function expectSqlState(operation: Promise<unknown>, expected: string) {
  try {
    await operation;
  } catch (error) {
    expect(sqlState(error)).toBe(expected);
    return;
  }

  throw new Error(`Expected PostgreSQL SQLSTATE ${expected}, but the write succeeded.`);
}

describe.runIf(run)("M2 tenant relation database integrity", () => {
  beforeAll(async () => {
    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({
        data: { name: "Relation Integrity A", slug: `relation-integrity-a-${suffix}` }
      }),
      prisma.organization.create({
        data: { name: "Relation Integrity B", slug: `relation-integrity-b-${suffix}` }
      })
    ]);
    orgAId = orgA.id;
    orgBId = orgB.id;

    const [userA, userB] = await Promise.all([
      prisma.appUser.create({
        data: {
          email: `relation-a-${suffix}@example.test`,
          normalizedEmail: `relation-a-${suffix}@example.test`
        }
      }),
      prisma.appUser.create({
        data: {
          email: `relation-b-${suffix}@example.test`,
          normalizedEmail: `relation-b-${suffix}@example.test`
        }
      })
    ]);
    userAId = userA.id;
    userBId = userB.id;

    await prisma.membership.createMany({
      data: [
        { orgId: orgAId, userId: userAId, role: MembershipRole.OWNER },
        { orgId: orgBId, userId: userBId, role: MembershipRole.OWNER }
      ]
    });

    const [contactA, contactB, tagA, tagB, listA, listB, templateA, templateB] =
      await Promise.all([
        prisma.contact.create({
          data: { orgId: orgAId, phone: `+1555${suffix.slice(0, 7)}01` }
        }),
        prisma.contact.create({
          data: { orgId: orgBId, phone: `+1555${suffix.slice(0, 7)}02` }
        }),
        prisma.tag.create({ data: { orgId: orgAId, name: `Tag A ${suffix}` } }),
        prisma.tag.create({ data: { orgId: orgBId, name: `Tag B ${suffix}` } }),
        prisma.contactList.create({ data: { orgId: orgAId, name: `List A ${suffix}` } }),
        prisma.contactList.create({ data: { orgId: orgBId, name: `List B ${suffix}` } }),
        prisma.messageTemplate.create({
          data: { orgId: orgAId, name: `Template A ${suffix}`, body: "Hello A", variables: {} }
        }),
        prisma.messageTemplate.create({
          data: { orgId: orgBId, name: `Template B ${suffix}`, body: "Hello B", variables: {} }
        })
      ]);
    contactAId = contactA.id;
    contactBId = contactB.id;
    tagAId = tagA.id;
    tagBId = tagB.id;
    listAId = listA.id;
    listBId = listB.id;
    templateAId = templateA.id;
    templateBId = templateB.id;

    const [campaignA, campaignB, conversationA, conversationB] = await Promise.all([
      prisma.campaign.create({
        data: {
          orgId: orgAId,
          templateId: templateAId,
          name: `Campaign A ${suffix}`,
          body: "Campaign A"
        }
      }),
      prisma.campaign.create({
        data: {
          orgId: orgBId,
          templateId: templateBId,
          name: `Campaign B ${suffix}`,
          body: "Campaign B"
        }
      }),
      prisma.conversation.create({ data: { orgId: orgAId, contactId: contactAId } }),
      prisma.conversation.create({ data: { orgId: orgBId, contactId: contactBId } })
    ]);
    campaignAId = campaignA.id;
    campaignBId = campaignB.id;
    conversationAId = conversationA.id;
    conversationBId = conversationB.id;

    const [providerCredentialA, providerCredentialB] = await Promise.all([
      prisma.providerCredential.create({
        data: { orgId: orgAId, provider: `fixture-${suffix}` }
      }),
      prisma.providerCredential.create({
        data: { orgId: orgBId, provider: `fixture-${suffix}` }
      })
    ]);
    providerCredentialAId = providerCredentialA.id;
    providerCredentialBId = providerCredentialB.id;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.appUser.deleteMany({
      where: { normalizedEmail: { contains: suffix } }
    });
  });

  it("accepts every strict same-org relation", async () => {
    const campaignId = rowId("campaign_same");
    const conversationId = rowId("conversation_same");

    await expect(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "ContactTag" ("id", "orgId", "contactId", "tagId")
        VALUES (${rowId("contact_tag_same")}, ${orgAId}, ${contactAId}, ${tagAId})
      `)
    ).resolves.toBe(1);

    await expect(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "ContactListMember" ("id", "orgId", "listId", "contactId")
        VALUES (${rowId("list_member_same")}, ${orgAId}, ${listAId}, ${contactAId})
      `)
    ).resolves.toBe(1);

    await expect(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "Campaign" ("id", "orgId", "templateId", "name", "body", "updatedAt")
        VALUES (${campaignId}, ${orgAId}, ${templateAId}, ${`Same ${suffix}`}, 'same', NOW())
      `)
    ).resolves.toBe(1);

    await expect(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "CampaignRecipient"
          ("id", "orgId", "campaignId", "contactId", "updatedAt")
        VALUES
          (${rowId("recipient_same")}, ${orgAId}, ${campaignId}, ${contactAId}, NOW())
      `)
    ).resolves.toBe(1);

    await expect(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "Conversation" ("id", "orgId", "contactId", "updatedAt")
        VALUES (${conversationId}, ${orgAId}, ${contactAId}, NOW())
      `)
    ).resolves.toBe(1);

    await expect(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "Message"
          ("id", "orgId", "contactId", "conversationId", "campaignId", "direction", "body", "idempotencyKey")
        VALUES
          (${rowId("message_same")}, ${orgAId}, ${contactAId}, ${conversationId}, ${campaignId},
           'OUTBOUND', 'same', ${rowId("message_same_idempotency")})
      `)
    ).resolves.toBe(1);

    await expect(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "InternalNote" ("id", "orgId", "conversationId", "authorUserId", "body")
        VALUES (${rowId("note_same")}, ${orgAId}, ${conversationId}, ${userAId}, 'same')
      `)
    ).resolves.toBe(1);
  });

  it("rejects every strict cross-org relation with foreign-key SQLSTATE 23503", async () => {
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "ContactTag" ("id", "orgId", "contactId", "tagId")
        VALUES (${rowId("contact_tag_foreign_contact")}, ${orgAId}, ${contactBId}, ${tagAId})
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "ContactTag" ("id", "orgId", "contactId", "tagId")
        VALUES (${rowId("contact_tag_foreign_tag")}, ${orgAId}, ${contactAId}, ${tagBId})
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "ContactListMember" ("id", "orgId", "listId", "contactId")
        VALUES (${rowId("list_member_foreign_list")}, ${orgAId}, ${listBId}, ${contactAId})
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "ContactListMember" ("id", "orgId", "listId", "contactId")
        VALUES (${rowId("list_member_foreign_contact")}, ${orgAId}, ${listAId}, ${contactBId})
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "Campaign" ("id", "orgId", "templateId", "name", "body", "updatedAt")
        VALUES (${rowId("campaign_foreign_template")}, ${orgAId}, ${templateBId},
                ${`Foreign template ${suffix}`}, 'forged', NOW())
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "CampaignRecipient"
          ("id", "orgId", "campaignId", "contactId", "updatedAt")
        VALUES
          (${rowId("recipient_foreign_campaign")}, ${orgAId}, ${campaignBId}, ${contactAId}, NOW())
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "CampaignRecipient"
          ("id", "orgId", "campaignId", "contactId", "updatedAt")
        VALUES
          (${rowId("recipient_foreign_contact")}, ${orgAId}, ${campaignAId}, ${contactBId}, NOW())
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "Conversation" ("id", "orgId", "contactId", "updatedAt")
        VALUES (${rowId("conversation_foreign_contact")}, ${orgAId}, ${contactBId}, NOW())
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "Message"
          ("id", "orgId", "contactId", "direction", "body", "idempotencyKey")
        VALUES
          (${rowId("message_foreign_contact")}, ${orgAId}, ${contactBId}, 'OUTBOUND', 'forged',
           ${rowId("message_foreign_contact_key")})
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "Message"
          ("id", "orgId", "conversationId", "direction", "body", "idempotencyKey")
        VALUES
          (${rowId("message_foreign_conversation")}, ${orgAId}, ${conversationBId}, 'OUTBOUND', 'forged',
           ${rowId("message_foreign_conversation_key")})
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "Message"
          ("id", "orgId", "campaignId", "direction", "body", "idempotencyKey")
        VALUES
          (${rowId("message_foreign_campaign")}, ${orgAId}, ${campaignBId}, 'OUTBOUND', 'forged',
           ${rowId("message_foreign_campaign_key")})
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "InternalNote" ("id", "orgId", "conversationId", "authorUserId", "body")
        VALUES (${rowId("note_foreign_conversation")}, ${orgAId}, ${conversationBId}, ${userAId}, 'forged')
      `),
      "23503"
    );
  });

  it("binds sessions and live assignees to a membership and applies membership-delete actions", async () => {
    const liveUser = await prisma.appUser.create({
      data: {
        email: `relation-live-${suffix}@example.test`,
        normalizedEmail: `relation-live-${suffix}@example.test`
      }
    });
    await prisma.membership.create({
      data: { orgId: orgAId, userId: liveUser.id, role: MembershipRole.MEMBER }
    });

    const sessionId = rowId("session_same_membership");
    const assignedConversationId = rowId("conversation_same_assignee");
    await expect(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "AuthSession"
          ("id", "tokenHash", "userId", "orgId", "authVersion", "idleExpiresAt", "absoluteExpiresAt")
        VALUES
          (${sessionId}, ${bearerHash("session_same_membership")}, ${liveUser.id}, ${orgAId},
           ${liveUser.authVersion}, ${future}, ${future})
      `)
    ).resolves.toBe(1);
    await expect(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "Conversation"
          ("id", "orgId", "contactId", "assignedToUserId", "assignedAt", "updatedAt")
        VALUES
          (${assignedConversationId}, ${orgAId}, ${contactAId}, ${liveUser.id}, NOW(), NOW())
      `)
    ).resolves.toBe(1);

    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "AuthSession"
          ("id", "tokenHash", "userId", "orgId", "authVersion", "idleExpiresAt", "absoluteExpiresAt")
        VALUES
          (${rowId("session_foreign_membership")}, ${bearerHash("session_foreign_membership")},
           ${userBId}, ${orgAId}, 1, ${future}, ${future})
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        UPDATE "Conversation"
        SET "assignedToUserId" = ${userBId}
        WHERE "id" = ${assignedConversationId}
      `),
      "23503"
    );

    await prisma.membership.delete({
      where: { orgId_userId: { orgId: orgAId, userId: liveUser.id } }
    });
    await expect(prisma.authSession.findUnique({ where: { id: sessionId } })).resolves.toBeNull();
    await expect(
      prisma.conversation.findUnique({
        where: { id: assignedConversationId },
        select: { assignedToUserId: true }
      })
    ).resolves.toEqual({ assignedToUserId: null });
  });

  it("nulls only nullable child IDs when a same-tenant parent is deleted", async () => {
    const contact = await prisma.contact.create({
      data: { orgId: orgAId, phone: `+1777${suffix.slice(0, 7)}01` }
    });
    const template = await prisma.messageTemplate.create({
      data: {
        orgId: orgAId,
        name: `Delete action template ${suffix}`,
        body: "delete action",
        variables: {}
      }
    });
    const campaign = await prisma.campaign.create({
      data: {
        orgId: orgAId,
        templateId: template.id,
        name: `Delete action campaign ${suffix}`,
        body: "delete action"
      }
    });
    const conversation = await prisma.conversation.create({
      data: { orgId: orgAId, contactId: contact.id }
    });
    const message = await prisma.message.create({
      data: {
        orgId: orgAId,
        contactId: contact.id,
        conversationId: conversation.id,
        campaignId: campaign.id,
        direction: "OUTBOUND",
        body: "delete action",
        idempotencyKey: rowId("delete_action_message")
      }
    });

    await prisma.messageTemplate.delete({ where: { id: template.id } });
    await expect(
      prisma.campaign.findUnique({ where: { id: campaign.id }, select: { orgId: true, templateId: true } })
    ).resolves.toEqual({ orgId: orgAId, templateId: null });

    await prisma.contact.delete({ where: { id: contact.id } });
    await expect(
      prisma.conversation.findUnique({
        where: { id: conversation.id },
        select: { orgId: true, contactId: true }
      })
    ).resolves.toEqual({ orgId: orgAId, contactId: null });
    await expect(
      prisma.message.findUnique({
        where: { id: message.id },
        select: { orgId: true, contactId: true }
      })
    ).resolves.toEqual({ orgId: orgAId, contactId: null });

    await prisma.conversation.delete({ where: { id: conversation.id } });
    await prisma.campaign.delete({ where: { id: campaign.id } });
    await expect(
      prisma.message.findUnique({
        where: { id: message.id },
        select: { orgId: true, conversationId: true, campaignId: true }
      })
    ).resolves.toEqual({ orgId: orgAId, conversationId: null, campaignId: null });
  });

  it("requires queue campaign identity in both columns and the JSON payload", async () => {
    const scheduledAt = new Date("2029-01-01T00:00:00.000Z");
    const validPayload = {
      version: 1,
      orgId: orgAId,
      campaignId: campaignAId,
      scheduledAt: scheduledAt.toISOString()
    };

    await expect(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "QueueJob"
          ("id", "orgId", "campaignId", "type", "idempotencyKey", "payload", "runAt", "updatedAt")
        VALUES
          (${rowId("queue_same")}, ${orgAId}, ${campaignAId}, 'SCHEDULED_CAMPAIGN',
           ${rowId("queue_same_key")}, ${JSON.stringify(validPayload)}::jsonb, ${scheduledAt}, NOW())
      `)
    ).resolves.toBe(1);

    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "QueueJob"
          ("id", "orgId", "campaignId", "type", "idempotencyKey", "payload", "runAt", "updatedAt")
        VALUES
          (${rowId("queue_foreign_campaign")}, ${orgAId}, ${campaignBId}, 'SCHEDULED_CAMPAIGN',
           ${rowId("queue_foreign_campaign_key")},
           ${JSON.stringify({ ...validPayload, campaignId: campaignBId })}::jsonb, ${scheduledAt}, NOW())
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "QueueJob"
          ("id", "orgId", "campaignId", "type", "idempotencyKey", "payload", "runAt", "updatedAt")
        VALUES
          (${rowId("queue_missing_campaign")}, ${orgAId}, NULL, 'SCHEDULED_CAMPAIGN',
           ${rowId("queue_missing_campaign_key")}, ${JSON.stringify(validPayload)}::jsonb, ${scheduledAt}, NOW())
      `),
      "23514"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "QueueJob"
          ("id", "orgId", "campaignId", "type", "idempotencyKey", "payload", "runAt", "updatedAt")
        VALUES
          (${rowId("queue_non_object_payload")}, ${orgAId}, ${campaignAId}, 'SCHEDULED_CAMPAIGN',
           ${rowId("queue_non_object_payload_key")}, '[]'::jsonb, ${scheduledAt}, NOW())
      `),
      "23514"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "QueueJob"
          ("id", "orgId", "campaignId", "type", "idempotencyKey", "payload", "runAt", "updatedAt")
        VALUES
          (${rowId("queue_wrong_payload_org")}, ${orgAId}, ${campaignAId}, 'SCHEDULED_CAMPAIGN',
           ${rowId("queue_wrong_payload_org_key")},
           ${JSON.stringify({ ...validPayload, orgId: orgBId })}::jsonb, ${scheduledAt}, NOW())
      `),
      "23514"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "QueueJob"
          ("id", "orgId", "campaignId", "type", "idempotencyKey", "payload", "runAt", "updatedAt")
        VALUES
          (${rowId("queue_wrong_payload_campaign")}, ${orgAId}, ${campaignAId}, 'SCHEDULED_CAMPAIGN',
           ${rowId("queue_wrong_payload_campaign_key")},
           ${JSON.stringify({ ...validPayload, campaignId: campaignBId })}::jsonb, ${scheduledAt}, NOW())
      `),
      "23514"
    );
  });

  it("makes provider message IDs unique within, but reusable across, tenants", async () => {
    const providerMessageId = `provider-${suffix}`;

    await expect(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "Message"
          ("id", "orgId", "direction", "body", "providerMessageId", "idempotencyKey")
        VALUES
          (${rowId("provider_message_a")}, ${orgAId}, 'INBOUND', 'first', ${providerMessageId},
           ${rowId("provider_message_a_key")})
      `)
    ).resolves.toBe(1);
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "Message"
          ("id", "orgId", "direction", "body", "providerMessageId", "idempotencyKey")
        VALUES
          (${rowId("provider_message_duplicate")}, ${orgAId}, 'INBOUND', 'duplicate', ${providerMessageId},
           ${rowId("provider_message_duplicate_key")})
      `),
      "23505"
    );
    await expect(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "Message"
          ("id", "orgId", "direction", "body", "providerMessageId", "idempotencyKey")
        VALUES
          (${rowId("provider_message_b")}, ${orgBId}, 'INBOUND', 'other tenant', ${providerMessageId},
           ${rowId("provider_message_b_key")})
      `)
    ).resolves.toBe(1);
  });

  it("validates every typed audit subject in the event tenant and keeps the audit after subject deletion", async () => {
    const [membershipA, membershipB, complianceA, complianceB, phoneA, phoneB] = await Promise.all([
      prisma.membership.findUniqueOrThrow({
        where: { orgId_userId: { orgId: orgAId, userId: userAId } }
      }),
      prisma.membership.findUniqueOrThrow({
        where: { orgId_userId: { orgId: orgBId, userId: userBId } }
      }),
      prisma.complianceProfile.create({ data: { orgId: orgAId } }),
      prisma.complianceProfile.create({ data: { orgId: orgBId } }),
      prisma.providerPhoneNumber.create({
        data: {
          orgId: orgAId,
          phoneNumber: `+1666${suffix.slice(0, 7)}01`,
          provider: `audit-${suffix}`,
          capabilities: {}
        }
      }),
      prisma.providerPhoneNumber.create({
        data: {
          orgId: orgBId,
          phoneNumber: `+1666${suffix.slice(0, 7)}02`,
          provider: `audit-${suffix}`,
          capabilities: {}
        }
      })
    ]);

    const sessionAId = rowId("audit_subject_session_a");
    const sessionBId = rowId("audit_subject_session_b");
    const tokenAId = rowId("audit_subject_token_a");
    const tokenBId = rowId("audit_subject_token_b");
    const messageAId = rowId("audit_subject_message_a");
    const messageBId = rowId("audit_subject_message_b");
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "AuthSession"
        ("id", "tokenHash", "userId", "orgId", "authVersion", "idleExpiresAt", "absoluteExpiresAt")
      VALUES
        (${sessionAId}, ${bearerHash("audit_subject_session_a")}, ${userAId}, ${orgAId}, 1, ${future}, ${future}),
        (${sessionBId}, ${bearerHash("audit_subject_session_b")}, ${userBId}, ${orgBId}, 1, ${future}, ${future})
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "AuthToken"
        ("id", "type", "tokenHash", "orgId", "email", "role", "issuedByUserId", "expiresAt")
      VALUES
        (${tokenAId}, 'INVITE', ${bearerHash("audit_subject_token_a")}, ${orgAId},
         ${`audit-token-a-${suffix}@example.test`}, 'MEMBER', ${userAId}, ${future}),
        (${tokenBId}, 'INVITE', ${bearerHash("audit_subject_token_b")}, ${orgBId},
         ${`audit-token-b-${suffix}@example.test`}, 'MEMBER', ${userBId}, ${future})
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "Message"
        ("id", "orgId", "direction", "body", "idempotencyKey")
      VALUES
        (${messageAId}, ${orgAId}, 'OUTBOUND', 'audit subject A', ${rowId("audit_subject_message_a_key")}),
        (${messageBId}, ${orgBId}, 'OUTBOUND', 'audit subject B', ${rowId("audit_subject_message_b_key")})
    `);

    const subjects = [
      { type: "Organization", sameId: orgAId, foreignId: orgBId },
      { type: "AppUser", sameId: userAId, foreignId: userBId },
      { type: "AuthSession", sameId: sessionAId, foreignId: sessionBId },
      { type: "AuthToken", sameId: tokenAId, foreignId: tokenBId },
      { type: "Membership", sameId: membershipA.id, foreignId: membershipB.id },
      { type: "ComplianceProfile", sameId: complianceA.id, foreignId: complianceB.id },
      { type: "ProviderPhoneNumber", sameId: phoneA.id, foreignId: phoneB.id },
      {
        type: "ProviderCredential",
        sameId: providerCredentialAId,
        foreignId: providerCredentialBId
      },
      { type: "Message", sameId: messageAId, foreignId: messageBId }
    ] as const;

    for (const subject of subjects) {
      await expect(
        prisma.$executeRaw(Prisma.sql`
          INSERT INTO "LiveReadinessAuditEvent"
            ("id", "orgId", "actorUserId", "action", "subjectType", "subjectId")
          VALUES
            (${rowId(`audit_subject_same_${subject.type}`)}, ${orgAId}, ${userAId},
             'RELATION_SUBJECT_TESTED', ${subject.type}, ${subject.sameId})
        `)
      ).resolves.toBe(1);
      await expectSqlState(
        prisma.$executeRaw(Prisma.sql`
          INSERT INTO "LiveReadinessAuditEvent"
            ("id", "orgId", "actorUserId", "action", "subjectType", "subjectId")
          VALUES
            (${rowId(`audit_subject_foreign_${subject.type}`)}, ${orgAId}, ${userAId},
             'RELATION_SUBJECT_TESTED', ${subject.type}, ${subject.foreignId})
        `),
        "23503"
      );
    }

    await prisma.providerPhoneNumber.delete({ where: { id: phoneA.id } });
    await expect(
      prisma.liveReadinessAuditEvent.count({
        where: { id: rowId("audit_subject_same_ProviderPhoneNumber") }
      })
    ).resolves.toBe(1);
  });

  it("validates historical actors at write time without erasing history on membership deletion", async () => {
    const historyUser = await prisma.appUser.create({
      data: {
        email: `relation-history-${suffix}@example.test`,
        normalizedEmail: `relation-history-${suffix}@example.test`
      }
    });
    await prisma.membership.create({
      data: { orgId: orgAId, userId: historyUser.id, role: MembershipRole.MEMBER }
    });
    const historyProvider = `history-${suffix}`;
    const historyCredential = await prisma.providerCredential.create({
      data: { orgId: orgAId, provider: historyProvider }
    });

    const noteId = rowId("history_note");
    const rotationId = rowId("history_rotation");
    const auditId = rowId("history_audit");
    await expect(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "InternalNote" ("id", "orgId", "conversationId", "authorUserId", "body")
        VALUES (${noteId}, ${orgAId}, ${conversationAId}, ${historyUser.id}, 'history')
      `)
    ).resolves.toBe(1);
    await expect(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "ProviderCredentialRotation"
          ("id", "orgId", "provider", "providerCredentialId", "action", "actorUserId")
        VALUES
          (${rotationId}, ${orgAId}, ${historyProvider}, ${historyCredential.id}, 'TESTED', ${historyUser.id})
      `)
    ).resolves.toBe(1);
    await expect(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "LiveReadinessAuditEvent"
          ("id", "orgId", "actorUserId", "action", "subjectType", "subjectId")
        VALUES (${auditId}, ${orgAId}, ${historyUser.id}, 'TESTED', 'AppUser', ${historyUser.id})
      `)
    ).resolves.toBe(1);

    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "InternalNote" ("id", "orgId", "conversationId", "authorUserId", "body")
        VALUES (${rowId("history_note_foreign_actor")}, ${orgAId}, ${conversationAId}, ${userBId}, 'forged')
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "ProviderCredentialRotation"
          ("id", "orgId", "provider", "action", "actorUserId")
        VALUES (${rowId("history_rotation_foreign_actor")}, ${orgAId}, 'twilio', 'TESTED', ${userBId})
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "ProviderCredentialRotation"
          ("id", "orgId", "provider", "providerCredentialId", "action", "actorUserId")
        VALUES
          (${rowId("history_rotation_foreign_credential")}, ${orgAId}, ${`fixture-${suffix}`},
           ${providerCredentialBId}, 'TESTED', ${historyUser.id})
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "ProviderCredentialRotation"
          ("id", "orgId", "provider", "providerCredentialId", "action", "actorUserId")
        VALUES
          (${rowId("history_rotation_wrong_provider")}, ${orgAId}, 'wrong-provider',
           ${historyCredential.id}, 'TESTED', ${historyUser.id})
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "LiveReadinessAuditEvent"
          ("id", "orgId", "actorUserId", "action", "subjectType", "subjectId")
        VALUES
          (${rowId("history_audit_foreign_actor")}, ${orgAId}, ${userBId}, 'TESTED', 'AppUser', ${historyUser.id})
      `),
      "23503"
    );

    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        UPDATE "InternalNote"
        SET "authorUserId" = ${userBId}
        WHERE "id" = ${noteId}
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        UPDATE "ProviderCredentialRotation"
        SET "actorUserId" = ${userBId}
        WHERE "id" = ${rotationId}
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        UPDATE "ProviderCredentialRotation"
        SET "provider" = 'wrong-provider'
        WHERE "id" = ${rotationId}
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        UPDATE "LiveReadinessAuditEvent"
        SET "actorUserId" = ${userBId}
        WHERE "id" = ${auditId}
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        UPDATE "LiveReadinessAuditEvent"
        SET "subjectId" = ${userBId}
        WHERE "id" = ${auditId}
      `),
      "23503"
    );

    await prisma.membership.delete({
      where: { orgId_userId: { orgId: orgAId, userId: historyUser.id } }
    });
    await prisma.providerCredential.delete({ where: { id: historyCredential.id } });
    const [noteCount, rotationCount, auditCount] = await Promise.all([
      prisma.internalNote.count({ where: { id: noteId } }),
      prisma.providerCredentialRotation.count({ where: { id: rotationId } }),
      prisma.liveReadinessAuditEvent.count({ where: { id: auditId } })
    ]);
    expect([noteCount, rotationCount, auditCount]).toEqual([1, 1, 1]);
  });

  it("validates invite issuer and accepted subject memberships while retaining consumed history", async () => {
    const subject = await prisma.appUser.create({
      data: {
        email: `relation-invite-subject-${suffix}@example.test`,
        normalizedEmail: `relation-invite-subject-${suffix}@example.test`
      }
    });
    await prisma.membership.create({
      data: { orgId: orgAId, userId: subject.id, role: MembershipRole.MEMBER }
    });

    const pendingInviteId = rowId("invite_same_issuer");
    const consumedInviteId = rowId("invite_same_subject");
    await expect(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "AuthToken"
          ("id", "type", "tokenHash", "orgId", "email", "role", "issuedByUserId", "expiresAt")
        VALUES
          (${pendingInviteId}, 'INVITE', ${bearerHash("invite_same_issuer")}, ${orgAId},
           ${`invite-${suffix}@example.test`}, 'MEMBER', ${userAId}, ${future})
      `)
    ).resolves.toBe(1);
    await expect(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "AuthToken"
          ("id", "type", "tokenHash", "userId", "orgId", "email", "role", "issuedByUserId",
           "expiresAt", "consumedAt")
        VALUES
          (${consumedInviteId}, 'INVITE', ${bearerHash("invite_same_subject")}, ${subject.id}, ${orgAId},
           ${subject.normalizedEmail}, 'MEMBER', ${userAId}, ${future}, NOW())
      `)
    ).resolves.toBe(1);

    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "AuthToken"
          ("id", "type", "tokenHash", "orgId", "email", "role", "issuedByUserId", "expiresAt")
        VALUES
          (${rowId("invite_foreign_issuer")}, 'INVITE', ${bearerHash("invite_foreign_issuer")}, ${orgAId},
           ${`foreign-issuer-${suffix}@example.test`}, 'MEMBER', ${userBId}, ${future})
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "AuthToken"
          ("id", "type", "tokenHash", "userId", "orgId", "email", "role", "issuedByUserId",
           "expiresAt", "consumedAt")
        VALUES
          (${rowId("invite_foreign_subject")}, 'INVITE', ${bearerHash("invite_foreign_subject")},
           ${userBId}, ${orgAId}, ${`foreign-subject-${suffix}@example.test`}, 'MEMBER', ${userAId},
           ${future}, NOW())
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        UPDATE "AuthToken"
        SET "issuedByUserId" = ${userBId}
        WHERE "id" = ${pendingInviteId}
      `),
      "23503"
    );
    await expectSqlState(
      prisma.$executeRaw(Prisma.sql`
        UPDATE "AuthToken"
        SET "userId" = ${userBId}
        WHERE "id" = ${consumedInviteId}
      `),
      "23503"
    );

    await prisma.membership.delete({
      where: { orgId_userId: { orgId: orgAId, userId: subject.id } }
    });
    await expect(
      prisma.authToken.findUnique({
        where: { id: consumedInviteId },
        select: { userId: true, consumedAt: true }
      })
    ).resolves.toMatchObject({ userId: subject.id, consumedAt: expect.any(Date) });
  });
});
