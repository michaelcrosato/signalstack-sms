-- Prevent concurrent deliveries of the same provider webhook from both running
-- downstream mutations. Null values preserve retryability for existing rows.
ALTER TABLE "WebhookEvent"
ADD COLUMN "claimToken" TEXT,
ADD COLUMN "claimExpiresAt" TIMESTAMP(3);

CREATE INDEX "WebhookEvent_orgId_processedAt_claimExpiresAt_idx"
ON "WebhookEvent"("orgId", "processedAt", "claimExpiresAt");
