import { MembershipRole, MembershipStatus } from "@prisma/client";
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
