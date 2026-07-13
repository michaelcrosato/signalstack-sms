-- M5: durable individual-message application state and provider-attempt outbox.

BEGIN;

CREATE TYPE "MessageApplicationStatus" AS ENUM (
  'ACCEPTED',
  'SCHEDULED',
  'PROCESSING',
  'SENT',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
  'AMBIGUOUS'
);

CREATE TYPE "MessageTransport" AS ENUM ('DUMMY', 'TWILIO');

CREATE TYPE "MessageAttemptStatus" AS ENUM (
  'QUEUED',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'AMBIGUOUS',
  'RESOLVED_NOT_SENT'
);

ALTER TABLE "Message"
  ADD COLUMN "applicationStatus" "MessageApplicationStatus" NOT NULL DEFAULT 'ACCEPTED',
  ADD COLUMN "transport" "MessageTransport" NOT NULL DEFAULT 'DUMMY',
  ADD COLUMN "destination" TEXT,
  ADD COLUMN "mediaUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "requestFingerprint" TEXT,
  ADD COLUMN "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "scheduledAt" TIMESTAMP(3),
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "ambiguousAt" TIMESTAMP(3),
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "Message"
SET
  "acceptedAt" = "createdAt",
  "updatedAt" = "createdAt",
  "transport" = CASE
    WHEN "idempotencyKey" LIKE 'live-test-sms:%'
      OR "idempotencyKey" LIKE 'twilio:%'
      OR "providerMessageId" ~ '^(SM|MM)[A-Fa-f0-9]{32}$'
      THEN 'TWILIO'::"MessageTransport"
    ELSE 'DUMMY'::"MessageTransport"
  END,
  "applicationStatus" = CASE
    WHEN "deliveredAt" IS NOT NULL THEN 'DELIVERED'::"MessageApplicationStatus"
    WHEN "failedAt" IS NOT NULL
      OR lower(COALESCE("providerStatus", '')) IN ('failed', 'undelivered', 'canceled')
      THEN 'FAILED'::"MessageApplicationStatus"
    WHEN "providerMessageId" IS NOT NULL THEN 'SENT'::"MessageApplicationStatus"
    WHEN "providerStatus" = 'live_test_reserved' THEN 'AMBIGUOUS'::"MessageApplicationStatus"
    ELSE 'ACCEPTED'::"MessageApplicationStatus"
  END,
  "sentAt" = CASE
    WHEN "providerMessageId" IS NOT NULL OR "deliveredAt" IS NOT NULL THEN "createdAt"
    ELSE NULL
  END,
  "ambiguousAt" = CASE
    WHEN "providerStatus" = 'live_test_reserved' AND "providerMessageId" IS NULL THEN "createdAt"
    ELSE NULL
  END;

ALTER TABLE "Message"
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updatedAt" SET NOT NULL,
  ADD CONSTRAINT "Message_m5_payload_check" CHECK (
    "attemptCount" BETWEEN 0 AND 3
    AND cardinality("mediaUrls") <= 10
    AND (
      "destination" IS NULL
      OR "destination" ~ '^\+[1-9][0-9]{4,31}$'
    )
    AND (
      "requestFingerprint" IS NULL
      OR (
        char_length("requestFingerprint") BETWEEN 16 AND 191
        AND "requestFingerprint" = btrim("requestFingerprint")
      )
    )
    AND (
      "requestFingerprint" IS NULL
      OR (
        "direction" = 'OUTBOUND'
        AND "destination" IS NOT NULL
        AND char_length("body") BETWEEN 1 AND 1600
      )
    )
  ),
  ADD CONSTRAINT "Message_m5_lifecycle_check" CHECK (
    "acceptedAt" >= "createdAt"
    AND ("scheduledAt" IS NULL OR "scheduledAt" >= "acceptedAt")
    AND ("sentAt" IS NULL OR "sentAt" >= "acceptedAt")
    AND ("cancelledAt" IS NULL OR "cancelledAt" >= "acceptedAt")
    AND ("ambiguousAt" IS NULL OR "ambiguousAt" >= "acceptedAt")
    AND (
      "applicationStatus" <> 'SENT'::"MessageApplicationStatus"
      OR "sentAt" IS NOT NULL
    )
    AND (
      "applicationStatus" <> 'DELIVERED'::"MessageApplicationStatus"
      OR ("sentAt" IS NOT NULL AND "deliveredAt" IS NOT NULL)
    )
    AND (
      "applicationStatus" <> 'FAILED'::"MessageApplicationStatus"
      OR "failedAt" IS NOT NULL
    )
    AND (
      "applicationStatus" <> 'CANCELLED'::"MessageApplicationStatus"
      OR "cancelledAt" IS NOT NULL
    )
    AND (
      "applicationStatus" <> 'AMBIGUOUS'::"MessageApplicationStatus"
      OR "ambiguousAt" IS NOT NULL
    )
  );

CREATE INDEX "Message_orgId_applicationStatus_idx"
  ON "Message"("orgId", "applicationStatus");
CREATE INDEX "Message_orgId_applicationStatus_scheduledAt_idx"
  ON "Message"("orgId", "applicationStatus", "scheduledAt");
CREATE UNIQUE INDEX "Message_orgId_id_key"
  ON "Message"("orgId", "id");

CREATE UNIQUE INDEX "ProviderCredentialSecret_orgId_providerAccountId_id_version_key"
  ON "ProviderCredentialSecret"("orgId", "providerAccountId", "id", "version");
CREATE UNIQUE INDEX "ProviderPhoneNumber_orgId_providerAccountId_id_key"
  ON "ProviderPhoneNumber"("orgId", "providerAccountId", "id");

CREATE TABLE "MessageAttempt" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "retryOfAttemptId" TEXT,
  "status" "MessageAttemptStatus" NOT NULL DEFAULT 'QUEUED',
  "transport" "MessageTransport" NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processingToken" TEXT,
  "processingExpiresAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "providerCallStartedAt" TIMESTAMP(3),
  "providerAccountId" TEXT,
  "providerCredentialSecretId" TEXT,
  "providerCredentialVersion" INTEGER,
  "providerPhoneNumberId" TEXT,
  "destination" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "mediaUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "requestFingerprint" TEXT NOT NULL,
  "callbackCorrelationId" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "providerStatus" TEXT,
  "providerErrorCode" TEXT,
  "errorCode" TEXT,
  "disposition" TEXT,
  "completedAt" TIMESTAMP(3),
  "reconciledAt" TIMESTAMP(3),
  "reconciledByUserId" TEXT,
  "reconciliationNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MessageAttempt_payload_check" CHECK (
    "attemptNumber" BETWEEN 1 AND 3
    AND "destination" ~ '^\+[1-9][0-9]{4,31}$'
    AND char_length("body") BETWEEN 1 AND 1600
    AND cardinality("mediaUrls") <= 10
    AND char_length("requestFingerprint") BETWEEN 16 AND 191
    AND "requestFingerprint" = btrim("requestFingerprint")
    AND char_length("callbackCorrelationId") BETWEEN 16 AND 191
    AND "callbackCorrelationId" = btrim("callbackCorrelationId")
    AND (
      ("attemptNumber" = 1 AND "retryOfAttemptId" IS NULL)
      OR ("attemptNumber" > 1 AND "retryOfAttemptId" IS NOT NULL)
    )
  ),
  CONSTRAINT "MessageAttempt_provider_binding_check" CHECK (
    (
      "providerCredentialSecretId" IS NULL
      AND "providerCredentialVersion" IS NULL
    )
    OR (
      "providerCredentialSecretId" IS NOT NULL
      AND "providerCredentialVersion" IS NOT NULL
      AND "providerCredentialVersion" > 0
    )
  ),
  CONSTRAINT "MessageAttempt_transport_check" CHECK (
    (
      "transport" = 'DUMMY'::"MessageTransport"
      AND "providerAccountId" IS NULL
      AND "providerPhoneNumberId" IS NULL
      AND "providerCredentialSecretId" IS NULL
      AND "providerCredentialVersion" IS NULL
      AND "providerCallStartedAt" IS NULL
    )
    OR (
      "transport" = 'TWILIO'::"MessageTransport"
      AND "providerAccountId" IS NOT NULL
      AND "providerPhoneNumberId" IS NOT NULL
      AND (
        "providerCallStartedAt" IS NULL
        OR (
          "providerCredentialSecretId" IS NOT NULL
          AND "providerCredentialVersion" IS NOT NULL
        )
      )
    )
  ),
  CONSTRAINT "MessageAttempt_state_check" CHECK (
    "dueAt" >= "createdAt"
    AND ("claimedAt" IS NULL OR "claimedAt" >= "createdAt")
    AND ("providerCallStartedAt" IS NULL OR "providerCallStartedAt" >= "claimedAt")
    AND ("completedAt" IS NULL OR "completedAt" >= "createdAt")
    AND (
      (
        "status" = 'QUEUED'::"MessageAttemptStatus"
        AND "processingToken" IS NULL
        AND "processingExpiresAt" IS NULL
        AND "providerCallStartedAt" IS NULL
        AND "completedAt" IS NULL
      )
      OR (
        "status" = 'PROCESSING'::"MessageAttemptStatus"
        AND "processingToken" IS NOT NULL
        AND "processingExpiresAt" IS NOT NULL
        AND "claimedAt" IS NOT NULL
        AND "completedAt" IS NULL
      )
      OR (
        "status" IN (
          'SUCCEEDED'::"MessageAttemptStatus",
          'FAILED'::"MessageAttemptStatus",
          'CANCELLED'::"MessageAttemptStatus",
          'AMBIGUOUS'::"MessageAttemptStatus",
          'RESOLVED_NOT_SENT'::"MessageAttemptStatus"
        )
        AND "processingToken" IS NULL
        AND "processingExpiresAt" IS NULL
        AND "completedAt" IS NOT NULL
      )
    )
    AND (
      "status" <> 'SUCCEEDED'::"MessageAttemptStatus"
      OR "providerMessageId" IS NOT NULL
    )
    AND (
      "reconciledAt" IS NULL
      AND "reconciledByUserId" IS NULL
      AND "reconciliationNote" IS NULL
      OR (
        "reconciledAt" IS NOT NULL
        AND "reconciledByUserId" IS NOT NULL
        AND char_length("reconciliationNote") BETWEEN 1 AND 1000
      )
    )
    AND (
      "status" <> 'RESOLVED_NOT_SENT'::"MessageAttemptStatus"
      OR (
        "providerMessageId" IS NULL
        AND "reconciledAt" IS NOT NULL
      )
    )
  ),
  CONSTRAINT "MessageAttempt_safe_evidence_check" CHECK (
    ("processingToken" IS NULL OR char_length("processingToken") BETWEEN 16 AND 191)
    AND ("providerMessageId" IS NULL OR char_length("providerMessageId") BETWEEN 2 AND 191)
    AND ("providerStatus" IS NULL OR char_length("providerStatus") BETWEEN 1 AND 64)
    AND ("providerErrorCode" IS NULL OR char_length("providerErrorCode") BETWEEN 1 AND 128)
    AND ("errorCode" IS NULL OR "errorCode" ~ '^[A-Z][A-Z0-9_]{0,127}$')
    AND ("disposition" IS NULL OR "disposition" IN ('success', 'terminal', 'retryable', 'ambiguous', 'not_sent'))
  )
);

CREATE UNIQUE INDEX "MessageAttempt_orgId_id_key"
  ON "MessageAttempt"("orgId", "id");
CREATE UNIQUE INDEX "MessageAttempt_orgId_messageId_id_key"
  ON "MessageAttempt"("orgId", "messageId", "id");
CREATE UNIQUE INDEX "MessageAttempt_orgId_messageId_attemptNumber_key"
  ON "MessageAttempt"("orgId", "messageId", "attemptNumber");
CREATE UNIQUE INDEX "MessageAttempt_callbackCorrelationId_key"
  ON "MessageAttempt"("callbackCorrelationId");
CREATE UNIQUE INDEX "MessageAttempt_orgId_providerAccountId_providerMessageId_key"
  ON "MessageAttempt"("orgId", "providerAccountId", "providerMessageId");
CREATE INDEX "MessageAttempt_orgId_idx" ON "MessageAttempt"("orgId");
CREATE INDEX "MessageAttempt_orgId_status_dueAt_processingExpiresAt_idx"
  ON "MessageAttempt"("orgId", "status", "dueAt", "processingExpiresAt");
CREATE INDEX "MessageAttempt_orgId_messageId_createdAt_idx"
  ON "MessageAttempt"("orgId", "messageId", "createdAt");
CREATE INDEX "MessageAttempt_orgId_providerAccountId_idx"
  ON "MessageAttempt"("orgId", "providerAccountId");
CREATE INDEX "MessageAttempt_orgId_providerPhoneNumberId_idx"
  ON "MessageAttempt"("orgId", "providerPhoneNumberId");
CREATE INDEX "MessageAttempt_orgId_reconciledByUserId_idx"
  ON "MessageAttempt"("orgId", "reconciledByUserId");
CREATE INDEX "MessageAttempt_providerMessageId_idx"
  ON "MessageAttempt"("providerMessageId");

ALTER TABLE "MessageAttempt"
  ADD CONSTRAINT "MessageAttempt_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "MessageAttempt_orgId_messageId_fkey"
    FOREIGN KEY ("orgId", "messageId") REFERENCES "Message"("orgId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MessageAttempt_orgId_messageId_retryOfAttemptId_fkey"
    FOREIGN KEY ("orgId", "messageId", "retryOfAttemptId")
    REFERENCES "MessageAttempt"("orgId", "messageId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MessageAttempt_orgId_providerAccountId_fkey"
    FOREIGN KEY ("orgId", "providerAccountId")
    REFERENCES "ProviderAccount"("orgId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MessageAttempt_provider_credential_generation_fkey"
    FOREIGN KEY (
      "orgId",
      "providerAccountId",
      "providerCredentialSecretId",
      "providerCredentialVersion"
    ) REFERENCES "ProviderCredentialSecret"("orgId", "providerAccountId", "id", "version")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MessageAttempt_provider_phone_binding_fkey"
    FOREIGN KEY ("orgId", "providerAccountId", "providerPhoneNumberId")
    REFERENCES "ProviderPhoneNumber"("orgId", "providerAccountId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MessageAttempt_reconciler_membership_fkey"
    FOREIGN KEY ("orgId", "reconciledByUserId")
    REFERENCES "Membership"("orgId", "userId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
