import { z, type ZodIssue } from "zod";
import { localDatabaseUrl } from "@/lib/env/defaults";
import {
  AUTH_TOKEN_MAX_CHARACTERS,
  AUTH_TOKEN_MIN_CHARACTERS,
  AUTH_TOKEN_PATTERN,
  isValidAuthToken
} from "@/lib/auth/auth-token-policy";

export type RuntimeEnvironment = Record<string, string | undefined>;

export type RuntimeConfigIssue = Readonly<{
  code: ZodIssue["code"];
  path: string;
  message: string;
}>;

export class RuntimeConfigError extends Error {
  readonly issues: readonly RuntimeConfigIssue[];

  constructor(issues: readonly ZodIssue[]) {
    super("Invalid runtime configuration.");
    this.name = "RuntimeConfigError";
    this.issues = Object.freeze(
      issues.map((issue) =>
        Object.freeze({
          code: issue.code,
          path: issue.path.join("."),
          message: issue.message
        })
      )
    );
  }
}

export type RuntimeConfig = Readonly<{
  runtime: Readonly<{
    environment: "local" | "production";
    process: "web" | "worker" | "all";
    demoMode: boolean;
  }>;
  web: Readonly<{
    appUrl: string;
    host: string;
    port: number;
    trustProxy: boolean;
  }>;
  database: Readonly<{
    configured: boolean;
    usesLocalDefault: boolean;
    rlsEnforced: boolean;
  }>;
  worker: Readonly<{
    enabled: boolean;
    deploymentClass: "local-demo" | "production-live-campaign";
    concurrency: number;
    pollIntervalMs: number;
  }>;
  provider: Readonly<{
    name: "dummy" | "twilio";
    liveMessagingEnabled: boolean;
    credentialsReady: boolean;
    twilio: Readonly<{
      accountSidConfigured: boolean;
      authTokenConfigured: boolean;
      fromNumberConfigured: boolean;
      messagingServiceConfigured: boolean;
      senderConfigured: boolean;
    }>;
  }>;
  queue: Readonly<{
    backend: "database" | "bullmq";
    redisConfigured: boolean;
  }>;
  auth: Readonly<{
    mode: "demo" | "local" | "oidc";
    sessionSecretConfigured: boolean;
    throttleSecretConfigured: boolean;
    bootstrapTokenConfigured: boolean;
    sessionIdleMinutes: number;
    sessionAbsoluteHours: number;
    oidcConfigured: boolean;
  }>;
  secrets: Readonly<{
    masterKeyConfigured: boolean;
    apiKeyPepperConfigured: boolean;
    backupEncryptionKeyConfigured: boolean;
  }>;
  retention: Readonly<{
    messageBodyDays: number;
    mediaDays: number;
    rawWebhookDays: number;
    apiLogDays: number;
    auditDays: number;
    cleanupIntervalHours: number;
  }>;
  backup: Readonly<{
    enabled: boolean;
    directory: string;
    intervalHours: number;
    retentionDays: number;
    offsiteConfigured: boolean;
    requireOffsite: boolean;
    encryptionReady: boolean;
  }>;
}>;

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = (maximum = 4096) =>
  z.preprocess(blankToUndefined, z.string().trim().min(1).max(maximum).optional());

const optionalUrl = z.preprocess(blankToUndefined, z.string().trim().url().max(4096).optional());

const optionalAuthToken = z.preprocess(
  blankToUndefined,
  z
    .string()
    .min(AUTH_TOKEN_MIN_CHARACTERS)
    .max(AUTH_TOKEN_MAX_CHARACTERS)
    .regex(AUTH_TOKEN_PATTERN)
    .optional()
);

const optionalAuthThrottleSecret = z.preprocess(
  blankToUndefined,
  z
    .string()
    .min(32, "AUTH_THROTTLE_SECRET must contain at least 32 characters.")
    .max(256, "AUTH_THROTTLE_SECRET must contain at most 256 characters.")
    .refine(
      (value) => Buffer.byteLength(value, "utf8") <= 512 && !hasControlCharacter(value),
      "AUTH_THROTTLE_SECRET has an invalid shape."
    )
    .optional()
);

const optionalAuthSessionSecret = z.preprocess(
  blankToUndefined,
  z
    .string()
    .min(32, "AUTH_SESSION_SECRET must contain at least 32 characters.")
    .max(1024, "AUTH_SESSION_SECRET must contain at most 1024 characters.")
    .refine(
      (value) => Buffer.byteLength(value, "utf8") <= 2_048 && !hasControlCharacter(value),
      "AUTH_SESSION_SECRET has an invalid shape."
    )
    .optional()
);

const booleanFromEnv = (defaultValue: boolean) =>
  z.preprocess((value) => {
    const normalized = blankToUndefined(value);
    if (normalized === undefined) {
      return undefined;
    }
    if (typeof normalized === "boolean") {
      return normalized;
    }
    if (typeof normalized === "string") {
      if (["true", "1", "yes", "on"].includes(normalized.toLowerCase())) {
        return true;
      }
      if (["false", "0", "no", "off"].includes(normalized.toLowerCase())) {
        return false;
      }
    }
    return normalized;
  }, z.boolean().default(defaultValue));

const integerFromEnv = (defaultValue: number, minimum: number, maximum: number) =>
  z.preprocess((value) => {
    const normalized = blankToUndefined(value);
    if (normalized === undefined || typeof normalized === "number") {
      return normalized;
    }
    if (typeof normalized === "string" && /^-?\d+$/.test(normalized)) {
      return Number(normalized);
    }
    return normalized;
  }, z.number().int().min(minimum).max(maximum).default(defaultValue));

const databaseUrl = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .min(1)
    .max(4096)
    .default(localDatabaseUrl)
    .refine((value) => hasProtocol(value, ["postgres:", "postgresql:"]), "DATABASE_URL must be PostgreSQL.")
);

const redisUrl = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .min(1)
    .max(4096)
    .optional()
    .refine((value) => value === undefined || hasProtocol(value, ["redis:", "rediss:"]), "REDIS_URL must use redis:// or rediss://.")
);

const runtimeEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    APP_ENV: z.enum(["local", "development", "test", "production", "prod"]).optional(),
    RUNTIME_PROCESS: z.enum(["web", "worker", "all"]).default("web"),
    DEMO_MODE: booleanFromEnv(true),

    NEXT_PUBLIC_APP_URL: z.preprocess(
      blankToUndefined,
      z.string().trim().url().max(2048).default("http://localhost:3000")
    ),
    WEB_HOST: z.preprocess(blankToUndefined, z.string().trim().min(1).max(255).default("0.0.0.0")),
    WEB_PORT: integerFromEnv(3000, 1, 65_535),
    TRUST_PROXY: booleanFromEnv(false),

    DATABASE_URL: databaseUrl,
    DATABASE_RLS_ENFORCED: booleanFromEnv(false),

    WORKER_ENABLED: booleanFromEnv(false),
    WORKER_DEPLOYMENT_CLASS: z.enum(["local-demo", "production-live-campaign"]).default("local-demo"),
    WORKER_CONCURRENCY: integerFromEnv(5, 1, 100),
    WORKER_POLL_INTERVAL_MS: integerFromEnv(1_000, 100, 60_000),

    LIVE_MESSAGING_ENABLED: booleanFromEnv(false),
    MESSAGING_PROVIDER: z.enum(["dummy", "twilio"]).default("dummy"),
    TWILIO_ACCOUNT_SID: optionalString(128),
    TWILIO_AUTH_TOKEN: optionalString(512),
    TWILIO_FROM_NUMBER: optionalString(32),
    TWILIO_MESSAGING_SERVICE_SID: optionalString(128),

    QUEUE_BACKEND: z.enum(["database", "bullmq"]).default("database"),
    REDIS_URL: redisUrl,

    AUTH_PROVIDER: z.enum(["local", "oidc"]).default("local"),
    AUTH_SESSION_SECRET: optionalAuthSessionSecret,
    AUTH_THROTTLE_SECRET: optionalAuthThrottleSecret,
    BOOTSTRAP_TOKEN: optionalAuthToken,
    AUTH_SESSION_IDLE_MINUTES: integerFromEnv(30, 10, 10_080),
    AUTH_SESSION_ABSOLUTE_HOURS: integerFromEnv(24, 1, 8_760),
    OIDC_ISSUER_URL: optionalUrl,
    OIDC_CLIENT_ID: optionalString(512),
    OIDC_CLIENT_SECRET: optionalString(2048),

    SECRETS_MASTER_KEY: optionalString(2048),
    API_KEY_PEPPER: optionalString(2048),

    MESSAGE_BODY_RETENTION_DAYS: integerFromEnv(365, 0, 3_650),
    MEDIA_RETENTION_DAYS: integerFromEnv(90, 0, 3_650),
    RAW_WEBHOOK_RETENTION_DAYS: integerFromEnv(30, 0, 365),
    API_LOG_RETENTION_DAYS: integerFromEnv(30, 0, 365),
    AUDIT_RETENTION_DAYS: integerFromEnv(2_555, 365, 3_650),
    RETENTION_CLEANUP_INTERVAL_HOURS: integerFromEnv(24, 1, 168),

    BACKUP_ENABLED: booleanFromEnv(false),
    BACKUP_DIRECTORY: z.preprocess(
      blankToUndefined,
      z.string().trim().min(1).max(1024).default("./backups")
    ),
    BACKUP_INTERVAL_HOURS: integerFromEnv(24, 1, 168),
    BACKUP_RETENTION_DAYS: integerFromEnv(30, 1, 365),
    BACKUP_ENCRYPTION_KEY: optionalString(2048),
    BACKUP_OFFSITE_URL: optionalUrl,
    BACKUP_REQUIRE_OFFSITE: booleanFromEnv(false)
  })
  .strip()
  .superRefine((config, context) => {
    if (config.DEMO_MODE && config.MESSAGING_PROVIDER !== "dummy") {
      addIssue(context, "MESSAGING_PROVIDER", "Demo mode requires the dummy messaging provider.");
    }
    if (config.DEMO_MODE && config.LIVE_MESSAGING_ENABLED) {
      addIssue(context, "LIVE_MESSAGING_ENABLED", "Demo mode cannot enable live messaging.");
    }
    if (config.LIVE_MESSAGING_ENABLED && config.MESSAGING_PROVIDER !== "twilio") {
      addIssue(context, "MESSAGING_PROVIDER", "Live messaging requires the Twilio provider.");
    }

    if (!config.DEMO_MODE && config.AUTH_PROVIDER === "local") {
      if (config.NODE_ENV === "development") {
        addIssue(
          context,
          "AUTH_PROVIDER",
          "Built-in local authentication requires a production build; Next development mode exposes request Cookie headers in Flight debug payloads."
        );
      }
      if (!isAuthSessionSecret(config.AUTH_SESSION_SECRET)) {
        addIssue(
          context,
          "AUTH_SESSION_SECRET",
          "Local auth requires a session secret of at least 32 characters."
        );
      }
      if (!isAuthThrottleSecret(config.AUTH_THROTTLE_SECRET)) {
        addIssue(
          context,
          "AUTH_THROTTLE_SECRET",
          "Local auth requires a dedicated throttle secret containing 32 to 256 characters."
        );
      }
      if (
        isAuthSessionSecret(config.AUTH_SESSION_SECRET) &&
        isAuthThrottleSecret(config.AUTH_THROTTLE_SECRET) &&
        config.AUTH_SESSION_SECRET === config.AUTH_THROTTLE_SECRET
      ) {
        addIssue(
          context,
          "AUTH_THROTTLE_SECRET",
          "Local auth session and throttle secrets must be distinct."
        );
      }
      if (resolveEnvironment(config) === "production" && !config.TRUST_PROXY) {
        addIssue(
          context,
          "TRUST_PROXY",
          "Production built-in auth requires a trusted ingress that overwrites forwarded client headers."
        );
      }
    }

    if (!config.DEMO_MODE && config.AUTH_PROVIDER === "oidc") {
      addIssue(
        context,
        "AUTH_PROVIDER",
        "OIDC authentication is reserved but not implemented; use built-in local authentication."
      );
    }

    if (config.AUTH_SESSION_ABSOLUTE_HOURS * 60 <= config.AUTH_SESSION_IDLE_MINUTES) {
      addIssue(
        context,
        "AUTH_SESSION_ABSOLUTE_HOURS",
        "Absolute session lifetime must be greater than the idle session lifetime."
      );
    }

    if (config.QUEUE_BACKEND === "bullmq" && !config.REDIS_URL) {
      addIssue(context, "REDIS_URL", "BullMQ requires a Redis URL.");
    }

    if (config.LIVE_MESSAGING_ENABLED && config.MESSAGING_PROVIDER === "twilio") {
      if (!isTwilioAccountSid(config.TWILIO_ACCOUNT_SID)) {
        addIssue(context, "TWILIO_ACCOUNT_SID", "Live Twilio messaging requires account credential readiness.");
      }
      if (!isMinimumSecret(config.TWILIO_AUTH_TOKEN, 16)) {
        addIssue(context, "TWILIO_AUTH_TOKEN", "Live Twilio messaging requires auth-token readiness.");
      }
      if (!isTwilioSenderConfigured(config)) {
        addIssue(context, "TWILIO_FROM_NUMBER", "Live Twilio messaging requires a from number or messaging service.");
      }
      if (!isEncryptionKey(config.SECRETS_MASTER_KEY)) {
        addIssue(context, "SECRETS_MASTER_KEY", "Live Twilio messaging requires a valid 256-bit secrets master key.");
      }
    }

    if (config.BACKUP_ENABLED && !isEncryptionKey(config.BACKUP_ENCRYPTION_KEY)) {
      addIssue(context, "BACKUP_ENCRYPTION_KEY", "Enabled backups require a valid 256-bit encryption key.");
    }
    if (config.BACKUP_REQUIRE_OFFSITE && !config.BACKUP_ENABLED) {
      addIssue(context, "BACKUP_ENABLED", "Off-site backup enforcement requires backups to be enabled.");
    }
    if (config.BACKUP_REQUIRE_OFFSITE && !config.BACKUP_OFFSITE_URL) {
      addIssue(context, "BACKUP_OFFSITE_URL", "Off-site backup enforcement requires an off-site destination.");
    }
  });

type ParsedRuntimeEnvironment = z.infer<typeof runtimeEnvironmentSchema>;

let cachedRuntimeConfig: RuntimeConfig | undefined;

/**
 * Parse an explicit environment without mutating it. Raw credentials are used only for validation and
 * are discarded before the safe configuration object is returned.
 */
export function parseRuntimeConfig(environment: RuntimeEnvironment): RuntimeConfig {
  const result = runtimeEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new RuntimeConfigError(result.error.issues);
  }

  return buildSafeRuntimeConfig(result.data);
}

/**
 * Lazily parse process.env on first access. Importing this module never parses environment variables,
 * which keeps Next.js build-time module discovery safe.
 */
export function getRuntimeConfig(): RuntimeConfig {
  cachedRuntimeConfig ??= parseRuntimeConfig(process.env);
  return cachedRuntimeConfig;
}

export function resetRuntimeConfigCacheForTests(): void {
  cachedRuntimeConfig = undefined;
}

function buildSafeRuntimeConfig(config: ParsedRuntimeEnvironment): RuntimeConfig {
  const environment = resolveEnvironment(config);
  const twilio = Object.freeze({
    accountSidConfigured: isTwilioAccountSid(config.TWILIO_ACCOUNT_SID),
    authTokenConfigured: isMinimumSecret(config.TWILIO_AUTH_TOKEN, 16),
    fromNumberConfigured: isE164(config.TWILIO_FROM_NUMBER),
    messagingServiceConfigured: isTwilioMessagingServiceSid(config.TWILIO_MESSAGING_SERVICE_SID),
    senderConfigured: isTwilioSenderConfigured(config)
  });
  const masterKeyConfigured = isEncryptionKey(config.SECRETS_MASTER_KEY);
  const backupEncryptionKeyConfigured = isEncryptionKey(config.BACKUP_ENCRYPTION_KEY);

  return Object.freeze({
    runtime: Object.freeze({
      environment,
      process: config.RUNTIME_PROCESS,
      demoMode: config.DEMO_MODE
    }),
    web: Object.freeze({
      appUrl: config.NEXT_PUBLIC_APP_URL,
      host: config.WEB_HOST,
      port: config.WEB_PORT,
      trustProxy: config.TRUST_PROXY
    }),
    database: Object.freeze({
      configured: Boolean(config.DATABASE_URL),
      usesLocalDefault: config.DATABASE_URL === localDatabaseUrl,
      rlsEnforced: config.DATABASE_RLS_ENFORCED
    }),
    worker: Object.freeze({
      enabled: config.WORKER_ENABLED,
      deploymentClass: config.WORKER_DEPLOYMENT_CLASS,
      concurrency: config.WORKER_CONCURRENCY,
      pollIntervalMs: config.WORKER_POLL_INTERVAL_MS
    }),
    provider: Object.freeze({
      name: config.MESSAGING_PROVIDER,
      liveMessagingEnabled: config.LIVE_MESSAGING_ENABLED,
      credentialsReady: twilio.accountSidConfigured && twilio.authTokenConfigured && twilio.senderConfigured,
      twilio
    }),
    queue: Object.freeze({
      backend: config.QUEUE_BACKEND,
      redisConfigured: Boolean(config.REDIS_URL)
    }),
    auth: Object.freeze({
      mode: config.DEMO_MODE ? "demo" : config.AUTH_PROVIDER,
      sessionSecretConfigured: isAuthSessionSecret(config.AUTH_SESSION_SECRET),
      throttleSecretConfigured: isAuthThrottleSecret(config.AUTH_THROTTLE_SECRET),
      bootstrapTokenConfigured: isValidAuthToken(config.BOOTSTRAP_TOKEN),
      sessionIdleMinutes: config.AUTH_SESSION_IDLE_MINUTES,
      sessionAbsoluteHours: config.AUTH_SESSION_ABSOLUTE_HOURS,
      oidcConfigured: Boolean(
        config.OIDC_ISSUER_URL && config.OIDC_CLIENT_ID && isMinimumSecret(config.OIDC_CLIENT_SECRET)
      )
    }),
    secrets: Object.freeze({
      masterKeyConfigured,
      apiKeyPepperConfigured: isMinimumSecret(config.API_KEY_PEPPER),
      backupEncryptionKeyConfigured
    }),
    retention: Object.freeze({
      messageBodyDays: config.MESSAGE_BODY_RETENTION_DAYS,
      mediaDays: config.MEDIA_RETENTION_DAYS,
      rawWebhookDays: config.RAW_WEBHOOK_RETENTION_DAYS,
      apiLogDays: config.API_LOG_RETENTION_DAYS,
      auditDays: config.AUDIT_RETENTION_DAYS,
      cleanupIntervalHours: config.RETENTION_CLEANUP_INTERVAL_HOURS
    }),
    backup: Object.freeze({
      enabled: config.BACKUP_ENABLED,
      directory: config.BACKUP_DIRECTORY,
      intervalHours: config.BACKUP_INTERVAL_HOURS,
      retentionDays: config.BACKUP_RETENTION_DAYS,
      offsiteConfigured: Boolean(config.BACKUP_OFFSITE_URL),
      requireOffsite: config.BACKUP_REQUIRE_OFFSITE,
      encryptionReady: backupEncryptionKeyConfigured
    })
  });
}

function resolveEnvironment(config: Pick<ParsedRuntimeEnvironment, "APP_ENV" | "NODE_ENV">): "local" | "production" {
  return config.APP_ENV === "production" || config.APP_ENV === "prod" || config.NODE_ENV === "production"
    ? "production"
    : "local";
}

function addIssue(context: z.RefinementCtx, path: string, message: string): void {
  context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
}

function hasProtocol(value: string, allowedProtocols: readonly string[]): boolean {
  try {
    return allowedProtocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isMinimumSecret(value: string | undefined, minimumLength = 32): boolean {
  return Boolean(value && value.length >= minimumLength);
}

function isAuthThrottleSecret(value: string | undefined): boolean {
  return Boolean(
    value &&
      value.length >= 32 &&
      value.length <= 256 &&
      Buffer.byteLength(value, "utf8") <= 512 &&
      !hasControlCharacter(value)
  );
}

function isAuthSessionSecret(value: string | undefined): boolean {
  return Boolean(
    value &&
      value.length >= 32 &&
      value.length <= 1_024 &&
      Buffer.byteLength(value, "utf8") <= 2_048 &&
      !hasControlCharacter(value)
  );
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => (character.codePointAt(0) ?? 0) < 32);
}

function isEncryptionKey(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  if (/^[a-fA-F0-9]{64}$/.test(value)) {
    return true;
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return false;
  }

  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}

function isTwilioAccountSid(value: string | undefined): boolean {
  return Boolean(value && /^AC[a-fA-F0-9]{32}$/.test(value));
}

function isTwilioMessagingServiceSid(value: string | undefined): boolean {
  return Boolean(value && /^MG[a-fA-F0-9]{32}$/.test(value));
}

function isE164(value: string | undefined): boolean {
  return Boolean(value && /^\+[1-9]\d{4,31}$/.test(value));
}

function isTwilioSenderConfigured(
  config: Pick<ParsedRuntimeEnvironment, "TWILIO_FROM_NUMBER" | "TWILIO_MESSAGING_SERVICE_SID">
): boolean {
  return isE164(config.TWILIO_FROM_NUMBER) || isTwilioMessagingServiceSid(config.TWILIO_MESSAGING_SERVICE_SID);
}
