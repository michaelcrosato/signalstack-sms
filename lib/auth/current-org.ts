import { MembershipRole, MembershipStatus } from "@prisma/client";
import { headers } from "next/headers";
import { normalizeEmail } from "@/lib/auth/crypto";
import { getDemoSession } from "@/lib/auth/demo-session";
import {
  resolveLocalSession,
  type ResolvedLocalSession
} from "@/lib/auth/local-session";
import { readLocalSessionToken } from "@/lib/auth/session-cookie";
import {
  setAuthTransactionContext,
  withAuthDatabaseContext
} from "@/lib/db/tenant-context";
import { getRuntimeConfig, type RuntimeConfig } from "@/lib/env/runtime-config";

export type CurrentOrg = Readonly<{
  orgId: string;
  orgSlug: string;
  orgName: string;
  userId: string;
  email: string;
  role: MembershipRole;
  demoMode: boolean;
}>;

export type CurrentOrgAuthErrorCode = "AUTH_REQUIRED" | "AUTH_PROVIDER_UNAVAILABLE";

/**
 * A stable, secret-free authentication denial raised by the request-scoped organization resolver.
 * Callers may translate AUTH_REQUIRED to 401/login and AUTH_PROVIDER_UNAVAILABLE to a configuration
 * error without inspecting database or bearer-token details.
 */
export class CurrentOrgAuthError extends Error {
  readonly code: CurrentOrgAuthErrorCode;
  readonly statusCode: 401 | 503;

  constructor(code: CurrentOrgAuthErrorCode) {
    super(code === "AUTH_REQUIRED" ? "Authentication required." : "Authentication provider unavailable.");
    this.name = "CurrentOrgAuthError";
    this.code = code;
    this.statusCode = code === "AUTH_REQUIRED" ? 401 : 503;
  }
}

export type CurrentOrgAuthContext = Readonly<{
  mode: RuntimeConfig["auth"]["mode"];
  secureCookie: boolean;
}>;

export type CurrentOrgRuntimeConfig = Readonly<{
  auth: Pick<RuntimeConfig["auth"], "mode">;
  runtime: Pick<RuntimeConfig["runtime"], "environment">;
}>;

type CurrentOrgRequest = Pick<Request, "headers">;

export type CurrentOrgResolverDependencies = Readonly<{
  getAuthContext: () => CurrentOrgAuthContext;
  readRequestHeaders: () => Promise<Headers>;
  readSessionToken: (
    request: CurrentOrgRequest,
    options: Readonly<{ secure: boolean }>
  ) => string | null;
  resolveSession: (rawToken: string) => Promise<ResolvedLocalSession | null>;
  resolveDemoCurrentOrg: () => Promise<CurrentOrg>;
}>;

const defaultCurrentOrgResolverDependencies: CurrentOrgResolverDependencies = {
  getAuthContext() {
    return currentOrgAuthContextFromRuntime(getRuntimeConfig());
  },
  readRequestHeaders: headers,
  readSessionToken: readLocalSessionToken,
  resolveSession: resolveLocalSession,
  resolveDemoCurrentOrg
};

export function currentOrgAuthContextFromRuntime(
  config: CurrentOrgRuntimeConfig
): CurrentOrgAuthContext {
  return Object.freeze({
    mode: config.auth.mode,
    secureCookie: config.runtime.environment === "production"
  });
}

/**
 * Resolve the request's current organization according to the explicit runtime auth mode.
 *
 * The optional dependency seam is intentionally whole-object: production callers use the defaults,
 * while focused tests can supply request evidence without mutating process-wide Next.js state.
 */
export async function resolveCurrentOrg(
  dependencies: CurrentOrgResolverDependencies = defaultCurrentOrgResolverDependencies
): Promise<CurrentOrg> {
  const authContext = dependencies.getAuthContext();

  if (authContext.mode === "demo") {
    return dependencies.resolveDemoCurrentOrg();
  }

  if (authContext.mode !== "local") {
    throw new CurrentOrgAuthError("AUTH_PROVIDER_UNAVAILABLE");
  }

  const requestHeaders = await dependencies.readRequestHeaders();
  const rawToken = dependencies.readSessionToken(
    { headers: requestHeaders },
    { secure: authContext.secureCookie }
  );
  if (!rawToken) {
    throw new CurrentOrgAuthError("AUTH_REQUIRED");
  }

  const session = await dependencies.resolveSession(rawToken);
  if (!session) {
    throw new CurrentOrgAuthError("AUTH_REQUIRED");
  }

  return projectCurrentOrg(session);
}

/**
 * Compatibility name retained for existing route and Server Component callers. Creation is possible
 * only in explicit demo mode; local and reserved provider modes are resolution-only and fail closed.
 */
export async function getOrCreateCurrentOrg(): Promise<CurrentOrg> {
  return resolveCurrentOrg();
}

function projectCurrentOrg(session: ResolvedLocalSession): CurrentOrg {
  return Object.freeze({
    orgId: session.orgId,
    orgSlug: session.orgSlug,
    orgName: session.orgName,
    userId: session.userId,
    email: session.email,
    role: session.role,
    demoMode: session.demoMode
  });
}

async function resolveDemoCurrentOrg(): Promise<CurrentOrg> {
  const session = getDemoSession();
  const normalizedEmail = normalizeEmail(session.email);

  return withAuthDatabaseContext({
    loginEmail: normalizedEmail,
    orgSlug: session.orgSlug,
    tokenHash: session.clerkUserId,
    purpose: "bootstrap"
  }, async (client) => {
    const user = await client.appUser.upsert({
      where: { clerkUserId: session.clerkUserId },
      update: {
        email: session.email,
        normalizedEmail,
        displayName: session.displayName
      },
      create: {
        clerkUserId: session.clerkUserId,
        email: session.email,
        normalizedEmail,
        displayName: session.displayName
      }
    });

    const org = await client.organization.upsert({
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

    await setAuthTransactionContext(client, {
      orgId: org.id,
      orgSlug: org.slug,
      userId: user.id,
      loginEmail: normalizedEmail,
      tokenHash: session.clerkUserId,
      purpose: "bootstrap"
    });

    const membership = await client.membership.upsert({
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

    return Object.freeze({
      orgId: org.id,
      orgSlug: org.slug,
      orgName: org.name,
      userId: user.id,
      email: user.email,
      role: membership.role,
      demoMode: org.demoMode
    });
  });
}
