-- M3: tenant-scoped public API identity, idempotency, integration audit, and durable customer
-- webhook delivery substrate. Raw API/webhook secrets are never stored in these tables.

BEGIN;

CREATE TYPE "CustomerWebhookEndpointStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "CustomerWebhookDeliveryStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'DELIVERED',
  'FAILED',
  'CANCELED'
);

CREATE TABLE "ApiCredential" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "scopes" TEXT[],
  "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 60,
  "rateWindowStartedAt" TIMESTAMP(3),
  "rateRequestCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "lastUsedIpHash" TEXT,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApiCredential_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApiCredential_scopes_check" CHECK (
    "scopes" IS NOT NULL
    AND cardinality("scopes") > 0
    AND "scopes" <@ ARRAY[
      'organization:read',
      'contacts:read', 'contacts:write',
      'tags:read', 'tags:write',
      'lists:read', 'lists:write',
      'segments:read', 'segments:write',
      'templates:read', 'templates:write',
      'messages:read', 'messages:write', 'messages:send',
      'campaigns:read', 'campaigns:write', 'campaigns:send',
      'conversations:read', 'conversations:write',
      'deliveries:read',
      'credentials:read', 'credentials:write',
      'webhooks:read', 'webhooks:write', 'webhooks:replay'
    ]::TEXT[]
  ),
  CONSTRAINT "ApiCredential_rate_limit_check" CHECK (
    "rateLimitPerMinute" BETWEEN 1 AND 10000
    AND "rateRequestCount" >= 0
  )
);

CREATE TABLE "ApiIdempotencyRecord" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "canonicalRoute" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "responseStatus" INTEGER NOT NULL,
  "responseBody" JSONB NOT NULL,
  "responseHeaders" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApiIdempotencyRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApiIdempotencyRecord_shape_check" CHECK (
    length("key") BETWEEN 1 AND 255
    AND "method" IN ('POST', 'PUT', 'PATCH', 'DELETE')
    AND left("canonicalRoute", 1) = '/'
    AND length("requestHash") > 0
    AND "responseStatus" BETWEEN 100 AND 599
    AND jsonb_typeof("responseHeaders") = 'object'
    AND "expiresAt" > "createdAt"
  )
);

CREATE TABLE "IntegrationAuditEvent" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "apiCredentialId" TEXT,
  "action" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerWebhookEndpoint" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "canonicalUrl" TEXT NOT NULL,
  "status" "CustomerWebhookEndpointStatus" NOT NULL DEFAULT 'ACTIVE',
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "lastFailureAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerWebhookEndpoint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerWebhookEndpoint_state_check" CHECK (
    "consecutiveFailures" >= 0
    AND (
      ("status" = 'ACTIVE' AND "disabledAt" IS NULL)
      OR ("status" = 'DISABLED' AND "disabledAt" IS NOT NULL)
    )
  )
);

CREATE TABLE "CustomerWebhookSubscription" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "endpointId" TEXT NOT NULL,
  "eventTypes" TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerWebhookSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerWebhookSubscription_event_types_check" CHECK (
    "eventTypes" IS NOT NULL
    AND cardinality("eventTypes") > 0
    AND "eventTypes" <@ ARRAY[
      'contact.created', 'contact.updated', 'contact.archived',
      'message.accepted', 'message.sent', 'message.delivered', 'message.failed',
      'message.received', 'message.status.updated',
      'campaign.scheduled', 'campaign.started', 'campaign.completed', 'campaign.failed',
      'campaign.canceled',
      'conversation.created', 'conversation.updated',
      'webhook.endpoint.disabled'
    ]::TEXT[]
  )
);

CREATE TABLE "CustomerWebhookSigningSecret" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "envelopeVersion" INTEGER NOT NULL DEFAULT 1,
  "algorithm" TEXT NOT NULL DEFAULT 'aes-256-gcm',
  "ciphertext" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "authTag" TEXT NOT NULL,
  "keyVersion" INTEGER NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerWebhookSigningSecret_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerWebhookSigningSecret_shape_check" CHECK (
    "version" > 0
    AND "envelopeVersion" = 1
    AND "algorithm" = 'aes-256-gcm'
    AND "keyVersion" > 0
    AND length("ciphertext") > 0
    AND length("iv") > 0
    AND length("authTag") > 0
    AND length("fingerprint") > 0
    AND ("retiredAt" IS NULL OR "retiredAt" >= "activeFrom")
  )
);

CREATE TABLE "CustomerWebhookEvent" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "deduplicationKey" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT,
  "payloadText" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerWebhookEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerWebhookEvent_shape_check" CHECK (
    length("deduplicationKey") > 0
    AND length("type") > 0
    AND "type" = ANY(ARRAY[
      'contact.created', 'contact.updated', 'contact.archived',
      'message.accepted', 'message.sent', 'message.delivered', 'message.failed',
      'message.received', 'message.status.updated',
      'campaign.scheduled', 'campaign.started', 'campaign.completed', 'campaign.failed',
      'campaign.canceled',
      'conversation.created', 'conversation.updated',
      'webhook.endpoint.disabled'
    ]::TEXT[])
    AND "schemaVersion" > 0
    AND length("aggregateType") > 0
    AND length("payloadText") > 0
    AND length("payloadHash") > 0
  )
);

CREATE TABLE "CustomerWebhookDelivery" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "endpointId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "signingSecretId" TEXT NOT NULL,
  "status" "CustomerWebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 8,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processingToken" TEXT,
  "processingExpiresAt" TIMESTAMP(3),
  "generation" INTEGER NOT NULL DEFAULT 1,
  "replayOfDeliveryId" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastStatusCode" INTEGER,
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerWebhookDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerWebhookDelivery_state_check" CHECK (
    "attemptCount" >= 0
    AND "maxAttempts" BETWEEN 1 AND 12
    AND "attemptCount" <= "maxAttempts"
    AND "generation" > 0
    AND (("replayOfDeliveryId" IS NULL AND "generation" = 1)
      OR ("replayOfDeliveryId" IS NOT NULL AND "generation" > 1))
    AND (("status" = 'PROCESSING' AND "processingToken" IS NOT NULL AND "processingExpiresAt" IS NOT NULL)
      OR ("status" <> 'PROCESSING' AND "processingToken" IS NULL AND "processingExpiresAt" IS NULL))
    AND (("status" = 'DELIVERED' AND "deliveredAt" IS NOT NULL AND "failedAt" IS NULL)
      OR ("status" = 'FAILED' AND "failedAt" IS NOT NULL AND "deliveredAt" IS NULL)
      OR ("status" NOT IN ('DELIVERED', 'FAILED') AND "deliveredAt" IS NULL AND "failedAt" IS NULL))
    AND ("lastStatusCode" IS NULL OR "lastStatusCode" BETWEEN 100 AND 599)
  )
);

CREATE TABLE "CustomerWebhookDeliveryAttempt" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "requestTimestamp" TIMESTAMP(3) NOT NULL,
  "statusCode" INTEGER,
  "outcome" TEXT NOT NULL,
  "errorCode" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerWebhookDeliveryAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerWebhookDeliveryAttempt_shape_check" CHECK (
    "generation" > 0
    AND "attemptNumber" > 0
    AND length("outcome") > 0
    AND ("statusCode" IS NULL OR "statusCode" BETWEEN 100 AND 599)
    AND "finishedAt" >= "startedAt"
  )
);

CREATE UNIQUE INDEX "ApiCredential_prefix_key" ON "ApiCredential"("prefix");
CREATE UNIQUE INDEX "ApiCredential_secretHash_key" ON "ApiCredential"("secretHash");
CREATE INDEX "ApiCredential_orgId_idx" ON "ApiCredential"("orgId");
CREATE INDEX "ApiCredential_orgId_revokedAt_expiresAt_idx" ON "ApiCredential"("orgId", "revokedAt", "expiresAt");
CREATE UNIQUE INDEX "ApiCredential_orgId_id_key" ON "ApiCredential"("orgId", "id");
CREATE INDEX "ApiCredential_active_idx" ON "ApiCredential"("orgId", "expiresAt") WHERE "revokedAt" IS NULL;

CREATE INDEX "ApiIdempotencyRecord_orgId_idx" ON "ApiIdempotencyRecord"("orgId");
CREATE INDEX "ApiIdempotencyRecord_orgId_expiresAt_idx" ON "ApiIdempotencyRecord"("orgId", "expiresAt");
CREATE INDEX "ApiIdempotencyRecord_credentialId_idx" ON "ApiIdempotencyRecord"("credentialId");
CREATE UNIQUE INDEX "ApiIdempotencyRecord_orgId_id_key" ON "ApiIdempotencyRecord"("orgId", "id");
CREATE UNIQUE INDEX "ApiIdempotencyRecord_orgId_credentialId_key_key" ON "ApiIdempotencyRecord"("orgId", "credentialId", "key");

CREATE INDEX "IntegrationAuditEvent_orgId_idx" ON "IntegrationAuditEvent"("orgId");
CREATE INDEX "IntegrationAuditEvent_orgId_apiCredentialId_idx" ON "IntegrationAuditEvent"("orgId", "apiCredentialId");
CREATE INDEX "IntegrationAuditEvent_orgId_actorUserId_idx" ON "IntegrationAuditEvent"("orgId", "actorUserId");
CREATE INDEX "IntegrationAuditEvent_orgId_action_createdAt_idx" ON "IntegrationAuditEvent"("orgId", "action", "createdAt");
CREATE INDEX "IntegrationAuditEvent_orgId_subjectType_subjectId_idx" ON "IntegrationAuditEvent"("orgId", "subjectType", "subjectId");
CREATE UNIQUE INDEX "IntegrationAuditEvent_orgId_id_key" ON "IntegrationAuditEvent"("orgId", "id");

CREATE INDEX "CustomerWebhookEndpoint_orgId_idx" ON "CustomerWebhookEndpoint"("orgId");
CREATE INDEX "CustomerWebhookEndpoint_orgId_status_idx" ON "CustomerWebhookEndpoint"("orgId", "status");
CREATE UNIQUE INDEX "CustomerWebhookEndpoint_orgId_id_key" ON "CustomerWebhookEndpoint"("orgId", "id");
CREATE UNIQUE INDEX "CustomerWebhookEndpoint_orgId_canonicalUrl_key" ON "CustomerWebhookEndpoint"("orgId", "canonicalUrl");
CREATE INDEX "CustomerWebhookEndpoint_active_idx" ON "CustomerWebhookEndpoint"("orgId", "id") WHERE "status" = 'ACTIVE';

CREATE INDEX "CustomerWebhookSubscription_orgId_idx" ON "CustomerWebhookSubscription"("orgId");
CREATE INDEX "CustomerWebhookSubscription_endpointId_idx" ON "CustomerWebhookSubscription"("endpointId");
CREATE UNIQUE INDEX "CustomerWebhookSubscription_orgId_id_key" ON "CustomerWebhookSubscription"("orgId", "id");
CREATE UNIQUE INDEX "CustomerWebhookSubscription_orgId_endpointId_key" ON "CustomerWebhookSubscription"("orgId", "endpointId");
CREATE UNIQUE INDEX "CustomerWebhookSubscription_orgId_endpointId_id_key" ON "CustomerWebhookSubscription"("orgId", "endpointId", "id");

CREATE INDEX "CustomerWebhookSigningSecret_orgId_idx" ON "CustomerWebhookSigningSecret"("orgId");
CREATE INDEX "CustomerWebhookSigningSecret_subscriptionId_idx" ON "CustomerWebhookSigningSecret"("subscriptionId");
CREATE UNIQUE INDEX "CustomerWebhookSigningSecret_orgId_id_key" ON "CustomerWebhookSigningSecret"("orgId", "id");
CREATE UNIQUE INDEX "CustomerWebhookSigningSecret_orgId_subscriptionId_id_key" ON "CustomerWebhookSigningSecret"("orgId", "subscriptionId", "id");
CREATE UNIQUE INDEX "CustomerWebhookSigningSecret_orgId_subscriptionId_version_key" ON "CustomerWebhookSigningSecret"("orgId", "subscriptionId", "version");
CREATE UNIQUE INDEX "CustomerWebhookSigningSecret_active_key" ON "CustomerWebhookSigningSecret"("orgId", "subscriptionId") WHERE "retiredAt" IS NULL;

CREATE INDEX "CustomerWebhookEvent_orgId_idx" ON "CustomerWebhookEvent"("orgId");
CREATE INDEX "CustomerWebhookEvent_orgId_type_occurredAt_idx" ON "CustomerWebhookEvent"("orgId", "type", "occurredAt");
CREATE INDEX "CustomerWebhookEvent_orgId_aggregateType_aggregateId_idx" ON "CustomerWebhookEvent"("orgId", "aggregateType", "aggregateId");
CREATE UNIQUE INDEX "CustomerWebhookEvent_orgId_id_key" ON "CustomerWebhookEvent"("orgId", "id");
CREATE UNIQUE INDEX "CustomerWebhookEvent_orgId_deduplicationKey_key" ON "CustomerWebhookEvent"("orgId", "deduplicationKey");

CREATE INDEX "CustomerWebhookDelivery_orgId_idx" ON "CustomerWebhookDelivery"("orgId");
CREATE INDEX "CustomerWebhookDelivery_orgId_status_nextAttemptAt_processi_idx" ON "CustomerWebhookDelivery"("orgId", "status", "nextAttemptAt", "processingExpiresAt");
CREATE INDEX "CustomerWebhookDelivery_orgId_replayOfDeliveryId_idx" ON "CustomerWebhookDelivery"("orgId", "replayOfDeliveryId");
CREATE INDEX "CustomerWebhookDelivery_eventId_idx" ON "CustomerWebhookDelivery"("eventId");
CREATE INDEX "CustomerWebhookDelivery_signingSecretId_idx" ON "CustomerWebhookDelivery"("signingSecretId");
CREATE INDEX "CustomerWebhookDelivery_subscriptionId_idx" ON "CustomerWebhookDelivery"("subscriptionId");
CREATE UNIQUE INDEX "CustomerWebhookDelivery_orgId_id_key" ON "CustomerWebhookDelivery"("orgId", "id");
CREATE UNIQUE INDEX "CustomerWebhookDelivery_orgId_id_generation_key" ON "CustomerWebhookDelivery"("orgId", "id", "generation");
CREATE UNIQUE INDEX "CustomerWebhookDelivery_orgId_endpointId_eventId_id_key" ON "CustomerWebhookDelivery"("orgId", "endpointId", "eventId", "id");
CREATE UNIQUE INDEX "CustomerWebhookDelivery_orgId_endpointId_eventId_generation_key" ON "CustomerWebhookDelivery"("orgId", "endpointId", "eventId", "generation");
CREATE INDEX "CustomerWebhookDelivery_due_idx" ON "CustomerWebhookDelivery"("nextAttemptAt", "processingExpiresAt", "id") WHERE "status" IN ('PENDING', 'PROCESSING');

CREATE INDEX "CustomerWebhookDeliveryAttempt_orgId_idx" ON "CustomerWebhookDeliveryAttempt"("orgId");
CREATE INDEX "CustomerWebhookDeliveryAttempt_orgId_deliveryId_createdAt_idx" ON "CustomerWebhookDeliveryAttempt"("orgId", "deliveryId", "createdAt");
CREATE INDEX "CustomerWebhookDeliveryAttempt_deliveryId_idx" ON "CustomerWebhookDeliveryAttempt"("deliveryId");
CREATE UNIQUE INDEX "CustomerWebhookDeliveryAttempt_orgId_id_key" ON "CustomerWebhookDeliveryAttempt"("orgId", "id");
CREATE UNIQUE INDEX "CustomerWebhookDeliveryAttempt_orgId_deliveryId_generation__key" ON "CustomerWebhookDeliveryAttempt"("orgId", "deliveryId", "generation", "attemptNumber");

ALTER TABLE "ApiCredential" ADD CONSTRAINT "ApiCredential_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiIdempotencyRecord" ADD CONSTRAINT "ApiIdempotencyRecord_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiIdempotencyRecord" ADD CONSTRAINT "ApiIdempotencyRecord_orgId_credentialId_fkey"
  FOREIGN KEY ("orgId", "credentialId") REFERENCES "ApiCredential"("orgId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationAuditEvent" ADD CONSTRAINT "IntegrationAuditEvent_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationAuditEvent" ADD CONSTRAINT "IntegrationAuditEvent_orgId_apiCredentialId_fkey"
  FOREIGN KEY ("orgId", "apiCredentialId") REFERENCES "ApiCredential"("orgId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerWebhookEndpoint" ADD CONSTRAINT "CustomerWebhookEndpoint_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerWebhookSubscription" ADD CONSTRAINT "CustomerWebhookSubscription_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerWebhookSubscription" ADD CONSTRAINT "CustomerWebhookSubscription_orgId_endpointId_fkey"
  FOREIGN KEY ("orgId", "endpointId") REFERENCES "CustomerWebhookEndpoint"("orgId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerWebhookSigningSecret" ADD CONSTRAINT "CustomerWebhookSigningSecret_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerWebhookSigningSecret" ADD CONSTRAINT "CustomerWebhookSigningSecret_orgId_subscriptionId_fkey"
  FOREIGN KEY ("orgId", "subscriptionId") REFERENCES "CustomerWebhookSubscription"("orgId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerWebhookEvent" ADD CONSTRAINT "CustomerWebhookEvent_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerWebhookDelivery" ADD CONSTRAINT "CustomerWebhookDelivery_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerWebhookDelivery" ADD CONSTRAINT "CustomerWebhookDelivery_orgId_endpointId_subscriptionId_fkey"
  FOREIGN KEY ("orgId", "endpointId", "subscriptionId") REFERENCES "CustomerWebhookSubscription"("orgId", "endpointId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerWebhookDelivery" ADD CONSTRAINT "CustomerWebhookDelivery_orgId_eventId_fkey"
  FOREIGN KEY ("orgId", "eventId") REFERENCES "CustomerWebhookEvent"("orgId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerWebhookDelivery" ADD CONSTRAINT "CustomerWebhookDelivery_orgId_subscriptionId_signingSecret_fkey"
  FOREIGN KEY ("orgId", "subscriptionId", "signingSecretId") REFERENCES "CustomerWebhookSigningSecret"("orgId", "subscriptionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerWebhookDelivery" ADD CONSTRAINT "CustomerWebhookDelivery_orgId_endpointId_eventId_replayOfD_fkey"
  FOREIGN KEY ("orgId", "endpointId", "eventId", "replayOfDeliveryId") REFERENCES "CustomerWebhookDelivery"("orgId", "endpointId", "eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerWebhookDeliveryAttempt" ADD CONSTRAINT "CustomerWebhookDeliveryAttempt_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerWebhookDeliveryAttempt" ADD CONSTRAINT "CustomerWebhookDeliveryAttempt_orgId_deliveryId_generation_fkey"
  FOREIGN KEY ("orgId", "deliveryId", "generation") REFERENCES "CustomerWebhookDelivery"("orgId", "id", "generation") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Runtime mutation cannot rewrite identity/payload/pinning evidence. Append-only tables expose no
-- UPDATE/DELETE privilege below; these triggers protect mutable lifecycle rows from accidental drift.
CREATE OR REPLACE FUNCTION public.enforce_customer_webhook_endpoint_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW."orgId" IS DISTINCT FROM OLD."orgId"
    OR NEW."canonicalUrl" IS DISTINCT FROM OLD."canonicalUrl" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Customer webhook endpoint identity is immutable.';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_customer_webhook_subscription_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW."orgId" IS DISTINCT FROM OLD."orgId"
    OR NEW."endpointId" IS DISTINCT FROM OLD."endpointId" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Customer webhook subscription endpoint is immutable.';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_customer_webhook_signing_secret_material()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW."orgId" IS DISTINCT FROM OLD."orgId"
    OR NEW."subscriptionId" IS DISTINCT FROM OLD."subscriptionId"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."envelopeVersion" IS DISTINCT FROM OLD."envelopeVersion"
    OR NEW."algorithm" IS DISTINCT FROM OLD."algorithm"
    OR NEW."ciphertext" IS DISTINCT FROM OLD."ciphertext"
    OR NEW."iv" IS DISTINCT FROM OLD."iv"
    OR NEW."authTag" IS DISTINCT FROM OLD."authTag"
    OR NEW."keyVersion" IS DISTINCT FROM OLD."keyVersion"
    OR NEW."fingerprint" IS DISTINCT FROM OLD."fingerprint"
    OR NEW."activeFrom" IS DISTINCT FROM OLD."activeFrom"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Customer webhook signing-secret material is immutable.';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_customer_webhook_delivery_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW."orgId" IS DISTINCT FROM OLD."orgId"
    OR NEW."endpointId" IS DISTINCT FROM OLD."endpointId"
    OR NEW."subscriptionId" IS DISTINCT FROM OLD."subscriptionId"
    OR NEW."eventId" IS DISTINCT FROM OLD."eventId"
    OR NEW."signingSecretId" IS DISTINCT FROM OLD."signingSecretId"
    OR NEW."generation" IS DISTINCT FROM OLD."generation"
    OR NEW."replayOfDeliveryId" IS DISTINCT FROM OLD."replayOfDeliveryId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Customer webhook delivery identity is immutable.';
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.enforce_customer_webhook_endpoint_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_customer_webhook_subscription_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_customer_webhook_signing_secret_material() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_customer_webhook_delivery_identity() FROM PUBLIC;

CREATE TRIGGER "CustomerWebhookEndpoint_immutable_trigger"
  BEFORE UPDATE ON "CustomerWebhookEndpoint"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_webhook_endpoint_identity();
CREATE TRIGGER "CustomerWebhookSubscription_immutable_trigger"
  BEFORE UPDATE ON "CustomerWebhookSubscription"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_webhook_subscription_identity();
CREATE TRIGGER "CustomerWebhookSigningSecret_immutable_trigger"
  BEFORE UPDATE ON "CustomerWebhookSigningSecret"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_webhook_signing_secret_material();
CREATE TRIGGER "CustomerWebhookDelivery_immutable_trigger"
  BEFORE UPDATE ON "CustomerWebhookDelivery"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_webhook_delivery_identity();

CREATE OR REPLACE FUNCTION public.enforce_integration_audit_actor_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW."actorUserId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."Membership"
    WHERE "orgId" = NEW."orgId" AND "userId" = NEW."actorUserId"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Integration-audit actor must be a member of the audit organization.';
  END IF;
  IF NEW."subjectId" IS NOT NULL THEN
    IF NEW."subjectType" = 'organization' AND NEW."subjectId" <> NEW."orgId" THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Integration-audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" = 'api_credential' AND NOT EXISTS (
      SELECT 1 FROM public."ApiCredential"
      WHERE "orgId" = NEW."orgId" AND "id" = NEW."subjectId"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Integration-audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" = 'customer_webhook_endpoint' AND NOT EXISTS (
      SELECT 1 FROM public."CustomerWebhookEndpoint"
      WHERE "orgId" = NEW."orgId" AND "id" = NEW."subjectId"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Integration-audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" = 'customer_webhook_delivery' AND NOT EXISTS (
      SELECT 1 FROM public."CustomerWebhookDelivery"
      WHERE "orgId" = NEW."orgId" AND "id" = NEW."subjectId"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Integration-audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" NOT IN (
      'organization',
      'api_credential',
      'customer_webhook_endpoint',
      'customer_webhook_delivery'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Integration-audit subject type is invalid.';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.enforce_integration_audit_actor_org() FROM PUBLIC;
CREATE TRIGGER "IntegrationAuditEvent_actor_org_trigger"
  BEFORE INSERT ON "IntegrationAuditEvent"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_integration_audit_actor_org();

-- All nine M3 tables are ordinary tenant rows. Missing/empty org context fails closed. The separate
-- owner capability remains available to migrations, and only ApiCredential has a narrow pre-tenant
-- control SELECT path bound to the exact HMAC hash supplied transaction-locally.
DO $tenant_tables$
DECLARE
  table_name text;
  tenant_tables constant text[] := ARRAY[
    'ApiCredential',
    'ApiIdempotencyRecord',
    'IntegrationAuditEvent',
    'CustomerWebhookEndpoint',
    'CustomerWebhookSubscription',
    'CustomerWebhookSigningSecret',
    'CustomerWebhookEvent',
    'CustomerWebhookDelivery',
    'CustomerWebhookDeliveryAttempt'
  ];
BEGIN
  FOREACH table_name IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      $policy$
        CREATE POLICY tenant_scope ON %I
        AS PERMISSIVE
        FOR ALL
        TO signalstack_runtime
        USING ("orgId" = NULLIF(current_setting('app.current_org_id', true), ''))
        WITH CHECK ("orgId" = NULLIF(current_setting('app.current_org_id', true), ''))
      $policy$,
      table_name
    );
    EXECUTE format(
      'CREATE POLICY owner_scope ON %I FOR ALL TO signalstack_owner USING (true) WITH CHECK (true)',
      table_name
    );
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC, app_rls', table_name);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO signalstack_runtime',
      table_name
    );
  END LOOP;
END
$tenant_tables$;

CREATE POLICY api_key_control_select_scope ON "ApiCredential"
  AS PERMISSIVE
  FOR SELECT
  TO signalstack_control
  USING (
    current_setting('app.control_purpose', true) = 'api_key'
    AND "secretHash" = NULLIF(current_setting('app.current_api_key_hash', true), '')
  );
REVOKE ALL ON TABLE "ApiCredential" FROM signalstack_control;
GRANT SELECT ON TABLE "ApiCredential" TO signalstack_control;

-- Durable integration identity/event history is never hard-deleted by application runtimes.
-- Canonical audit/event/attempt evidence is additionally append-only. Owner-only lifecycle/retention
-- work remains explicit operator territory; expired idempotency snapshots are the sole runtime delete.
REVOKE DELETE ON TABLE
  "ApiCredential",
  "IntegrationAuditEvent",
  "CustomerWebhookEndpoint",
  "CustomerWebhookSubscription",
  "CustomerWebhookSigningSecret",
  "CustomerWebhookEvent",
  "CustomerWebhookDelivery",
  "CustomerWebhookDeliveryAttempt"
  FROM signalstack_runtime;
REVOKE UPDATE ON TABLE
  "IntegrationAuditEvent",
  "CustomerWebhookEvent",
  "CustomerWebhookDeliveryAttempt"
  FROM signalstack_runtime;

GRANT USAGE ON SCHEMA public TO signalstack_worker;
CREATE OR REPLACE FUNCTION public.claim_due_customer_webhook_deliveries(
  max_deliveries integer,
  lease_ms integer,
  claim_token uuid
)
RETURNS TABLE("deliveryId" text, "orgId" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  effective_now timestamptz := clock_timestamp();
BEGIN
  IF max_deliveries IS NULL OR max_deliveries < 1 OR max_deliveries > 100
    OR lease_ms IS NULL OR lease_ms < 1000 OR lease_ms > 3600000
    OR claim_token IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Customer webhook dispatch arguments are invalid.';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT delivery."id"
    FROM public."CustomerWebhookDelivery" delivery
    JOIN public."CustomerWebhookEndpoint" endpoint
      ON endpoint."orgId" = delivery."orgId"
     AND endpoint."id" = delivery."endpointId"
    WHERE endpoint."status" = 'ACTIVE'::public."CustomerWebhookEndpointStatus"
      AND delivery."attemptCount" < delivery."maxAttempts"
      AND delivery."nextAttemptAt" <= effective_now
      AND (
        delivery."status" = 'PENDING'::public."CustomerWebhookDeliveryStatus"
        OR (
          delivery."status" = 'PROCESSING'::public."CustomerWebhookDeliveryStatus"
          AND (
            delivery."processingToken" IS NULL
            OR delivery."processingExpiresAt" IS NULL
            OR delivery."processingExpiresAt" <= effective_now
          )
        )
      )
    ORDER BY delivery."nextAttemptAt", delivery."id"
    FOR UPDATE OF delivery SKIP LOCKED
    LIMIT max_deliveries
  ), claimed AS (
    UPDATE public."CustomerWebhookDelivery" delivery
    SET
      "status" = 'PROCESSING'::public."CustomerWebhookDeliveryStatus",
      "processingToken" = claim_token::text,
      "processingExpiresAt" = effective_now + (lease_ms * INTERVAL '1 millisecond'),
      "updatedAt" = effective_now
    FROM candidates
    WHERE delivery."id" = candidates."id"
    RETURNING delivery."id", delivery."orgId"
  )
  SELECT claimed."id", claimed."orgId"
  FROM claimed
  ORDER BY claimed."id";
END
$function$;

DO $dispatch_owner$
BEGIN
  IF (
    SELECT pg_get_userbyid(functions.proowner) <> current_user
    FROM pg_proc functions
    JOIN pg_namespace namespaces ON namespaces.oid = functions.pronamespace
    WHERE namespaces.nspname = 'public'
      AND functions.proname = 'claim_due_customer_webhook_deliveries'
      AND functions.proargtypes = '23 23 2950'::oidvector
  ) THEN
    EXECUTE format(
      'ALTER FUNCTION public.claim_due_customer_webhook_deliveries(integer, integer, uuid) OWNER TO %I',
      current_user
    );
  END IF;
END
$dispatch_owner$;

REVOKE ALL ON FUNCTION public.claim_due_customer_webhook_deliveries(integer, integer, uuid)
  FROM PUBLIC, signalstack_runtime, signalstack_control, signalstack_web;
GRANT EXECUTE ON FUNCTION public.claim_due_customer_webhook_deliveries(integer, integer, uuid)
  TO signalstack_worker;

COMMIT;
