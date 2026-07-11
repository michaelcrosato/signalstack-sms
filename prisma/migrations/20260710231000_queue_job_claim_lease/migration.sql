-- Make PROCESSING recoverable after a worker crash while preserving owner-only transitions.
ALTER TABLE "QueueJob"
ADD COLUMN "processingToken" TEXT,
ADD COLUMN "processingExpiresAt" TIMESTAMP(3);

CREATE INDEX "QueueJob_status_processingExpiresAt_idx"
ON "QueueJob"("status", "processingExpiresAt");
