-- CreateTable
CREATE TABLE "LiveReadinessAuditEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveReadinessAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveReadinessAuditEvent_orgId_idx" ON "LiveReadinessAuditEvent"("orgId");

-- CreateIndex
CREATE INDEX "LiveReadinessAuditEvent_orgId_action_idx" ON "LiveReadinessAuditEvent"("orgId", "action");

-- CreateIndex
CREATE INDEX "LiveReadinessAuditEvent_createdAt_idx" ON "LiveReadinessAuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "LiveReadinessAuditEvent" ADD CONSTRAINT "LiveReadinessAuditEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
