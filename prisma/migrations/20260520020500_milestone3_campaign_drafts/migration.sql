-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'BLOCKED');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "templateId" TEXT;

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "blockReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_orgId_status_idx" ON "Campaign"("orgId", "status");

-- CreateIndex
CREATE INDEX "MessageTemplate_orgId_idx" ON "MessageTemplate"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_orgId_name_key" ON "MessageTemplate"("orgId", "name");

-- CreateIndex
CREATE INDEX "CampaignRecipient_orgId_idx" ON "CampaignRecipient"("orgId");

-- CreateIndex
CREATE INDEX "CampaignRecipient_contactId_idx" ON "CampaignRecipient"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_contactId_key" ON "CampaignRecipient"("campaignId", "contactId");

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
