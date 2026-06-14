-- CreateTable
CREATE TABLE "ProviderCredentialRotation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCredentialId" TEXT,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "accountSidRedacted" TEXT,
    "accountSidLast4" TEXT,
    "fromNumberRedacted" TEXT,
    "fromNumberLast4" TEXT,
    "authTokenConfigured" BOOLEAN NOT NULL DEFAULT false,
    "previousAccountSidLast4" TEXT,
    "previousFromNumberLast4" TEXT,
    "previousAuthTokenConfigured" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'local_metadata',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderCredentialRotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderCredentialRotation_orgId_idx" ON "ProviderCredentialRotation"("orgId");

-- CreateIndex
CREATE INDEX "ProviderCredentialRotation_orgId_provider_idx" ON "ProviderCredentialRotation"("orgId", "provider");

-- CreateIndex
CREATE INDEX "ProviderCredentialRotation_createdAt_idx" ON "ProviderCredentialRotation"("createdAt");

-- AddForeignKey
ALTER TABLE "ProviderCredentialRotation" ADD CONSTRAINT "ProviderCredentialRotation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
