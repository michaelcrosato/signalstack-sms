import {
  hashPassword,
  normalizeEmail,
  safeEqualSecret,
  verifyPassword
} from "@/lib/auth/crypto";
import { isValidAuthToken } from "@/lib/auth/auth-token-policy";

const BOOTSTRAP_COMPARISON_FALLBACK = "signalstack-bootstrap-token-is-not-configured";
const DEFAULT_MAX_FAILED_ATTEMPTS = 5;
const DEFAULT_LOCK_DURATION_MS = 15 * 60 * 1_000;

export type SanitizedLocalUser = Readonly<{
  id: string;
  email: string;
  displayName: string | null;
  authVersion: number;
}>;

export type SanitizedOrganization = Readonly<{
  id: string;
  name: string;
  slug: string;
  timezone: string;
}>;

export type FirstOwnerBootstrapInput = Readonly<{
  bootstrapToken: string;
  email: string;
  displayName?: string | null;
  password: string;
  organizationName: string;
  organizationSlug: string;
  timezone: string;
}>;

export type FirstOwnerBootstrapResult =
  | Readonly<{
      created: true;
      user: SanitizedLocalUser;
      organization: SanitizedOrganization;
    }>
  | Readonly<{
      created: false;
      code: "BOOTSTRAP_DENIED" | "BOOTSTRAP_CLOSED" | "BOOTSTRAP_INPUT_INVALID";
    }>;

export type LocalAuthenticationInput = Readonly<{
  email: string;
  password: string;
}>;

export type LocalAuthenticationResult =
  | Readonly<{ authenticated: true; user: SanitizedLocalUser }>
  | Readonly<{ authenticated: false; code: "AUTHENTICATION_DENIED" }>;

export type LocalAuthenticationRecord = Readonly<{
  user: Readonly<{
    id: string;
    email: string;
    normalizedEmail: string;
    displayName: string | null;
    disabledAt: Date | null;
    authVersion: number;
  }>;
  credential: Readonly<{
    id: string;
    passwordHash: string;
    passwordChangedAt: Date;
    failedAttempts: number;
    lockedUntil: Date | null;
  }>;
}>;

export type FirstOwnerBootstrapTransaction = {
  countLocalCredentials(): Promise<number>;
  createUser(input: {
    email: string;
    normalizedEmail: string;
    displayName: string | null;
    emailVerifiedAt: Date;
  }): Promise<SanitizedLocalUser>;
  createOrganization(input: {
    name: string;
    slug: string;
    timezone: string;
    demoMode: false;
  }): Promise<SanitizedOrganization>;
  createLocalCredential(input: {
    userId: string;
    passwordHash: string;
    passwordChangedAt: Date;
    failedAttempts: 0;
    lockedUntil: null;
  }): Promise<void>;
  createOwnerMembership(input: {
    orgId: string;
    userId: string;
    role: "OWNER";
    status: "ACTIVE";
  }): Promise<void>;
  createAuditEvent(input: {
    orgId: string;
    actorUserId: string;
    action: "LOCAL_OWNER_BOOTSTRAPPED";
    subjectType: "AppUser";
    subjectId: string;
    metadata: Readonly<{ authMode: "local" }>;
  }): Promise<void>;
};

export type LocalCredentialStore = {
  transaction<T>(
    operation: (transaction: FirstOwnerBootstrapTransaction) => Promise<T>,
    options: Readonly<{ isolationLevel: "Serializable" }>
  ): Promise<T>;
  findAuthenticationRecord(normalizedEmail: string): Promise<LocalAuthenticationRecord | null>;
  recordFailedAuthentication(input: {
    credentialId: string;
    userId: string;
    observedPasswordHash: string;
    observedPasswordChangedAt: Date;
    occurredAt: Date;
    maximumAttempts: number;
    lockDurationMs: number;
  }): Promise<boolean>;
  resetFailedAuthentications(input: { credentialId: string; resetAt: Date }): Promise<void>;
};

export type LocalCredentialCrypto = {
  normalizeEmail(email: string): string;
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, encodedHash: string): Promise<boolean>;
  safeEqualSecret(candidate: string, expected: string): boolean;
};

export type LocalCredentialServiceDependencies = Readonly<{
  store: LocalCredentialStore;
  bootstrapToken?: string;
  /**
   * A valid password hash that belongs to no account. It equalizes missing-account verification work
   * and must be generated at process startup, never persisted as a user credential.
   */
  authenticationFallbackHash: string;
  now?: () => Date;
  maximumFailedAttempts?: number;
  lockDurationMs?: number;
  crypto?: Partial<LocalCredentialCrypto>;
}>;

export type LocalCredentialService = Readonly<{
  bootstrapFirstOwner(input: FirstOwnerBootstrapInput): Promise<FirstOwnerBootstrapResult>;
  authenticate(input: LocalAuthenticationInput): Promise<LocalAuthenticationResult>;
}>;

export class LocalCredentialServiceError extends Error {
  constructor(
    message:
      | "First-owner bootstrap failed."
      | "Local authentication failed."
      | "Local authentication state update failed."
  ) {
    super(message);
    this.name = "LocalCredentialServiceError";
  }
}

export function createLocalCredentialService(
  dependencies: LocalCredentialServiceDependencies
): LocalCredentialService {
  const crypto: LocalCredentialCrypto = {
    normalizeEmail,
    hashPassword,
    verifyPassword,
    safeEqualSecret,
    ...dependencies.crypto
  };
  const now = dependencies.now ?? (() => new Date());
  const maximumFailedAttempts = boundedPositiveInteger(
    dependencies.maximumFailedAttempts,
    DEFAULT_MAX_FAILED_ATTEMPTS
  );
  const lockDurationMs = boundedPositiveInteger(dependencies.lockDurationMs, DEFAULT_LOCK_DURATION_MS);

  return Object.freeze({
    async bootstrapFirstOwner(input) {
      const expectedBootstrapToken = validBootstrapToken(dependencies.bootstrapToken)
        ? dependencies.bootstrapToken!
        : BOOTSTRAP_COMPARISON_FALLBACK;
      const tokenMatches = crypto.safeEqualSecret(input.bootstrapToken, expectedBootstrapToken);
      if (!validBootstrapToken(dependencies.bootstrapToken) || !tokenMatches) {
        return bootstrapFailure("BOOTSTRAP_DENIED");
      }

      const normalizedInput = normalizeBootstrapInput(input, crypto.normalizeEmail);
      if (!normalizedInput) {
        return bootstrapFailure("BOOTSTRAP_INPUT_INVALID");
      }

      let passwordHash: string;
      try {
        passwordHash = await crypto.hashPassword(input.password);
      } catch {
        return bootstrapFailure("BOOTSTRAP_INPUT_INVALID");
      }

      const bootstrapAt = now();
      const operation = async (transaction: FirstOwnerBootstrapTransaction): Promise<FirstOwnerBootstrapResult> => {
        if ((await transaction.countLocalCredentials()) > 0) {
          return bootstrapFailure("BOOTSTRAP_CLOSED");
        }

        const user = await transaction.createUser({
          email: normalizedInput.email,
          normalizedEmail: normalizedInput.email,
          displayName: normalizedInput.displayName,
          emailVerifiedAt: bootstrapAt
        });
        const organization = await transaction.createOrganization({
          name: normalizedInput.organizationName,
          slug: normalizedInput.organizationSlug,
          timezone: normalizedInput.timezone,
          demoMode: false
        });
        await transaction.createLocalCredential({
          userId: user.id,
          passwordHash,
          passwordChangedAt: bootstrapAt,
          failedAttempts: 0,
          lockedUntil: null
        });
        await transaction.createOwnerMembership({
          orgId: organization.id,
          userId: user.id,
          role: "OWNER",
          status: "ACTIVE"
        });
        await transaction.createAuditEvent({
          orgId: organization.id,
          actorUserId: user.id,
          action: "LOCAL_OWNER_BOOTSTRAPPED",
          subjectType: "AppUser",
          subjectId: user.id,
          metadata: Object.freeze({ authMode: "local" })
        });

        return Object.freeze({
          created: true,
          user: sanitizeUser(user),
          organization: sanitizeOrganization(organization)
        });
      };

      // Serializable isolation makes the empty-credential predicate part of the first-owner claim.
      // PostgreSQL may abort a concurrent claimant with P2034/40001 or surface the winner's unique
      // email/slug as P2002 before the serializable loser observes it. Retry those bounded bootstrap-race
      // outcomes so the winner can commit and the loser can observe the now-closed predicate.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          return await dependencies.store.transaction(operation, { isolationLevel: "Serializable" });
        } catch (error) {
          if (!isBootstrapRaceConflict(error) || attempt === 3) {
            throw new LocalCredentialServiceError("First-owner bootstrap failed.");
          }
          await waitForSerializableRetry(attempt);
        }
      }

      throw new LocalCredentialServiceError("First-owner bootstrap failed.");
    },

    async authenticate(input) {
      const normalizedEmail = crypto.normalizeEmail(input.email);
      const emailIsValid = validEmail(normalizedEmail);
      let record: LocalAuthenticationRecord | null;
      try {
        record = emailIsValid
          ? await dependencies.store.findAuthenticationRecord(normalizedEmail)
          : null;
      } catch {
        throw new LocalCredentialServiceError("Local authentication failed.");
      }
      const authenticationAt = now();
      const activelyLocked = Boolean(
        record?.credential.lockedUntil &&
          record.credential.lockedUntil.getTime() > authenticationAt.getTime()
      );

      const passwordHash = record?.credential.passwordHash ?? dependencies.authenticationFallbackHash;
      let passwordMatches = false;
      try {
        passwordMatches = await crypto.verifyPassword(input.password, passwordHash);
      } catch {
        passwordMatches = false;
      }

      if (!record || activelyLocked || record.user.disabledAt || !passwordMatches) {
        if (record && !activelyLocked && !record.user.disabledAt && !passwordMatches) {
          try {
            await dependencies.store.recordFailedAuthentication({
              credentialId: record.credential.id,
              userId: record.user.id,
              observedPasswordHash: record.credential.passwordHash,
              observedPasswordChangedAt: record.credential.passwordChangedAt,
              occurredAt: authenticationAt,
              maximumAttempts: maximumFailedAttempts,
              lockDurationMs
            });
          } catch {
            throw new LocalCredentialServiceError("Local authentication state update failed.");
          }
        }
        return authenticationFailure();
      }

      if (record.credential.failedAttempts > 0 || record.credential.lockedUntil) {
        try {
          await dependencies.store.resetFailedAuthentications({
            credentialId: record.credential.id,
            resetAt: authenticationAt
          });
        } catch {
          throw new LocalCredentialServiceError("Local authentication state update failed.");
        }
      }

      return Object.freeze({ authenticated: true, user: sanitizeUser(record.user) });
    }
  });
}

function normalizeBootstrapInput(
  input: FirstOwnerBootstrapInput,
  normalize: (email: string) => string
): Readonly<{
  email: string;
  displayName: string | null;
  organizationName: string;
  organizationSlug: string;
  timezone: string;
}> | null {
  const email = normalize(input.email);
  const displayName = optionalTrimmedText(input.displayName, 160);
  const organizationName = requiredTrimmedText(input.organizationName, 160);
  const organizationSlug = input.organizationSlug.trim().toLowerCase();
  const timezone = input.timezone.trim();

  if (
    !validEmail(email) ||
    displayName === undefined ||
    !organizationName ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(organizationSlug) ||
    organizationSlug.length > 80 ||
    !validTimeZone(timezone)
  ) {
    return null;
  }

  return Object.freeze({ email, displayName, organizationName, organizationSlug, timezone });
}

function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function requiredTrimmedText(value: string, maximumLength: number): string | null {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximumLength ? normalized : null;
}

function optionalTrimmedText(value: string | null | undefined, maximumLength: number): string | null | undefined {
  if (value === null || value === undefined || value.trim() === "") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length <= maximumLength ? normalized : undefined;
}

function validTimeZone(value: string): boolean {
  if (!value || value.length > 128) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function validBootstrapToken(value: string | undefined): value is string {
  return isValidAuthToken(value);
}

function boundedPositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && value! > 0 ? value! : fallback;
}

function isBootstrapRaceConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as { code?: unknown; meta?: unknown; cause?: unknown };
  if (candidate.code === "P2002" || candidate.code === "P2034" || candidate.code === "40001") {
    return true;
  }
  if (candidate.meta && typeof candidate.meta === "object") {
    const meta = candidate.meta as { code?: unknown; database_error?: unknown };
    if (meta.code === "40001" || String(meta.database_error ?? "").includes("40001")) {
      return true;
    }
  }
  return candidate.cause !== error && isBootstrapRaceConflict(candidate.cause);
}

function waitForSerializableRetry(attempt: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, (attempt + 1) * 5));
}

function sanitizeUser(user: {
  id: string;
  email: string;
  displayName: string | null;
  authVersion: number;
}): SanitizedLocalUser {
  return Object.freeze({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    authVersion: user.authVersion
  });
}

function sanitizeOrganization(organization: SanitizedOrganization): SanitizedOrganization {
  return Object.freeze({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    timezone: organization.timezone
  });
}

function bootstrapFailure(code: Exclude<FirstOwnerBootstrapResult, { created: true }>["code"]): FirstOwnerBootstrapResult {
  return Object.freeze({ created: false, code });
}

function authenticationFailure(): LocalAuthenticationResult {
  return Object.freeze({ authenticated: false, code: "AUTHENTICATION_DENIED" });
}
