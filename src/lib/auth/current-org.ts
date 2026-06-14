import { type MembershipRole, MembershipStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getDemoSession } from "@/lib/auth/demo-session";
import { headers } from "next/headers";
import { productionAuthIsEnabled, resolveProductionCurrentOrg } from "./session";
import { verifyClerkToken } from "./clerk-verifier";

export type CurrentOrg = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  userId: string;
  email: string;
  role: MembershipRole;
  demoMode: boolean;
};

export async function getOrCreateCurrentOrg(request?: Request): Promise<CurrentOrg> {
  if (productionAuthIsEnabled()) {
    let token: string | null = null;

    if (request) {
      const authHeader = request.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      } else {
        const cookieHeader = request.headers.get("cookie");
        if (cookieHeader) {
          const match = cookieHeader.match(/(?:^|;)\s*__session\s*=\s*([^;]+)/);
          if (match) {
            token = match[1];
          }
        }
      }
    } else {
      try {
        const headersList = await headers();
        const authHeader = headersList.get("authorization");
        if (authHeader?.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        } else {
          const cookieHeader = headersList.get("cookie");
          if (cookieHeader) {
            const match = cookieHeader.match(/(?:^|;)\s*__session\s*=\s*([^;]+)/);
            if (match) {
              token = match[1];
            }
          }
        }
      } catch {
        // Fallback or ignore if called outside of request context
      }
    }

    if (!token) {
      throw new Error("Unauthorized: Missing token.");
    }

    const subject = await verifyClerkToken(token);
    const currentOrg = await resolveProductionCurrentOrg(subject);
    if (!currentOrg) {
      throw new Error("Forbidden: Inactive or missing membership.");
    }
    return currentOrg;
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
