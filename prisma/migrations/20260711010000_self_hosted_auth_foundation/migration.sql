-- Built-in identity foundation. Raw password and bearer-token material is never stored.
CREATE TYPE "AuthTokenType" AS ENUM ('INVITE', 'PASSWORD_RESET');
CREATE TYPE "AuthThrottleScope" AS ENUM ('LOGIN_EMAIL', 'LOGIN_NETWORK', 'SETUP_NETWORK', 'RESET_EMAIL');

ALTER TABLE "AppUser"
  ALTER COLUMN "clerkUserId" DROP NOT NULL,
  ADD COLUMN "normalizedEmail" TEXT,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "disabledAt" TIMESTAMP(3),
  ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "AppUser"
SET "normalizedEmail" = lower(trim("email"));

ALTER TABLE "AppUser"
  ALTER COLUMN "normalizedEmail" SET NOT NULL;

CREATE UNIQUE INDEX "AppUser_normalizedEmail_key" ON "AppUser"("normalizedEmail");
CREATE INDEX "AppUser_disabledAt_idx" ON "AppUser"("disabledAt");

CREATE TABLE "LocalCredential" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LocalCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "authVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idleExpiresAt" TIMESTAMP(3) NOT NULL,
  "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthToken" (
  "id" TEXT NOT NULL,
  "type" "AuthTokenType" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT,
  "orgId" TEXT,
  "email" TEXT,
  "role" "MembershipRole",
  "issuedByUserId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthThrottle" (
  "id" TEXT NOT NULL,
  "scope" "AuthThrottleScope" NOT NULL,
  "keyHash" TEXT NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "blockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LocalCredential_userId_key" ON "LocalCredential"("userId");
CREATE INDEX "LocalCredential_lockedUntil_idx" ON "LocalCredential"("lockedUntil");

CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_revokedAt_idx" ON "AuthSession"("userId", "revokedAt");
CREATE INDEX "AuthSession_orgId_revokedAt_idx" ON "AuthSession"("orgId", "revokedAt");
CREATE INDEX "AuthSession_idleExpiresAt_idx" ON "AuthSession"("idleExpiresAt");
CREATE INDEX "AuthSession_absoluteExpiresAt_idx" ON "AuthSession"("absoluteExpiresAt");

CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");
CREATE INDEX "AuthToken_type_expiresAt_idx" ON "AuthToken"("type", "expiresAt");
CREATE INDEX "AuthToken_userId_type_idx" ON "AuthToken"("userId", "type");
CREATE INDEX "AuthToken_orgId_type_idx" ON "AuthToken"("orgId", "type");
CREATE INDEX "AuthToken_issuedByUserId_idx" ON "AuthToken"("issuedByUserId");

CREATE UNIQUE INDEX "AuthThrottle_scope_keyHash_key" ON "AuthThrottle"("scope", "keyHash");
CREATE INDEX "AuthThrottle_blockedUntil_idx" ON "AuthThrottle"("blockedUntil");

ALTER TABLE "LocalCredential"
  ADD CONSTRAINT "LocalCredential_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuthSession"
  ADD CONSTRAINT "AuthSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AuthSession_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuthToken"
  ADD CONSTRAINT "AuthToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AuthToken_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AuthToken_issuedByUserId_fkey"
  FOREIGN KEY ("issuedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
