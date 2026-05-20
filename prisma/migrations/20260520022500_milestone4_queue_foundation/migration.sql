-- CreateEnum
CREATE TYPE "QueueJobType" AS ENUM ('SCHEDULED_CAMPAIGN');

-- CreateEnum
CREATE TYPE "QueueJobStatus" AS ENUM ('QUEUED', 'CANCELLED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "QueueJob" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT,
    "type" "QueueJobType" NOT NULL,
    "status" "QueueJobStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QueueJob_idempotencyKey_key" ON "QueueJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "QueueJob_orgId_idx" ON "QueueJob"("orgId");

-- CreateIndex
CREATE INDEX "QueueJob_orgId_status_idx" ON "QueueJob"("orgId", "status");

-- CreateIndex
CREATE INDEX "QueueJob_campaignId_idx" ON "QueueJob"("campaignId");

-- AddForeignKey
ALTER TABLE "QueueJob" ADD CONSTRAINT "QueueJob_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueJob" ADD CONSTRAINT "QueueJob_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
