import {
  A2pRegistrationStatus,
  BillingAccountStatus,
  ConsentStatus,
  ConversationStatus,
  MembershipRole,
  MembershipStatus,
  UsageEventType
} from "@prisma/client";
import { prisma } from "../lib/db/prisma";

async function main() {
  const user = await prisma.appUser.upsert({
    where: { clerkUserId: "demo_user_signalstack" },
    update: {
      email: "owner@signalstack.example",
      displayName: "Demo Owner"
    },
    create: {
      clerkUserId: "demo_user_signalstack",
      email: "owner@signalstack.example",
      displayName: "Demo Owner"
    }
  });

  const org = await prisma.organization.upsert({
    where: { slug: "demo-signalstack" },
    update: {
      name: "SignalStack Demo Co",
      demoMode: true
    },
    create: {
      slug: "demo-signalstack",
      name: "SignalStack Demo Co",
      demoMode: true
    }
  });

  await prisma.membership.upsert({
    where: {
      orgId_userId: {
        orgId: org.id,
        userId: user.id
      }
    },
    update: {
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE
    },
    create: {
      orgId: org.id,
      userId: user.id,
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE
    }
  });

  const leadsList = await prisma.contactList.upsert({
    where: { orgId_name: { orgId: org.id, name: "Demo Leads" } },
    update: {},
    create: { orgId: org.id, name: "Demo Leads", description: "Seeded demo-safe contacts." }
  });

  const vipTag = await prisma.tag.upsert({
    where: { orgId_name: { orgId: org.id, name: "vip" } },
    update: {},
    create: { orgId: org.id, name: "vip", color: "#2563eb" }
  });

  const contact = await prisma.contact.upsert({
    where: { orgId_phone: { orgId: org.id, phone: "+15555550100" } },
    update: {
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      displayName: "Ada Lovelace",
      consentStatus: ConsentStatus.OPTED_IN,
      optInSource: "demo_seed",
      optInAt: new Date("2026-01-01T00:00:00.000Z"),
      source: "demo_seed"
    },
    create: {
      orgId: org.id,
      phone: "+15555550100",
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      displayName: "Ada Lovelace",
      consentStatus: ConsentStatus.OPTED_IN,
      optInSource: "demo_seed",
      optInAt: new Date("2026-01-01T00:00:00.000Z"),
      source: "demo_seed"
    }
  });

  await prisma.contactTag.upsert({
    where: { contactId_tagId: { contactId: contact.id, tagId: vipTag.id } },
    update: {},
    create: { orgId: org.id, contactId: contact.id, tagId: vipTag.id }
  });

  await prisma.contactListMember.upsert({
    where: { listId_contactId: { listId: leadsList.id, contactId: contact.id } },
    update: {},
    create: { orgId: org.id, listId: leadsList.id, contactId: contact.id }
  });

  await prisma.segment.upsert({
    where: { orgId_name: { orgId: org.id, name: "Opted-in demo leads" } },
    update: {
      definition: { consentStatus: ConsentStatus.OPTED_IN, listName: leadsList.name }
    },
    create: {
      orgId: org.id,
      name: "Opted-in demo leads",
      description: "Demo-safe opted-in contacts.",
      definition: { consentStatus: ConsentStatus.OPTED_IN, listName: leadsList.name }
    }
  });

  const template = await prisma.messageTemplate.upsert({
    where: { orgId_name: { orgId: org.id, name: "Demo intro" } },
    update: {
      body: "Hi {{firstName}}, this is SignalStack Demo Co. Reply STOP to opt out.",
      variables: ["firstName"]
    },
    create: {
      orgId: org.id,
      name: "Demo intro",
      body: "Hi {{firstName}}, this is SignalStack Demo Co. Reply STOP to opt out.",
      variables: ["firstName"]
    }
  });

  const campaign = await prisma.campaign.upsert({
    where: { id: "demo_campaign_intro" },
    update: {
      orgId: org.id,
      templateId: template.id,
      name: "Demo intro campaign",
      body: template.body
    },
    create: {
      id: "demo_campaign_intro",
      orgId: org.id,
      templateId: template.id,
      name: "Demo intro campaign",
      body: template.body
    }
  });

  await prisma.campaignRecipient.upsert({
    where: { campaignId_contactId: { campaignId: campaign.id, contactId: contact.id } },
    update: {},
    create: { orgId: org.id, campaignId: campaign.id, contactId: contact.id }
  });

  const conversation = await prisma.conversation.upsert({
    where: { id: "demo_conversation_ada" },
    update: {
      orgId: org.id,
      contactId: contact.id,
      assignedToUserId: user.id,
      status: ConversationStatus.OPEN,
      lastMessageAt: new Date("2026-01-03T10:00:00.000Z"),
      assignedAt: new Date("2026-01-03T10:05:00.000Z"),
      resolvedAt: null
    },
    create: {
      id: "demo_conversation_ada",
      orgId: org.id,
      contactId: contact.id,
      assignedToUserId: user.id,
      status: ConversationStatus.OPEN,
      lastMessageAt: new Date("2026-01-03T10:00:00.000Z"),
      assignedAt: new Date("2026-01-03T10:05:00.000Z")
    }
  });

  await prisma.message.upsert({
    where: { idempotencyKey: "demo-seed-inbound-ada-1" },
    update: {},
    create: {
      orgId: org.id,
      contactId: contact.id,
      conversationId: conversation.id,
      direction: "INBOUND",
      body: "Can you send pricing?",
      providerMessageId: "demo_provider_message_ada_1",
      idempotencyKey: "demo-seed-inbound-ada-1",
      createdAt: new Date("2026-01-03T10:00:00.000Z")
    }
  });

  await prisma.internalNote.upsert({
    where: { id: "demo_note_ada_1" },
    update: {
      body: "Demo note: Ada is interested in SMB launch pricing."
    },
    create: {
      id: "demo_note_ada_1",
      orgId: org.id,
      conversationId: conversation.id,
      authorUserId: user.id,
      body: "Demo note: Ada is interested in SMB launch pricing."
    }
  });

  await prisma.complianceProfile.upsert({
    where: { orgId: org.id },
    update: {
      businessName: "SignalStack Demo Co",
      messagingUseCase: "Demo-only marketing and shared inbox workflows.",
      optInDescription: "Contacts are seeded with explicit demo consent and can reply STOP to opt out.",
      privacyPolicyUrl: "https://example.com/privacy",
      termsOfServiceUrl: "https://example.com/terms",
      a2pRegistrationStatus: A2pRegistrationStatus.NOT_STARTED
    },
    create: {
      orgId: org.id,
      businessName: "SignalStack Demo Co",
      messagingUseCase: "Demo-only marketing and shared inbox workflows.",
      optInDescription: "Contacts are seeded with explicit demo consent and can reply STOP to opt out.",
      privacyPolicyUrl: "https://example.com/privacy",
      termsOfServiceUrl: "https://example.com/terms",
      a2pRegistrationStatus: A2pRegistrationStatus.NOT_STARTED
    }
  });

  await prisma.billingAccount.upsert({
    where: { orgId: org.id },
    update: {
      status: BillingAccountStatus.DEMO,
      liveBillingEnabled: false,
      stripeCustomerId: null,
      stripeSubscriptionId: null
    },
    create: {
      orgId: org.id,
      status: BillingAccountStatus.DEMO,
      liveBillingEnabled: false
    }
  });

  await prisma.usageEvent.upsert({
    where: { id: "demo_usage_contact_imported" },
    update: { quantity: 1, metadata: { source: "demo_seed" } },
    create: {
      id: "demo_usage_contact_imported",
      orgId: org.id,
      type: UsageEventType.CONTACT_IMPORTED,
      quantity: 1,
      metadata: { source: "demo_seed" }
    }
  });

  await prisma.usageEvent.upsert({
    where: { id: "demo_usage_message_inbound" },
    update: { quantity: 1, metadata: { source: "demo_seed" } },
    create: {
      id: "demo_usage_message_inbound",
      orgId: org.id,
      type: UsageEventType.MESSAGE_INBOUND,
      quantity: 1,
      metadata: { source: "demo_seed" }
    }
  });

  await prisma.usageEvent.upsert({
    where: { id: "demo_usage_ai_request" },
    update: { quantity: 2, metadata: { source: "demo_seed", provider: "fake" } },
    create: {
      id: "demo_usage_ai_request",
      orgId: org.id,
      type: UsageEventType.AI_REQUEST,
      quantity: 2,
      metadata: { source: "demo_seed", provider: "fake" }
    }
  });

  console.log(
    `Seeded demo organization ${org.slug} for ${user.email} with ${MembershipRole.OWNER} role.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
