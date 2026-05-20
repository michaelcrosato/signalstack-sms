-- CreateEnum
CREATE TYPE "UsageEventType" AS ENUM ('CONTACT_IMPORTED', 'MESSAGE_INBOUND', 'CAMPAIGN_SCHEDULED', 'AI_REQUEST');

-- CreateEnum
CREATE TYPE "BillingAccountStatus" AS ENUM ('DEMO', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "UsageEventType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAccount" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "status" "BillingAccountStatus" NOT NULL DEFAULT 'DEMO',
    "liveBillingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageEvent_orgId_idx" ON "UsageEvent"("orgId");

-- CreateIndex
CREATE INDEX "UsageEvent_orgId_type_idx" ON "UsageEvent"("orgId", "type");

-- CreateIndex
CREATE INDEX "UsageEvent_createdAt_idx" ON "UsageEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_orgId_key" ON "BillingAccount"("orgId");

-- CreateIndex
CREATE INDEX "BillingAccount_orgId_idx" ON "BillingAccount"("orgId");

-- CreateIndex
CREATE INDEX "BillingAccount_status_idx" ON "BillingAccount"("status");

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
