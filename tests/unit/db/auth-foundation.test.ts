import { createHash, randomUUID } from "node:crypto";
import { AuthThrottleScope, AuthTokenType, MembershipRole } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";

// Postgres-backed migration/schema proof. The default unit suite skips it so
// local tests never require infrastructure. Run explicitly with:
//   RUN_DB_TESTS=true DATABASE_URL=postgresql://... npx vitest run tests/unit/db/auth-foundation.test.ts
const run = process.env.RUN_DB_TESTS === "true";

describe.runIf(run)("built-in auth foundation database invariants", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const future = new Date("2030-01-01T00:00:00.000Z");

  afterAll(async () => {
    // These targeted deletes also clean up a row if a uniqueness assertion
    // unexpectedly succeeds before the test fails. Related rows otherwise
    // disappear through the foreign-key cascades exercised below.
    await prisma.authThrottle.deleteMany({
      where: { keyHash: testTokenHash(`auth-throttle-key-${suffix}`) }
    });
    await prisma.authToken.deleteMany({ where: { tokenHash: { contains: suffix } } });
    await prisma.authSession.deleteMany({ where: { tokenHash: { contains: suffix } } });
    await prisma.organization.deleteMany({ where: { slug: { contains: suffix } } });
    await prisma.appUser.deleteMany({ where: { normalizedEmail: { contains: suffix } } });
  });

  it("enforces normalized email and one local credential per user", async () => {
    const normalizedEmail = `case-${suffix}@example.test`;

    await expect(
      prisma.appUser.create({
        data: {
          email: `Mismatch-${suffix}@Example.Test`,
          normalizedEmail: `different-${suffix}@example.test`
        }
      })
    ).rejects.toThrow("AppUser_normalizedEmail_matches_email_check");

    const user = await prisma.appUser.create({
      data: {
        email: `Case-${suffix}@Example.Test`,
        normalizedEmail,
        displayName: "Auth Case User"
      }
    });

    await expect(
      prisma.appUser.create({
        data: {
          // PostgreSQL's existing email uniqueness does not collide with the
          // differently cased value; normalizedEmail is the relevant key.
          email: normalizedEmail,
          normalizedEmail,
          displayName: "Duplicate Normalized User"
        }
      })
    ).rejects.toMatchObject({ code: "P2002" });

    const credential = await prisma.localCredential.create({
      data: {
        userId: user.id,
        passwordHash: `test-password-hash-${suffix}`
      }
    });
    expect(credential).toMatchObject({ userId: user.id, failedAttempts: 0, lockedUntil: null });

    await expect(
      prisma.localCredential.update({
        where: { id: credential.id },
        data: { failedAttempts: -1 }
      })
    ).rejects.toThrow("LocalCredential_failedAttempts_check");

    await expect(
      prisma.localCredential.create({
        data: {
          userId: user.id,
          passwordHash: `second-test-password-hash-${suffix}`
        }
      })
    ).rejects.toMatchObject({ code: "P2002" });

    await prisma.appUser.delete({ where: { id: user.id } });
    await expect(prisma.localCredential.findUnique({ where: { id: credential.id } })).resolves.toBeNull();
  });

  it("enforces bearer-token and scoped throttle uniqueness", async () => {
    const user = await prisma.appUser.create({
      data: {
        email: `token-${suffix}@example.test`,
        normalizedEmail: `token-${suffix}@example.test`
      }
    });
    const org = await prisma.organization.create({
      data: { name: "Auth Token Organization", slug: `auth-token-${suffix}` }
    });
    await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, role: MembershipRole.OWNER }
    });
    const tokenHash = testTokenHash(`auth-token-hash-${suffix}`);

    await prisma.authToken.create({
      data: {
        type: AuthTokenType.PASSWORD_RESET,
        tokenHash,
        userId: user.id,
        expiresAt: future
      }
    });

    await expect(
      prisma.authToken.create({
        data: {
          type: AuthTokenType.PASSWORD_RESET,
          tokenHash: testTokenHash(`auth-token-org-reset-${suffix}`),
          userId: user.id,
          orgId: org.id,
          email: user.normalizedEmail,
          issuedByUserId: user.id,
          expiresAt: future
        }
      })
    ).rejects.toThrow("AuthToken_shape_check");

    await expect(
      prisma.authToken.create({
        data: {
          type: AuthTokenType.INVITE,
          tokenHash,
          orgId: org.id,
          email: `invite-${suffix}@example.test`,
          role: MembershipRole.MEMBER,
          issuedByUserId: user.id,
          expiresAt: future
        }
      })
    ).rejects.toMatchObject({ code: "P2002" });

    const keyHash = testTokenHash(`auth-throttle-key-${suffix}`);
    const emailThrottle = await prisma.authThrottle.create({
      data: { scope: AuthThrottleScope.LOGIN_EMAIL, keyHash }
    });
    expect(emailThrottle).toMatchObject({ attempts: 0, blockedUntil: null });

    await expect(
      prisma.authThrottle.create({
        data: { scope: AuthThrottleScope.LOGIN_EMAIL, keyHash }
      })
    ).rejects.toMatchObject({ code: "P2002" });

    await expect(
      prisma.authThrottle.create({
        data: { scope: AuthThrottleScope.LOGIN_NETWORK, keyHash }
      })
    ).resolves.toMatchObject({ scope: AuthThrottleScope.LOGIN_NETWORK, keyHash });
  });

  it("keeps two-organization sessions related correctly and applies auth cascades", async () => {
    const user = await prisma.appUser.create({
      data: {
        email: `session-${suffix}@example.test`,
        normalizedEmail: `session-${suffix}@example.test`
      }
    });
    const issuer = await prisma.appUser.create({
      data: {
        email: `issuer-${suffix}@example.test`,
        normalizedEmail: `issuer-${suffix}@example.test`
      }
    });
    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({
        data: { name: "Auth Session Organization A", slug: `auth-session-a-${suffix}` }
      }),
      prisma.organization.create({
        data: { name: "Auth Session Organization B", slug: `auth-session-b-${suffix}` }
      })
    ]);

    await prisma.membership.createMany({
      data: [
        { userId: user.id, orgId: orgA.id, role: MembershipRole.OWNER },
        { userId: user.id, orgId: orgB.id, role: MembershipRole.ADMIN },
        { userId: issuer.id, orgId: orgA.id, role: MembershipRole.ADMIN }
      ]
    });
    const credential = await prisma.localCredential.create({
      data: { userId: user.id, passwordHash: `session-user-password-hash-${suffix}` }
    });
    const sessionAHash = testTokenHash(`auth-session-a-hash-${suffix}`);
    const sessionBHash = testTokenHash(`auth-session-b-hash-${suffix}`);
    const [sessionA, sessionB] = await Promise.all([
      prisma.authSession.create({
        data: {
          tokenHash: sessionAHash,
          userId: user.id,
          orgId: orgA.id,
          authVersion: user.authVersion,
          idleExpiresAt: future,
          absoluteExpiresAt: future
        }
      }),
      prisma.authSession.create({
        data: {
          tokenHash: sessionBHash,
          userId: user.id,
          orgId: orgB.id,
          authVersion: user.authVersion,
          idleExpiresAt: future,
          absoluteExpiresAt: future
        }
      })
    ]);

    const sessions = await prisma.authSession.findMany({
      where: { userId: user.id },
      orderBy: { tokenHash: "asc" },
      include: { org: true, user: true }
    });
    const expectedSessionRelations = [
      [sessionAHash, orgA.id, user.id],
      [sessionBHash, orgB.id, user.id]
    ].sort(([left], [right]) => left.localeCompare(right));
    const actualSessionRelations = sessions
      .map((session) => [session.tokenHash, session.org.id, session.user.id])
      .sort(([left], [right]) => left.localeCompare(right));
    expect(actualSessionRelations).toEqual(expectedSessionRelations);

    await expect(
      prisma.authSession.create({
        data: {
          tokenHash: sessionAHash,
          userId: user.id,
          orgId: orgB.id,
          authVersion: user.authVersion,
          idleExpiresAt: future,
          absoluteExpiresAt: future
        }
      })
    ).rejects.toMatchObject({ code: "P2002" });

    const orgAToken = await prisma.authToken.create({
      data: {
        type: AuthTokenType.INVITE,
        tokenHash: testTokenHash(`auth-org-a-token-${suffix}`),
        userId: user.id,
        orgId: orgA.id,
        email: user.normalizedEmail,
        role: MembershipRole.ADMIN,
        issuedByUserId: issuer.id,
        expiresAt: future
      }
    });
    const orgBToken = await prisma.authToken.create({
      data: {
        type: AuthTokenType.PASSWORD_RESET,
        tokenHash: testTokenHash(`auth-org-b-token-${suffix}`),
        userId: user.id,
        expiresAt: future
      }
    });

    await prisma.appUser.delete({ where: { id: issuer.id } });
    await expect(prisma.authToken.findUniqueOrThrow({ where: { id: orgAToken.id } })).resolves.toMatchObject({
      orgId: orgA.id,
      issuedByUserId: null
    });
    await expect(prisma.authToken.findUniqueOrThrow({ where: { id: orgBToken.id } })).resolves.toMatchObject({
      userId: user.id,
      orgId: null,
      issuedByUserId: null
    });

    await prisma.organization.delete({ where: { id: orgA.id } });
    await expect(prisma.authSession.findUnique({ where: { id: sessionA.id } })).resolves.toBeNull();
    await expect(prisma.authToken.findUnique({ where: { id: orgAToken.id } })).resolves.toBeNull();
    await expect(prisma.authSession.findUnique({ where: { id: sessionB.id } })).resolves.toMatchObject({
      userId: user.id,
      orgId: orgB.id
    });

    await prisma.appUser.delete({ where: { id: user.id } });
    await expect(prisma.localCredential.findUnique({ where: { id: credential.id } })).resolves.toBeNull();
    await expect(prisma.authSession.findUnique({ where: { id: sessionB.id } })).resolves.toBeNull();
    await expect(prisma.authToken.findUnique({ where: { id: orgBToken.id } })).resolves.toBeNull();
  });
});

function testTokenHash(seed: string) {
  return createHash("sha256").update(seed, "utf8").digest("base64url");
}
