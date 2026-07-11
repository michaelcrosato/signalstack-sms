-- Keep authentication state valid even if a future writer bypasses the TypeScript services.
ALTER TABLE "AppUser"
  ADD CONSTRAINT "AppUser_authVersion_check"
  CHECK ("authVersion" >= 1);

ALTER TABLE "LocalCredential"
  ADD CONSTRAINT "LocalCredential_failedAttempts_check"
  CHECK ("failedAttempts" BETWEEN 0 AND 1000000),
  ADD CONSTRAINT "LocalCredential_lockedUntil_check"
  CHECK ("lockedUntil" IS NULL OR "lockedUntil" >= "createdAt");

ALTER TABLE "AuthSession"
  ADD CONSTRAINT "AuthSession_tokenHash_check"
  CHECK ("tokenHash" ~ '^[A-Za-z0-9_-]{43}$'),
  ADD CONSTRAINT "AuthSession_lifetime_check"
  CHECK (
    "lastSeenAt" >= "createdAt"
    AND "idleExpiresAt" > "createdAt"
    AND "absoluteExpiresAt" > "createdAt"
    AND "idleExpiresAt" <= "absoluteExpiresAt"
    AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
  );

ALTER TABLE "AuthToken"
  ADD CONSTRAINT "AuthToken_tokenHash_check"
  CHECK ("tokenHash" ~ '^[A-Za-z0-9_-]{43}$'),
  ADD CONSTRAINT "AuthToken_lifetime_check"
  CHECK (
    "expiresAt" > "createdAt"
    AND ("consumedAt" IS NULL OR "consumedAt" >= "createdAt")
    AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
    AND NOT ("consumedAt" IS NOT NULL AND "revokedAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "AuthToken_email_normalized_check"
  CHECK ("email" IS NULL OR "email" = lower(btrim("email"))),
  ADD CONSTRAINT "AuthToken_shape_check"
  CHECK (
    (
      "type" = 'INVITE'
      AND "orgId" IS NOT NULL
      AND "email" IS NOT NULL
      AND "role" IS NOT NULL
      AND "issuedByUserId" IS NOT NULL
    )
    OR
    (
      "type" = 'PASSWORD_RESET'
      AND "userId" IS NOT NULL
      AND "role" IS NULL
    )
  );

ALTER TABLE "AuthThrottle"
  ADD CONSTRAINT "AuthThrottle_keyHash_check"
  CHECK ("keyHash" ~ '^[A-Za-z0-9_-]{43}$'),
  ADD CONSTRAINT "AuthThrottle_attempts_check"
  CHECK ("attempts" BETWEEN 0 AND 1000000),
  ADD CONSTRAINT "AuthThrottle_blockedUntil_check"
  CHECK ("blockedUntil" IS NULL OR "blockedUntil" >= "windowStartedAt");
