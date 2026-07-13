import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getRuntimeConfig,
  parseRuntimeConfig,
  resetRuntimeConfigCacheForTests,
  RuntimeConfigError
} from "@/lib/env/runtime-config";

const sessionSecret = "session-secret-that-is-at-least-32-characters";
const throttleSecret = "throttle-secret-that-is-at-least-32-characters";
const apiKeyPepper = "api-key-pepper-that-is-at-least-32-characters";
const encryptionKey = Buffer.alloc(32, 7).toString("base64");
const backupEncryptionKey = Buffer.alloc(32, 9).toString("base64");
const twilioAccountSid = `AC${"1".repeat(32)}`;
const twilioMessagingServiceSid = `MG${"2".repeat(32)}`;
const twilioAuthToken = "twilio-auth-token-ready-value";

afterEach(() => {
  vi.unstubAllEnvs();
  resetRuntimeConfigCacheForTests();
});

describe("runtime configuration", () => {
  it("uses frozen demo-safe local defaults", () => {
    const config = parseRuntimeConfig({});

    expect(config).toMatchObject({
      runtime: { environment: "local", process: "web", demoMode: true },
      web: { appUrl: "http://localhost:3000", host: "0.0.0.0", port: 3000, trustProxy: false },
      database: { configured: true, usesLocalDefault: true, rlsEnforced: false },
      worker: { enabled: false, deploymentClass: "local-demo", concurrency: 5, pollIntervalMs: 1_000 },
      provider: { name: "dummy", liveMessagingEnabled: false, credentialsReady: false },
      queue: { backend: "database", redisConfigured: false },
      auth: {
        mode: "demo",
        sessionSecretConfigured: false,
        throttleSecretConfigured: false,
        sessionIdleMinutes: 30,
        sessionAbsoluteHours: 24,
        oidcConfigured: false
      },
      backup: {
        enabled: false,
        directory: "./backups",
        intervalHours: 24,
        retentionDays: 30,
        offsiteConfigured: false,
        requireOffsite: false,
        encryptionReady: false
      }
    });
    expect(config.retention).toEqual({
      messageBodyDays: 365,
      mediaDays: 90,
      rawWebhookDays: 30,
      apiLogDays: 30,
      auditDays: 2_555,
      cleanupIntervalHours: 24
    });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.provider.twilio)).toBe(true);
  });

  it("does not parse process.env until the lazy accessor is called", async () => {
    vi.stubEnv("DEMO_MODE", "not-a-boolean");
    vi.resetModules();

    const imported = await import("@/lib/env/runtime-config");

    expect(() => imported.getRuntimeConfig()).toThrow(imported.RuntimeConfigError);
  });

  it("rejects live providers and live messaging in demo mode", () => {
    const error = captureConfigError({
      DEMO_MODE: "true",
      MESSAGING_PROVIDER: "twilio",
      LIVE_MESSAGING_ENABLED: "true"
    });

    expect(error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "MESSAGING_PROVIDER", message: expect.stringContaining("dummy") }),
        expect.objectContaining({ path: "LIVE_MESSAGING_ENABLED", message: expect.stringContaining("Demo mode") })
      ])
    );
  });

  it("requires session and throttle-secret readiness for local auth in every environment", () => {
    const error = captureConfigError({ DEMO_MODE: "false", AUTH_PROVIDER: "local" });

    expect(error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "AUTH_SESSION_SECRET", message: expect.stringContaining("32 characters") }),
        expect.objectContaining({ path: "AUTH_THROTTLE_SECRET", message: expect.stringContaining("32 to 256") })
      ])
    );

    const config = parseRuntimeConfig({
      DEMO_MODE: "false",
      AUTH_PROVIDER: "local",
      AUTH_SESSION_SECRET: sessionSecret,
      AUTH_THROTTLE_SECRET: throttleSecret
    });
    expect(config.runtime.environment).toBe("local");
    expect(config.auth).toMatchObject({
      mode: "local",
      sessionSecretConfigured: true,
      throttleSecretConfigured: true
    });
  });

  it("fails closed for built-in local auth under Next development mode", () => {
    const error = captureConfigError({
      NODE_ENV: "development",
      DEMO_MODE: "false",
      AUTH_PROVIDER: "local",
      AUTH_SESSION_SECRET: sessionSecret,
      AUTH_THROTTLE_SECRET: throttleSecret
    });

    expect(error.issues).toContainEqual(
      expect.objectContaining({
        path: "AUTH_PROVIDER",
        message: expect.stringContaining("production build")
      })
    );
    expect(() =>
      parseRuntimeConfig({
        NODE_ENV: "production",
        DEMO_MODE: "false",
        AUTH_PROVIDER: "local",
        AUTH_SESSION_SECRET: sessionSecret,
        AUTH_THROTTLE_SECRET: throttleSecret,
        TRUST_PROXY: "true",
        DATABASE_RLS_ENFORCED: "true",
        SECRETS_MASTER_KEY: encryptionKey,
        API_KEY_PEPPER: apiKeyPepper
      })
    ).not.toThrow();
  });

  it("requires standalone public-integration cryptographic readiness in production", () => {
    const error = captureConfigError({ APP_ENV: "production" });
    expect(error.issues).toContainEqual(
      expect.objectContaining({ path: "SECRETS_MASTER_KEY", message: expect.stringContaining("public integrations") })
    );
    expect(error.issues).toContainEqual(
      expect.objectContaining({ path: "API_KEY_PEPPER", message: expect.stringContaining("public API") })
    );
  });

  it("validates the exact throttle-secret value at 32 to 256 characters without mutating it", () => {
    const exactSecret = ` ${"t".repeat(30)} `;
    const environment = {
      DEMO_MODE: "false",
      AUTH_PROVIDER: "local",
      AUTH_SESSION_SECRET: sessionSecret,
      AUTH_THROTTLE_SECRET: exactSecret
    };

    expect(parseRuntimeConfig(environment).auth.throttleSecretConfigured).toBe(true);
    expect(environment.AUTH_THROTTLE_SECRET).toBe(exactSecret);

    for (const invalidSecret of ["t".repeat(31), "t".repeat(257), `${"t".repeat(31)}\n`]) {
      const error = captureConfigError({
        DEMO_MODE: "false",
        AUTH_PROVIDER: "local",
        AUTH_SESSION_SECRET: sessionSecret,
        AUTH_THROTTLE_SECRET: invalidSecret
      });
      expect(error.issues).toContainEqual(
        expect.objectContaining({ path: "AUTH_THROTTLE_SECRET" })
      );
      expect(JSON.stringify(error.issues)).not.toContain(invalidSecret);
    }
  });

  it("validates and preserves the exact session-secret value without trimming it", () => {
    const exactSecret = ` ${"s".repeat(30)} `;
    const environment = {
      DEMO_MODE: "false",
      AUTH_PROVIDER: "local",
      AUTH_SESSION_SECRET: exactSecret,
      AUTH_THROTTLE_SECRET: throttleSecret
    };

    expect(parseRuntimeConfig(environment).auth.sessionSecretConfigured).toBe(true);
    expect(environment.AUTH_SESSION_SECRET).toBe(exactSecret);
    for (const invalidSecret of ["s".repeat(31), "s".repeat(1_025), `${"s".repeat(31)}\n`]) {
      const error = captureConfigError({
        DEMO_MODE: "false",
        AUTH_PROVIDER: "local",
        AUTH_SESSION_SECRET: invalidSecret,
        AUTH_THROTTLE_SECRET: throttleSecret
      });
      expect(error.issues).toContainEqual(expect.objectContaining({ path: "AUTH_SESSION_SECRET" }));
      expect(JSON.stringify(error.issues)).not.toContain(invalidSecret);
    }
  });

  it("fails closed when the reserved OIDC adapter is selected", () => {
    const error = captureConfigError({
      APP_ENV: "production",
      DEMO_MODE: "false",
      AUTH_PROVIDER: "oidc"
    });
    expect(error.issues).toContainEqual(expect.objectContaining({ path: "AUTH_PROVIDER" }));

    const configuredError = captureConfigError({
      APP_ENV: "production",
      DEMO_MODE: "false",
      AUTH_PROVIDER: "oidc",
      OIDC_ISSUER_URL: "https://identity.example.test",
      OIDC_CLIENT_ID: "signalstack",
      OIDC_CLIENT_SECRET: sessionSecret
    });
    expect(configuredError.issues).toContainEqual(
      expect.objectContaining({ path: "AUTH_PROVIDER", message: expect.stringContaining("not implemented") })
    );
  });

  it("requires stored-credential encryption and an HTTPS callback origin for live messaging", () => {
    const error = captureConfigError({
      APP_ENV: "production",
      DEMO_MODE: "false",
      AUTH_PROVIDER: "local",
      AUTH_SESSION_SECRET: sessionSecret,
      AUTH_THROTTLE_SECRET: throttleSecret,
      TRUST_PROXY: "true",
      DATABASE_RLS_ENFORCED: "true",
      MESSAGING_PROVIDER: "twilio",
      LIVE_MESSAGING_ENABLED: "true"
    });

    expect(error.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(["SECRETS_MASTER_KEY", "NEXT_PUBLIC_APP_URL"])
    );
    expect(error.issues.map((issue) => issue.path)).not.toEqual(
      expect.arrayContaining(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"])
    );

    expect(() => parseRuntimeConfig({
      APP_ENV: "production",
      DEMO_MODE: "false",
      AUTH_PROVIDER: "local",
      AUTH_SESSION_SECRET: sessionSecret,
      AUTH_THROTTLE_SECRET: throttleSecret,
      TRUST_PROXY: "true",
      DATABASE_RLS_ENFORCED: "true",
      MESSAGING_PROVIDER: "twilio",
      LIVE_MESSAGING_ENABLED: "true",
      NEXT_PUBLIC_APP_URL: "https://sms.example.test",
      SECRETS_MASTER_KEY: encryptionKey,
      API_KEY_PEPPER: apiKeyPepper
    })).not.toThrow();
  });

  it("requires trusted ingress for production built-in auth", () => {
    const error = captureConfigError({
      APP_ENV: "production",
      DEMO_MODE: "false",
      AUTH_PROVIDER: "local",
      AUTH_SESSION_SECRET: sessionSecret,
      AUTH_THROTTLE_SECRET: throttleSecret,
      TRUST_PROXY: "false"
    });

    expect(error.issues).toContainEqual(
      expect.objectContaining({ path: "TRUST_PROXY", message: expect.stringContaining("trusted ingress") })
    );
  });

  it("returns only Twilio and secret readiness, never raw secret material", () => {
    const config = parseRuntimeConfig({
      APP_ENV: "production",
      DEMO_MODE: "false",
      AUTH_PROVIDER: "local",
      AUTH_SESSION_SECRET: sessionSecret,
      AUTH_THROTTLE_SECRET: throttleSecret,
      TRUST_PROXY: "true",
      DATABASE_RLS_ENFORCED: "true",
      MESSAGING_PROVIDER: "twilio",
      LIVE_MESSAGING_ENABLED: "true",
      NEXT_PUBLIC_APP_URL: "https://sms.example.test",
      TWILIO_ACCOUNT_SID: twilioAccountSid,
      TWILIO_AUTH_TOKEN: twilioAuthToken,
      TWILIO_MESSAGING_SERVICE_SID: twilioMessagingServiceSid,
      SECRETS_MASTER_KEY: encryptionKey,
      API_KEY_PEPPER: apiKeyPepper
    });

    expect(config.provider).toMatchObject({
      name: "twilio",
      liveMessagingEnabled: true,
      credentialsReady: true,
      twilio: {
        accountSidConfigured: true,
        authTokenConfigured: true,
        fromNumberConfigured: false,
        messagingServiceConfigured: true,
        senderConfigured: true
      }
    });
    expect(config.secrets).toMatchObject({ masterKeyConfigured: true, apiKeyPepperConfigured: true });

    const serialized = JSON.stringify(config);
    for (const secret of [sessionSecret, throttleSecret, twilioAccountSid, twilioAuthToken, twilioMessagingServiceSid, encryptionKey, apiKeyPepper]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("accepts the M5 direct worker class without authorizing the reserved campaign class", () => {
    const config = parseRuntimeConfig({ WORKER_DEPLOYMENT_CLASS: "production-live-direct" });
    expect(config.worker.deploymentClass).toBe("production-live-direct");
  });

  it("requires Redis when BullMQ is selected and never returns the Redis URL", () => {
    const error = captureConfigError({ QUEUE_BACKEND: "bullmq" });
    expect(error.issues).toContainEqual(expect.objectContaining({ path: "REDIS_URL" }));

    const redisUrl = "rediss://queue-user:queue-secret@redis.example.test:6380/0";
    const config = parseRuntimeConfig({ QUEUE_BACKEND: "bullmq", REDIS_URL: redisUrl });
    expect(config.queue).toEqual({ backend: "bullmq", redisConfigured: true });
    expect(JSON.stringify(config)).not.toContain(redisUrl);
    expect(JSON.stringify(config)).not.toContain("queue-secret");
  });

  it("requires fail-closed RLS in production and keeps owner credentials out of the process", () => {
    const missingBoundary = captureConfigError({ APP_ENV: "production" });
    expect(missingBoundary.issues).toContainEqual(
      expect.objectContaining({ path: "DATABASE_RLS_ENFORCED" })
    );

    const sharedCredential = "postgresql://runtime:secret@db.example.test/signalstack";
    const sharedError = captureConfigError({
      DATABASE_URL: sharedCredential,
      MIGRATION_DATABASE_URL: sharedCredential
    });
    expect(sharedError.issues).toContainEqual(
      expect.objectContaining({ path: "MIGRATION_DATABASE_URL", message: expect.stringContaining("distinct") })
    );

    const productionOwnerLeak = captureConfigError({
      APP_ENV: "production",
      DATABASE_RLS_ENFORCED: "true",
      MIGRATION_DATABASE_URL: "postgresql://owner:secret@db.example.test/signalstack"
    });
    expect(productionOwnerLeak.issues).toContainEqual(
      expect.objectContaining({
        path: "MIGRATION_DATABASE_URL",
        message: expect.stringContaining("running production process")
      })
    );
  });

  it("rejects production demo mode unless a public demo is explicitly acknowledged", () => {
    // DEMO_MODE defaults to true, so an operator who configures production but forgets to
    // disable demo mode must fail closed instead of serving anonymous owner sessions.
    const forgotten = captureConfigError({ APP_ENV: "production", DATABASE_RLS_ENFORCED: "true" });
    expect(forgotten.issues).toContainEqual(
      expect.objectContaining({
        path: "DEMO_MODE",
        message: expect.stringContaining("DEMO_MODE=false")
      })
    );

    const explicit = captureConfigError({
      APP_ENV: "production",
      DATABASE_RLS_ENFORCED: "true",
      DEMO_MODE: "true"
    });
    expect(explicit.issues).toContainEqual(expect.objectContaining({ path: "DEMO_MODE" }));

    expect(() =>
      parseRuntimeConfig({
        APP_ENV: "production",
        DATABASE_RLS_ENFORCED: "true",
        DEMO_MODE: "true",
        ALLOW_PRODUCTION_DEMO: "true",
        SECRETS_MASTER_KEY: encryptionKey,
        API_KEY_PEPPER: apiKeyPepper
      })
    ).not.toThrow();

    expect(() =>
      parseRuntimeConfig({
        APP_ENV: "production",
        DATABASE_RLS_ENFORCED: "true",
        DEMO_MODE: "false",
        AUTH_PROVIDER: "local",
        AUTH_SESSION_SECRET: sessionSecret,
        AUTH_THROTTLE_SECRET: throttleSecret,
        TRUST_PROXY: "true",
        SECRETS_MASTER_KEY: encryptionKey,
        API_KEY_PEPPER: apiKeyPepper
      })
    ).not.toThrow();
  });

  it("validates encrypted backup and off-site readiness without returning keys or URLs", () => {
    const missingKey = captureConfigError({ BACKUP_ENABLED: "true" });
    expect(missingKey.issues).toContainEqual(expect.objectContaining({ path: "BACKUP_ENCRYPTION_KEY" }));

    const offsiteUrl = "s3://backup-user:backup-secret@archive.example.test/signalstack";
    const config = parseRuntimeConfig({
      BACKUP_ENABLED: "true",
      BACKUP_ENCRYPTION_KEY: backupEncryptionKey,
      BACKUP_REQUIRE_OFFSITE: "true",
      BACKUP_OFFSITE_URL: offsiteUrl,
      BACKUP_INTERVAL_HOURS: "12",
      BACKUP_RETENTION_DAYS: "45"
    });
    expect(config.backup).toMatchObject({
      enabled: true,
      intervalHours: 12,
      retentionDays: 45,
      offsiteConfigured: true,
      requireOffsite: true,
      encryptionReady: true
    });
    expect(JSON.stringify(config)).not.toContain(backupEncryptionKey);
    expect(JSON.stringify(config)).not.toContain(offsiteUrl);
    expect(JSON.stringify(config)).not.toContain("backup-secret");
  });

  it("enforces bounded retention and session lifetimes", () => {
    const retentionError = captureConfigError({ MESSAGE_BODY_RETENTION_DAYS: "3651" });
    expect(retentionError.issues).toContainEqual(expect.objectContaining({ path: "MESSAGE_BODY_RETENTION_DAYS" }));

    const shortIdleError = captureConfigError({ AUTH_SESSION_IDLE_MINUTES: "9" });
    expect(shortIdleError.issues).toContainEqual(
      expect.objectContaining({
        path: "AUTH_SESSION_IDLE_MINUTES",
        message: expect.stringContaining("10")
      })
    );

    const sessionError = captureConfigError({
      AUTH_SESSION_IDLE_MINUTES: "120",
      AUTH_SESSION_ABSOLUTE_HOURS: "2"
    });
    expect(sessionError.issues).toContainEqual(expect.objectContaining({ path: "AUTH_SESSION_ABSOLUTE_HOURS" }));
  });

  it("caches successful process configuration only after first access", () => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("WEB_PORT", "3100");
    const first = getRuntimeConfig();

    vi.stubEnv("WEB_PORT", "3200");
    const second = getRuntimeConfig();

    expect(first).toBe(second);
    expect(second.web.port).toBe(3100);
  });

  it("does not expose a supplied secret in validation errors", () => {
    const rawSecret = "raw-secret-that-must-never-appear-in-errors";
    const error = captureConfigError({
      APP_ENV: "production",
      DEMO_MODE: "false",
      AUTH_PROVIDER: "local",
      AUTH_SESSION_SECRET: rawSecret,
      AUTH_THROTTLE_SECRET: rawSecret,
      MESSAGING_PROVIDER: "twilio",
      LIVE_MESSAGING_ENABLED: "true",
      TWILIO_AUTH_TOKEN: rawSecret
    });

    expect(error.message).toBe("Invalid runtime configuration.");
    expect(JSON.stringify(error.issues)).not.toContain(rawSecret);
  });

  it("requires distinct session and throttle secrets for local auth", () => {
    const sharedSecret = "shared-auth-secret-0123456789abcdef";
    const error = captureConfigError({
      APP_ENV: "local",
      DEMO_MODE: "false",
      AUTH_PROVIDER: "local",
      AUTH_SESSION_SECRET: sharedSecret,
      AUTH_THROTTLE_SECRET: sharedSecret,
      NODE_ENV: "test"
    });

    expect(error.issues).toContainEqual(
      expect.objectContaining({
        path: "AUTH_THROTTLE_SECRET",
        message: expect.stringContaining("distinct")
      })
    );
    expect(JSON.stringify(error.issues)).not.toContain(sharedSecret);
  });

  it("does not treat whitespace padding as secret separation", () => {
    const paddedSharedSecret = ` ${"k".repeat(30)} `;
    const error = captureConfigError({
      DEMO_MODE: "false",
      AUTH_PROVIDER: "local",
      AUTH_SESSION_SECRET: paddedSharedSecret,
      AUTH_THROTTLE_SECRET: paddedSharedSecret
    });
    expect(error.issues).toContainEqual(
      expect.objectContaining({ path: "AUTH_THROTTLE_SECRET", message: expect.stringContaining("distinct") })
    );
    expect(JSON.stringify(error.issues)).not.toContain(paddedSharedSecret);
  });
});

function captureConfigError(environment: Record<string, string | undefined>): RuntimeConfigError {
  try {
    parseRuntimeConfig(environment);
  } catch (error) {
    expect(error).toBeInstanceOf(RuntimeConfigError);
    return error as RuntimeConfigError;
  }

  throw new Error("Expected runtime configuration parsing to fail.");
}
