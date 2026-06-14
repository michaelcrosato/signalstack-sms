-- CreateEnum
CREATE TYPE "A2pRegistrationStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ComplianceProfile" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "businessName" TEXT,
    "messagingUseCase" TEXT,
    "optInDescription" TEXT,
    "privacyPolicyUrl" TEXT,
    "termsOfServiceUrl" TEXT,
    "a2pRegistrationStatus" "A2pRegistrationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceProfile_orgId_key" ON "ComplianceProfile"("orgId");

-- CreateIndex
CREATE INDEX "ComplianceProfile_orgId_idx" ON "ComplianceProfile"("orgId");

-- AddForeignKey
ALTER TABLE "ComplianceProfile" ADD CONSTRAINT "ComplianceProfile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
