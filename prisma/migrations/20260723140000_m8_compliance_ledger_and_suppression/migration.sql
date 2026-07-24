-- AlterTable ComplianceProfile
ALTER TABLE "ComplianceProfile" ADD COLUMN "brandRegistrationId" TEXT,
ADD COLUMN "campaignRegistrationId" TEXT,
ADD COLUMN "sampleMessages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "helpKeywordsCopy" TEXT,
ADD COLUMN "optOutKeywordsCopy" TEXT,
ADD COLUMN "evidenceReference" TEXT,
ADD COLUMN "verificationStatus" TEXT,
ADD COLUMN "verificationDetails" JSONB;

-- CreateTable ConsentEvent
CREATE TABLE "ConsentEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "contactId" TEXT,
    "phone" TEXT NOT NULL,
    "consentStatus" "ConsentStatus" NOT NULL,
    "previousStatus" "ConsentStatus",
    "source" TEXT NOT NULL,
    "sourceIp" TEXT,
    "channel" TEXT,
    "actorUserId" TEXT,
    "consentCapturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consentMethod" TEXT,
    "consentDisclosure" TEXT,
    "evidenceReference" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable AuditEvent
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "apiCredentialId" TEXT,
    "action" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT,
    "sourceIp" TEXT,
    "channel" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable SuppressionEntry
CREATE TABLE "SuppressionEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "phone" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuppressionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsentEvent_orgId_id_key" ON "ConsentEvent"("orgId", "id");
CREATE INDEX "ConsentEvent_orgId_idx" ON "ConsentEvent"("orgId");
CREATE INDEX "ConsentEvent_orgId_phone_idx" ON "ConsentEvent"("orgId", "phone");
CREATE INDEX "ConsentEvent_orgId_contactId_idx" ON "ConsentEvent"("orgId", "contactId");
CREATE INDEX "ConsentEvent_createdAt_idx" ON "ConsentEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_orgId_id_key" ON "AuditEvent"("orgId", "id");
CREATE INDEX "AuditEvent_orgId_idx" ON "AuditEvent"("orgId");
CREATE INDEX "AuditEvent_orgId_actorUserId_idx" ON "AuditEvent"("orgId", "actorUserId");
CREATE INDEX "AuditEvent_orgId_action_idx" ON "AuditEvent"("orgId", "action");
CREATE INDEX "AuditEvent_orgId_subjectType_subjectId_idx" ON "AuditEvent"("orgId", "subjectType", "subjectId");
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SuppressionEntry_orgId_phone_key" ON "SuppressionEntry"("orgId", "phone");
CREATE INDEX "SuppressionEntry_phone_idx" ON "SuppressionEntry"("phone");
CREATE INDEX "SuppressionEntry_orgId_idx" ON "SuppressionEntry"("orgId");
CREATE INDEX "SuppressionEntry_orgId_phone_idx" ON "SuppressionEntry"("orgId", "phone");

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_orgId_contactId_fkey" FOREIGN KEY ("orgId", "contactId") REFERENCES "Contact"("orgId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuppressionEntry" ADD CONSTRAINT "SuppressionEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
