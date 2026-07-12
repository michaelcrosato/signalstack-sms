import { randomUUID } from "node:crypto";
import { AuthThrottleScope } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAuthThrottleService,
  deriveAuthThrottleKeyHash
} from "@/lib/auth/auth-throttle";
import { prisma } from "@/lib/db/prisma";

const run = process.env.RUN_DB_TESTS === "true";

describe.runIf(run)("authentication throttle on Postgres", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const secret = `postgres-auth-throttle-secret-${suffix}-0123456789`;
  const email = `throttle-${suffix}@example.test`;
  const keyHash = deriveAuthThrottleKeyHash({
    secret,
    scope: AuthThrottleScope.LOGIN_EMAIL,
    evidence: email
  });
  const service = createAuthThrottleService({
    secret,
    policies: {
      [AuthThrottleScope.LOGIN_EMAIL]: {
        limit: 5,
        windowMs: 60_000,
        blockDurationMs: 60_000
      }
    }
  });

  beforeAll(cleanup);
  afterAll(cleanup);

  it("atomically caps concurrent attempts and persists only the deterministic HMAC key", async () => {
    const decisions = await Promise.all(
      Array.from({ length: 24 }, () =>
        service.consume({ scope: AuthThrottleScope.LOGIN_EMAIL, evidence: email })
      )
    );

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(5);
    expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(19);

    const row = await prisma.authThrottle.findUniqueOrThrow({
      where: {
        scope_keyHash: {
          scope: AuthThrottleScope.LOGIN_EMAIL,
          keyHash
        }
      }
    });
    expect(row).toMatchObject({ attempts: 5, keyHash });
    expect(row.blockedUntil?.getTime()).toBeGreaterThan(Date.now());
    expect(JSON.stringify(row)).not.toContain(email);
    expect(keyHash).not.toContain(email);
  });

  async function cleanup() {
    await prisma.authThrottle.deleteMany({
      where: { scope: AuthThrottleScope.LOGIN_EMAIL, keyHash }
    });
  }
});
