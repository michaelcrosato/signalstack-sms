DROP INDEX IF EXISTS "QueueJob_idempotencyKey_key";
DROP INDEX IF EXISTS "Message_idempotencyKey_key";
DROP INDEX IF EXISTS "WebhookEvent_idempotencyKey_key";

CREATE UNIQUE INDEX "QueueJob_orgId_idempotencyKey_key" ON "QueueJob"("orgId", "idempotencyKey");
CREATE UNIQUE INDEX "Message_orgId_idempotencyKey_key" ON "Message"("orgId", "idempotencyKey");
CREATE UNIQUE INDEX "WebhookEvent_orgId_idempotencyKey_key" ON "WebhookEvent"("orgId", "idempotencyKey");
