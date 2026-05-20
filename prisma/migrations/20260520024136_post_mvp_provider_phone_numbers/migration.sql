-- CreateEnum
CREATE TYPE "ProviderPhoneNumberStatus" AS ENUM ('DEMO', 'CONFIGURED', 'DISABLED');

-- CreateTable
CREATE TABLE "ProviderPhoneNumber" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "label" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'dummy',
    "status" "ProviderPhoneNumberStatus" NOT NULL DEFAULT 'DEMO',
    "capabilities" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderPhoneNumber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderPhoneNumber_orgId_idx" ON "ProviderPhoneNumber"("orgId");

-- CreateIndex
CREATE INDEX "ProviderPhoneNumber_orgId_isDefault_idx" ON "ProviderPhoneNumber"("orgId", "isDefault");

-- CreateIndex
CREATE INDEX "ProviderPhoneNumber_orgId_provider_idx" ON "ProviderPhoneNumber"("orgId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPhoneNumber_orgId_phoneNumber_key" ON "ProviderPhoneNumber"("orgId", "phoneNumber");

-- AddForeignKey
ALTER TABLE "ProviderPhoneNumber" ADD CONSTRAINT "ProviderPhoneNumber_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
