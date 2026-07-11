import { AuthThrottleScope, PrismaClient } from "@prisma/client";
import { deriveAuthThrottleKeyHash } from "@/lib/auth/auth-throttle";

export const localAuthE2eFixture = Object.freeze({
  ownerEmail: "local-auth-e2e-owner@example.com",
  ownerName: "Local Auth E2E Owner",
  primaryOrganizationName: "Local Auth E2E Primary",
  primaryOrganizationSlug: "local-auth-e2e-primary",
  secondaryOrganizationName: "Local Auth E2E Secondary",
  secondaryOrganizationSlug: "local-auth-e2e-secondary",
  memberEmail: "local-auth-e2e-member@example.com",
  memberName: "Local Auth E2E Member",
  timezone: "America/Vancouver",
  networkEvidence: "127.0.0.1"
});

export const localAuthE2eDatabaseName = "signalstack_sms_local_auth_e2e";

export type LocalAuthE2eProfile = Readonly<{
  bootstrapToken: string;
  throttleSecret: string;
  ownerPassword: string;
  memberPassword: string;
  environment: Readonly<{
    AUTH_SESSION_SECRET: string;
  }>;
}>;

/**
 * Fail before touching data unless the caller selected the explicit, loopback-only local-auth profile.
 * This proof intentionally cannot be aimed at a remote or production database.
 */
export function requireLocalAuthE2eProfile(
  environment: NodeJS.ProcessEnv = process.env
): LocalAuthE2eProfile {
  if (environment.RUN_LOCAL_AUTH_E2E !== "true") {
    throw new Error("The local-auth browser proof requires RUN_LOCAL_AUTH_E2E=true.");
  }
  if (environment.DEMO_MODE !== "false" || environment.AUTH_PROVIDER !== "local") {
    throw new Error("The local-auth browser proof requires the built-in non-demo auth profile.");
  }
  if (environment.TRUST_PROXY !== "true") {
    throw new Error("The local-auth browser proof requires the production trusted-ingress profile.");
  }
  if (
    environment.LIVE_MESSAGING_ENABLED !== "false" ||
    environment.LIVE_BILLING_ENABLED !== "false" ||
    environment.MESSAGING_PROVIDER !== "dummy"
  ) {
    throw new Error("The local-auth browser proof requires demo-safe external-impact settings.");
  }

  requireDedicatedLoopbackPostgres(environment.DATABASE_URL, "runtime");
  requireDedicatedLoopbackPostgres(environment.MIGRATION_DATABASE_URL, "migration");
  if (environment.DATABASE_URL === environment.MIGRATION_DATABASE_URL) {
    throw new Error("The local-auth browser proof requires separate runtime and migration credentials.");
  }
  const bootstrapToken = requireBoundedSecret(environment.BOOTSTRAP_TOKEN, "bootstrap token", 192);
  const throttleSecret = requireBoundedSecret(
    environment.AUTH_THROTTLE_SECRET,
    "throttle secret",
    256
  );
  const sessionSecret = requireBoundedSecret(
    environment.AUTH_SESSION_SECRET,
    "session secret",
    1_024
  );
  const ownerPassword = requireBoundedSecret(
    environment.LOCAL_AUTH_E2E_OWNER_PASSWORD,
    "owner password",
    128
  );
  const memberPassword = requireBoundedSecret(
    environment.LOCAL_AUTH_E2E_MEMBER_PASSWORD,
    "member password",
    128
  );

  return Object.freeze({
    bootstrapToken,
    throttleSecret,
    ownerPassword,
    memberPassword,
    environment: Object.freeze({ AUTH_SESSION_SECRET: sessionSecret })
  });
}

/** Delete only deterministic fixture identities, organizations, and their exact HMAC throttle keys. */
export async function cleanupLocalAuthE2eFixtures(throttleSecret: string): Promise<void> {
  const throttleKeys = localAuthThrottleKeys(throttleSecret);
  await localAuthE2eOwnerPrisma().$transaction(async (transaction) => {
    await transaction.organization.deleteMany({
      where: {
        slug: {
          in: [
            localAuthE2eFixture.primaryOrganizationSlug,
            localAuthE2eFixture.secondaryOrganizationSlug
          ]
        }
      }
    });
    await transaction.appUser.deleteMany({
      where: {
        normalizedEmail: {
          in: [localAuthE2eFixture.ownerEmail, localAuthE2eFixture.memberEmail]
        }
      }
    });
    await transaction.authThrottle.deleteMany({ where: { OR: throttleKeys } });
  });
}

export async function disconnectLocalAuthE2eDatabase(): Promise<void> {
  await cleanupClient?.$disconnect();
  cleanupClient = undefined;
}

let cleanupClient: PrismaClient | undefined;

export function localAuthE2eOwnerPrisma(): PrismaClient {
  const migrationUrl = process.env.MIGRATION_DATABASE_URL;
  requireDedicatedLoopbackPostgres(migrationUrl, "migration");
  cleanupClient ??= new PrismaClient({ datasourceUrl: migrationUrl, log: ["error"] });
  return cleanupClient;
}

function localAuthThrottleKeys(secret: string) {
  const inputs = [
    { scope: AuthThrottleScope.SETUP_NETWORK, evidence: localAuthE2eFixture.networkEvidence },
    { scope: AuthThrottleScope.LOGIN_NETWORK, evidence: localAuthE2eFixture.networkEvidence },
    { scope: AuthThrottleScope.LOGIN_EMAIL, evidence: localAuthE2eFixture.ownerEmail },
    { scope: AuthThrottleScope.LOGIN_EMAIL, evidence: localAuthE2eFixture.memberEmail },
    { scope: AuthThrottleScope.RESET_EMAIL, evidence: localAuthE2eFixture.ownerEmail },
    { scope: AuthThrottleScope.RESET_EMAIL, evidence: localAuthE2eFixture.memberEmail }
  ] as const;

  return inputs.map(({ scope, evidence }) => ({
    scope,
    keyHash: deriveAuthThrottleKeyHash({ secret, scope, evidence })
  }));
}

function requireDedicatedLoopbackPostgres(
  value: string | undefined,
  credential: "runtime" | "migration"
): void {
  let parsed: URL;
  try {
    parsed = new URL(value ?? "");
  } catch {
    throw new Error(`The local-auth browser proof requires an explicit ${credential} PostgreSQL URL.`);
  }

  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !loopbackHosts.has(parsed.hostname) ||
    decodeURIComponent(parsed.pathname.slice(1)) !== localAuthE2eDatabaseName ||
    parsed.searchParams.get("schema") !== "public"
  ) {
    throw new Error(
      `The local-auth browser proof accepts only a loopback ${credential} credential for ${localAuthE2eDatabaseName} with schema=public.`
    );
  }
}

function requireBoundedSecret(value: string | undefined, label: string, maximum: number): string {
  if (!value || value.length < 32 || value.length > maximum) {
    throw new Error(`The local-auth browser proof requires a bounded ${label}.`);
  }
  return value;
}
