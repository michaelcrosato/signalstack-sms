import { MembershipRole, MembershipStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getDemoSession } from "@/lib/auth/demo-session";
import { productionAuthIsEnabled, resolveProductionCurrentOrg } from "@/lib/auth/session";

export type CurrentOrg = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  userId: string;
  email: string;
  role: MembershipRole;
  demoMode: boolean;
};

export async function getOrCreateCurrentOrg(): Promise<CurrentOrg> {
  if (productionAuthIsEnabled()) {
    const resolved = await resolveProductionCurrentOrg();
    if (!resolved) {
      throw new Error("Forbidden - No active membership");
    }
    return resolved;
  }

  const session = getDemoSession();

  const user = await prisma.appUser.upsert({
    where: { clerkUserId: session.clerkUserId },
    update: {
      email: session.email,
      displayName: session.displayName
    },
    create: {
      clerkUserId: session.clerkUserId,
      email: session.email,
      displayName: session.displayName
    }
  });

  const org = await prisma.organization.upsert({
    where: { slug: session.orgSlug },
    update: {
      name: session.orgName,
      demoMode: true
    },
    create: {
      slug: session.orgSlug,
      name: session.orgName,
      demoMode: true
    }
  });

  const membership = await prisma.membership.upsert({
    where: {
      orgId_userId: {
        orgId: org.id,
        userId: user.id
      }
    },
    update: {
      role: session.role,
      status: MembershipStatus.ACTIVE
    },
    create: {
      orgId: org.id,
      userId: user.id,
      role: session.role,
      status: MembershipStatus.ACTIVE
    }
  });

  return {
    orgId: org.id,
    orgSlug: org.slug,
    orgName: org.name,
    userId: user.id,
    email: user.email,
    role: membership.role,
    demoMode: org.demoMode
  };
}
