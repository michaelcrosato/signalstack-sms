-- CreateTable
CREATE TABLE "ProviderCredential" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountSidRedacted" TEXT,
    "accountSidLast4" TEXT,
    "authTokenFingerprint" TEXT,
    "authTokenConfigured" BOOLEAN NOT NULL DEFAULT false,
    "fromNumberRedacted" TEXT,
    "fromNumberLast4" TEXT,
    "source" TEXT NOT NULL DEFAULT 'local_metadata',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCredential_orgId_provider_key" ON "ProviderCredential"("orgId", "provider");

-- CreateIndex
CREATE INDEX "ProviderCredential_orgId_idx" ON "ProviderCredential"("orgId");

-- CreateIndex
CREATE INDEX "ProviderCredential_orgId_provider_idx" ON "ProviderCredential"("orgId", "provider");

-- AddForeignKey
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
