import { MembershipRole, MembershipStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CurrentOrg } from "@/lib/auth/current-org";

// TICKET009 — gated session-provider seam. The deterministic demo session (`getDemoSession` +
// `getOrCreateCurrentOrg`) remains the default and only ENABLED auth mode. This seam adds the production
// resolution path (a server-verified subject -> active local membership -> org/role) behind
// `PRODUCTION_AUTH_ENABLED`. It is OFF by default, makes no Clerk calls, and introduces no secrets.
// Fail closed: no verified subject, or no ACTIVE membership, resolves to null (the caller must deny —
// never silently downgrade to the demo session). Enabling it (binding a verified Clerk subject + deny
// responses + expanding the production gate for Clerk keys) is the human-gated step in
// docs/PRODUCTION_AUTH_RBAC.md.

export function productionAuthIsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.PRODUCTION_AUTH_ENABLED === "true";
}

export function clerkConfigIsPresent(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.CLERK_SECRET_KEY && env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

// A server-verified identity from the auth provider. The binding to Clerk's server-side `auth()` is
// intentionally not wired in this slice (enablement is human-gated); callers/tests supply the subject.
export type ProductionAuthSubject = {
  clerkUserId: string;
  clerkOrgId?: string | null;
};

export type MembershipResolution = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  demoMode: boolean;
  userId: string;
  email: string;
  role: MembershipRole;
};

export type MembershipResolver = (subject: ProductionAuthSubject) => Promise<MembershipResolution | null>;

// Default resolver: map a verified subject to its ACTIVE local membership (optionally scoped to a
// specific Clerk org). Returns null when the user or an active membership is absent (fail closed).
export const resolveActiveMembershipFromDb: MembershipResolver = async (subject) => {
  const user = await prisma.appUser.findUnique({ where: { clerkUserId: subject.clerkUserId } });
  if (!user) {
    return null;
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId: user.id,
      status: MembershipStatus.ACTIVE,
      ...(subject.clerkOrgId ? { org: { clerkOrgId: subject.clerkOrgId } } : {})
    },
    include: { org: true }
  });
  if (!membership) {
    return null;
  }

  return {
    orgId: membership.org.id,
    orgSlug: membership.org.slug,
    orgName: membership.org.name,
    demoMode: membership.org.demoMode,
    userId: user.id,
    email: user.email,
    role: membership.role
  };
};

// Resolve the current org/role from a verified production subject, or null (fail closed). Never falls
// back to the demo session — a null result must be denied by the caller, not silently downgraded.
export async function resolveProductionCurrentOrg(
  subject: ProductionAuthSubject | null,
  resolver: MembershipResolver = resolveActiveMembershipFromDb
): Promise<CurrentOrg | null> {
  if (!subject || !subject.clerkUserId) {
    return null;
  }

  const resolution = await resolver(subject);
  if (!resolution) {
    return null;
  }

  return {
    orgId: resolution.orgId,
    orgSlug: resolution.orgSlug,
    orgName: resolution.orgName,
    userId: resolution.userId,
    email: resolution.email,
    role: resolution.role,
    demoMode: resolution.demoMode
  };
}
