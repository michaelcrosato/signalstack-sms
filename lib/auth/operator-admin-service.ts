import { hashPassword, normalizeEmail } from "@/lib/auth/crypto";
import type {
  FirstOwnerBootstrapInput,
  FirstOwnerBootstrapResult,
  LocalCredentialService
} from "@/lib/auth/local-credentials";

const MAX_SERIALIZABLE_ATTEMPTS = 4;

export type OperatorAdminRole = "OWNER";

export type OperatorAdminCreated = Readonly<{
  created: true;
  user: Readonly<{ id: string; email: string }>;
  organization: Readonly<{ id: string; slug: string }>;
  role: OperatorAdminRole;
}>;

export type OperatorAdminFailureCode =
  | "ADMIN_INPUT_INVALID"
  | "ADMIN_IDENTITY_EXISTS"
  | "ADMIN_ORGANIZATION_NOT_FOUND"
  | "ADMIN_ORGANIZATION_NOT_ELIGIBLE"
  | "BOOTSTRAP_DENIED"
  | "BOOTSTRAP_CLOSED";

export type OperatorAdminResult =
  | OperatorAdminCreated
  | Readonly<{ created: false; code: OperatorAdminFailureCode }>;

export type OperatorFirstOwnerInput = Readonly<{
  mode: "bootstrap";
  bootstrapToken: string;
  email: string;
  displayName: string;
  password: string;
  organizationName: string;
  organizationSlug: string;
  timezone: string;
}>;

export type OperatorRecoveryOwnerInput = Readonly<{
  mode: "existing-org";
  email: string;
  displayName: string;
  password: string;
  organizationSlug: string;
}>;

export type OperatorAdminInput = OperatorFirstOwnerInput | OperatorRecoveryOwnerInput;

export type OperatorAdminOrganization = Readonly<{
  id: string;
  slug: string;
  demoMode: boolean;
}>;

export type OperatorAdminExistingIdentity = Readonly<{
  id: string;
  disabledAt: Date | null;
  hasLocalCredential: boolean;
}>;

export type OperatorAdminTransaction = Readonly<{
  findOrganizationByExactSlug(slug: string): Promise<OperatorAdminOrganization | null>;
  findIdentityByNormalizedEmail(normalizedEmail: string): Promise<OperatorAdminExistingIdentity | null>;
  createEnabledUser(input: {
    email: string;
    normalizedEmail: string;
    displayName: string;
    emailVerifiedAt: Date;
    disabledAt: null;
  }): Promise<Readonly<{ id: string; email: string }>>;
  createLocalCredential(input: {
    userId: string;
    passwordHash: string;
    passwordChangedAt: Date;
    failedAttempts: 0;
    lockedUntil: null;
  }): Promise<void>;
  createActiveOwnerMembership(input: {
    orgId: string;
    userId: string;
    role: "OWNER";
    status: "ACTIVE";
  }): Promise<void>;
  revokePendingInvitesForEmail(input: {
    orgId: string;
    normalizedEmail: string;
    revokedAt: Date;
  }): Promise<number>;
  createSecretFreeAuditEvent(input: {
    orgId: string;
    actorUserId: null;
    action: "LOCAL_OWNER_RECOVERY_CREATED";
    subjectType: "AppUser";
    subjectId: string;
    metadata: Readonly<{
      authMode: "local";
      source: "operator_admin_cli";
      role: "OWNER";
      revokedPendingInviteCount: number;
    }>;
  }): Promise<void>;
}>;

export type OperatorAdminStore = Readonly<{
  transaction<T>(
    operation: (transaction: OperatorAdminTransaction) => Promise<T>,
    options: Readonly<{ isolationLevel: "Serializable" }>
  ): Promise<T>;
}>;

export type OperatorAdminServiceDependencies = Readonly<{
  firstOwnerService: Pick<LocalCredentialService, "bootstrapFirstOwner">;
  store: OperatorAdminStore;
  now?: () => Date;
  crypto?: Readonly<{
    normalizeEmail?: typeof normalizeEmail;
    hashPassword?: typeof hashPassword;
  }>;
}>;

export type OperatorAdminService = Readonly<{
  create(input: OperatorAdminInput): Promise<OperatorAdminResult>;
}>;

export class OperatorAdminServiceError extends Error {
  constructor() {
    super("Operator administrator creation failed.");
    this.name = "OperatorAdminServiceError";
  }
}

export function createOperatorAdminService(
  dependencies: OperatorAdminServiceDependencies
): OperatorAdminService {
  const normalize = dependencies.crypto?.normalizeEmail ?? normalizeEmail;
  const hash = dependencies.crypto?.hashPassword ?? hashPassword;
  const now = dependencies.now ?? (() => new Date());

  return Object.freeze({
    async create(input) {
      if (input.mode === "bootstrap") {
        return bootstrapFirstOwner(dependencies.firstOwnerService, input);
      }

      const normalized = normalizeRecoveryInput(input, normalize);
      if (!normalized) {
        return failure("ADMIN_INPUT_INVALID");
      }

      let passwordHash: string;
      try {
        // The operator password is passed byte-for-byte. It is never trimmed, normalized, or logged.
        passwordHash = await hash(input.password);
      } catch {
        return failure("ADMIN_INPUT_INVALID");
      }

      const createdAt = now();
      const operation = async (
        transaction: OperatorAdminTransaction
      ): Promise<OperatorAdminResult> => {
        const organization = await transaction.findOrganizationByExactSlug(
          normalized.organizationSlug
        );
        if (!organization) {
          return failure("ADMIN_ORGANIZATION_NOT_FOUND");
        }
        if (organization.demoMode) {
          return failure("ADMIN_ORGANIZATION_NOT_ELIGIBLE");
        }

        // Recovery creates a new identity. It never adopts, enables, or adds a password to an
        // existing row, even when that row does not currently have a local credential.
        if (await transaction.findIdentityByNormalizedEmail(normalized.email)) {
          return failure("ADMIN_IDENTITY_EXISTS");
        }

        const user = await transaction.createEnabledUser({
          email: normalized.email,
          normalizedEmail: normalized.email,
          displayName: normalized.displayName,
          emailVerifiedAt: createdAt,
          disabledAt: null
        });
        await transaction.createLocalCredential({
          userId: user.id,
          passwordHash,
          passwordChangedAt: createdAt,
          failedAttempts: 0,
          lockedUntil: null
        });
        await transaction.createActiveOwnerMembership({
          orgId: organization.id,
          userId: user.id,
          role: "OWNER",
          status: "ACTIVE"
        });
        const revokedPendingInviteCount = await transaction.revokePendingInvitesForEmail({
          orgId: organization.id,
          normalizedEmail: normalized.email,
          revokedAt: createdAt
        });
        await transaction.createSecretFreeAuditEvent({
          orgId: organization.id,
          actorUserId: null,
          action: "LOCAL_OWNER_RECOVERY_CREATED",
          subjectType: "AppUser",
          subjectId: user.id,
          metadata: Object.freeze({
            authMode: "local",
            source: "operator_admin_cli",
            role: "OWNER",
            revokedPendingInviteCount
          })
        });

        return created(user, organization);
      };

      for (let attempt = 0; attempt < MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
        try {
          return await dependencies.store.transaction(operation, {
            isolationLevel: "Serializable"
          });
        } catch (error) {
          if (isUniqueConflict(error)) {
            return failure("ADMIN_IDENTITY_EXISTS");
          }
          if (!isSerializableConflict(error) || attempt === MAX_SERIALIZABLE_ATTEMPTS - 1) {
            throw new OperatorAdminServiceError();
          }
          await waitForSerializableRetry(attempt);
        }
      }

      throw new OperatorAdminServiceError();
    }
  });
}

async function bootstrapFirstOwner(
  service: Pick<LocalCredentialService, "bootstrapFirstOwner">,
  input: OperatorFirstOwnerInput
): Promise<OperatorAdminResult> {
  const bootstrapInput: FirstOwnerBootstrapInput = {
    bootstrapToken: input.bootstrapToken,
    email: input.email,
    displayName: input.displayName,
    password: input.password,
    organizationName: input.organizationName,
    organizationSlug: input.organizationSlug,
    timezone: input.timezone
  };

  let result: FirstOwnerBootstrapResult;
  try {
    result = await service.bootstrapFirstOwner(bootstrapInput);
  } catch {
    throw new OperatorAdminServiceError();
  }

  if (!result.created) {
    return result.code === "BOOTSTRAP_INPUT_INVALID"
      ? failure("ADMIN_INPUT_INVALID")
      : failure(result.code);
  }

  return created(result.user, result.organization);
}

function normalizeRecoveryInput(
  input: OperatorRecoveryOwnerInput,
  normalize: (email: string) => string
): Readonly<{ email: string; displayName: string; organizationSlug: string }> | null {
  const email = normalize(input.email);
  const displayName = input.displayName.trim();

  if (
    !validEmail(email) ||
    displayName.length === 0 ||
    displayName.length > 120 ||
    input.organizationSlug.length < 2 ||
    input.organizationSlug.length > 63 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.organizationSlug)
  ) {
    return null;
  }

  return Object.freeze({
    email,
    displayName,
    // Exact means the operator's value is never trimmed or case-folded before the database lookup.
    organizationSlug: input.organizationSlug
  });
}

function validEmail(value: string) {
  return value.length > 0 && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function created(
  user: Readonly<{ id: string; email: string }>,
  organization: Readonly<{ id: string; slug: string }>
): OperatorAdminCreated {
  return Object.freeze({
    created: true,
    user: Object.freeze({ id: user.id, email: user.email }),
    organization: Object.freeze({ id: organization.id, slug: organization.slug }),
    role: "OWNER"
  });
}

function failure(code: OperatorAdminFailureCode): OperatorAdminResult {
  return Object.freeze({ created: false, code });
}

function isUniqueConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "P2002");
}

function isSerializableConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as { code?: unknown; meta?: unknown; cause?: unknown };
  if (candidate.code === "P2034" || candidate.code === "40001") {
    return true;
  }
  if (candidate.meta && typeof candidate.meta === "object") {
    const meta = candidate.meta as { code?: unknown; database_error?: unknown };
    if (meta.code === "40001" || String(meta.database_error ?? "").includes("40001")) {
      return true;
    }
  }
  return candidate.cause !== error && isSerializableConflict(candidate.cause);
}

function waitForSerializableRetry(attempt: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, (attempt + 1) * 5));
}
