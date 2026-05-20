import { ConsentStatus, MembershipRole, MembershipStatus } from "@prisma/client";
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
