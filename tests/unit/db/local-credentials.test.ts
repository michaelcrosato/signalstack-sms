import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/crypto";
import {
  createPrismaLocalCredentialService,
  createPrismaLocalCredentialStore
} from "@/lib/auth/local-credential-store";
import { createLocalCredentialService } from "@/lib/auth/local-credentials";
import { prisma } from "@/lib/db/prisma";

const run = process.env.RUN_DB_TESTS === "true";

describe.runIf(run)("built-in local credential service on Postgres", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const email = `bootstrap-${suffix}@example.test`;
  const orgSlug = `bootstrap-${suffix}`;
  const bootstrapToken = `bootstrap-${suffix}-0123456789abcdefghijklmnopqrstuvwxyz`;
  const password = "correct horse battery staple";

  beforeAll(cleanup);
  afterAll(cleanup);

  it("atomically bootstraps one owner and authenticates without exposing credential material", async () => {
    const service = await createPrismaLocalCredentialService({
      bootstrapToken,
      maximumFailedAttempts: 2,
      lockDurationMs: 60_000
    });

    const [first, second] = await Promise.all([
      service.bootstrapFirstOwner({
        bootstrapToken,
        email: email.toUpperCase(),
        displayName: "Bootstrap Owner",
        password,
        organizationName: "Bootstrap Organization",
        organizationSlug: orgSlug,
        timezone: "America/Vancouver"
      }),
      service.bootstrapFirstOwner({
        bootstrapToken,
        email: email.toUpperCase(),
        displayName: "Bootstrap Owner",
        password,
        organizationName: "Bootstrap Organization",
        organizationSlug: orgSlug,
        timezone: "America/Vancouver"
      })
    ]);

    expect([first, second].filter((result) => result.created)).toHaveLength(1);
    expect([first, second]).toEqual(
      expect.arrayContaining([{ created: false, code: "BOOTSTRAP_CLOSED" }])
    );

    const user = await prisma.appUser.findUniqueOrThrow({
      where: { normalizedEmail: email },
      include: { localCredential: true, memberships: true }
    });
    expect(user).toMatchObject({
      email,
      normalizedEmail: email,
      clerkUserId: null,
      disabledAt: null,
      authVersion: 1
    });
    expect(user.localCredential?.passwordHash).not.toContain(password);
    expect(user.memberships).toHaveLength(1);

    const authenticated = await service.authenticate({ email: email.toUpperCase(), password });
    expect(authenticated).toEqual({
      authenticated: true,
      user: {
        id: user.id,
        email,
        displayName: "Bootstrap Owner",
        authVersion: 1
      }
    });
    expect(JSON.stringify(authenticated)).not.toContain(password);
    expect(JSON.stringify(authenticated)).not.toContain("passwordHash");
  });

  it("locks repeated wrong passwords and resets state after the bounded lock expires", async () => {
    const service = await createPrismaLocalCredentialService({
      bootstrapToken,
      maximumFailedAttempts: 2,
      lockDurationMs: 60_000
    });

    await expect(
      service.authenticate({ email, password: "wrong password number one" })
    ).resolves.toEqual({ authenticated: false, code: "AUTHENTICATION_DENIED" });
    await expect(
      service.authenticate({ email, password: "wrong password number two" })
    ).resolves.toEqual({ authenticated: false, code: "AUTHENTICATION_DENIED" });

    const locked = await prisma.localCredential.findFirstOrThrow({ where: { user: { normalizedEmail: email } } });
    expect(locked.failedAttempts).toBe(2);
    expect(locked.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
    await expect(service.authenticate({ email, password })).resolves.toEqual({
      authenticated: false,
      code: "AUTHENTICATION_DENIED"
    });

    await prisma.localCredential.update({
      where: { id: locked.id },
      data: { lockedUntil: new Date(Date.now() - 1) }
    });
    await expect(
      service.authenticate({ email, password: "first wrong password after lock expiry" })
    ).resolves.toEqual({ authenticated: false, code: "AUTHENTICATION_DENIED" });
    await expect(
      prisma.localCredential.findUniqueOrThrow({ where: { id: locked.id } })
    ).resolves.toMatchObject({ failedAttempts: 1, lockedUntil: null });

    await expect(service.authenticate({ email, password })).resolves.toMatchObject({ authenticated: true });
    await expect(prisma.localCredential.findUniqueOrThrow({ where: { id: locked.id } })).resolves.toMatchObject({
      failedAttempts: 0,
      lockedUntil: null
    });
  });

  it("does not apply an old-password failure after a concurrent credential reset", async () => {
    const observed = await prisma.localCredential.findFirstOrThrow({
      where: { user: { normalizedEmail: email } }
    });
    let signalVerificationStarted!: () => void;
    const verificationStarted = new Promise<void>((resolve) => {
      signalVerificationStarted = resolve;
    });
    let releaseVerification!: () => void;
    const verificationGate = new Promise<void>((resolve) => {
      releaseVerification = resolve;
    });
    const service = createLocalCredentialService({
      store: createPrismaLocalCredentialStore(prisma),
      authenticationFallbackHash: observed.passwordHash,
      crypto: {
        async verifyPassword(candidate, encodedHash) {
          const matches = await verifyPassword(candidate, encodedHash);
          signalVerificationStarted();
          await verificationGate;
          return matches;
        }
      }
    });

    const staleAttempt = service.authenticate({
      email,
      password: "wrong password racing the reset"
    });
    await verificationStarted;

    const replacementPasswordChangedAt = new Date(Date.now() + 1_000);
    const replacementPasswordHash = await hashPassword("replacement password after operator reset");
    try {
      await prisma.localCredential.update({
        where: { id: observed.id },
        data: {
          passwordHash: replacementPasswordHash,
          passwordChangedAt: replacementPasswordChangedAt,
          failedAttempts: 0,
          lockedUntil: null
        }
      });
    } finally {
      releaseVerification();
    }

    await expect(staleAttempt).resolves.toEqual({
      authenticated: false,
      code: "AUTHENTICATION_DENIED"
    });
    await expect(
      prisma.localCredential.findUniqueOrThrow({ where: { id: observed.id } })
    ).resolves.toMatchObject({
      passwordHash: replacementPasswordHash,
      passwordChangedAt: replacementPasswordChangedAt,
      failedAttempts: 0,
      lockedUntil: null
    });
  });

  async function cleanup() {
    await prisma.organization.deleteMany({ where: { slug: orgSlug } });
    await prisma.appUser.deleteMany({ where: { normalizedEmail: email } });
  }
});
