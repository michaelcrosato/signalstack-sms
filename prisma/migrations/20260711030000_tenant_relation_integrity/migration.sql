-- M2: make organization ownership part of every strict relational key.
--
-- The preflight deliberately reports counts and relation names only. It never emits row IDs,
-- contact data, message data, or other tenant content. Any definite mismatch aborts the migration;
-- operators must inspect and repair it explicitly rather than silently re-parenting tenant data.
BEGIN;

DO $preflight$
DECLARE
  violations jsonb;
  violation_count bigint;
BEGIN
  violations := jsonb_build_object(
    'ContactTag.contact', (
      SELECT count(*) FROM "ContactTag" child
      WHERE NOT EXISTS (
        SELECT 1 FROM "Contact" parent
        WHERE parent."id" = child."contactId" AND parent."orgId" = child."orgId"
      )
    ),
    'ContactTag.tag', (
      SELECT count(*) FROM "ContactTag" child
      WHERE NOT EXISTS (
        SELECT 1 FROM "Tag" parent
        WHERE parent."id" = child."tagId" AND parent."orgId" = child."orgId"
      )
    ),
    'ContactListMember.list', (
      SELECT count(*) FROM "ContactListMember" child
      WHERE NOT EXISTS (
        SELECT 1 FROM "ContactList" parent
        WHERE parent."id" = child."listId" AND parent."orgId" = child."orgId"
      )
    ),
    'ContactListMember.contact', (
      SELECT count(*) FROM "ContactListMember" child
      WHERE NOT EXISTS (
        SELECT 1 FROM "Contact" parent
        WHERE parent."id" = child."contactId" AND parent."orgId" = child."orgId"
      )
    ),
    'Campaign.template', (
      SELECT count(*) FROM "Campaign" child
      WHERE child."templateId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "MessageTemplate" parent
          WHERE parent."id" = child."templateId" AND parent."orgId" = child."orgId"
        )
    ),
    'CampaignRecipient.campaign', (
      SELECT count(*) FROM "CampaignRecipient" child
      WHERE NOT EXISTS (
        SELECT 1 FROM "Campaign" parent
        WHERE parent."id" = child."campaignId" AND parent."orgId" = child."orgId"
      )
    ),
    'CampaignRecipient.contact', (
      SELECT count(*) FROM "CampaignRecipient" child
      WHERE NOT EXISTS (
        SELECT 1 FROM "Contact" parent
        WHERE parent."id" = child."contactId" AND parent."orgId" = child."orgId"
      )
    ),
    'Conversation.contact', (
      SELECT count(*) FROM "Conversation" child
      WHERE child."contactId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "Contact" parent
          WHERE parent."id" = child."contactId" AND parent."orgId" = child."orgId"
        )
    ),
    'Conversation.assignee', (
      SELECT count(*) FROM "Conversation" child
      WHERE child."assignedToUserId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "Membership" parent
          WHERE parent."userId" = child."assignedToUserId" AND parent."orgId" = child."orgId"
        )
    ),
    'QueueJob.campaign', (
      SELECT count(*) FROM "QueueJob" child
      WHERE child."campaignId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "Campaign" parent
          WHERE parent."id" = child."campaignId" AND parent."orgId" = child."orgId"
        )
    ),
    'QueueJob.payload', (
      SELECT count(*) FROM "QueueJob"
      WHERE "type" = 'SCHEDULED_CAMPAIGN'::"QueueJobType"
        AND (
          "campaignId" IS NULL
          OR jsonb_typeof("payload") IS DISTINCT FROM 'object'
          OR "payload"->>'orgId' IS DISTINCT FROM "orgId"
          OR "payload"->>'campaignId' IS DISTINCT FROM "campaignId"
        )
    ),
    'Message.contact', (
      SELECT count(*) FROM "Message" child
      WHERE child."contactId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "Contact" parent
          WHERE parent."id" = child."contactId" AND parent."orgId" = child."orgId"
        )
    ),
    'Message.conversation', (
      SELECT count(*) FROM "Message" child
      WHERE child."conversationId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "Conversation" parent
          WHERE parent."id" = child."conversationId" AND parent."orgId" = child."orgId"
        )
    ),
    'Message.campaign', (
      SELECT count(*) FROM "Message" child
      WHERE child."campaignId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "Campaign" parent
          WHERE parent."id" = child."campaignId" AND parent."orgId" = child."orgId"
        )
    ),
    'Message.providerMessageId', (
      SELECT count(*) FROM (
        SELECT 1
        FROM "Message"
        WHERE "providerMessageId" IS NOT NULL
        GROUP BY "orgId", "providerMessageId"
        HAVING count(*) > 1
      ) duplicates
    ),
    'InternalNote.conversation', (
      SELECT count(*) FROM "InternalNote" child
      WHERE NOT EXISTS (
        SELECT 1 FROM "Conversation" parent
        WHERE parent."id" = child."conversationId" AND parent."orgId" = child."orgId"
      )
    ),
    'AuthSession.membership', (
      SELECT count(*) FROM "AuthSession" child
      WHERE NOT EXISTS (
        SELECT 1 FROM "Membership" parent
        WHERE parent."userId" = child."userId" AND parent."orgId" = child."orgId"
      )
    ),
    'AuthToken.usableInviteIssuer', (
      SELECT count(*) FROM "AuthToken" child
      WHERE child."type" = 'INVITE'::"AuthTokenType"
        AND child."consumedAt" IS NULL
        AND child."revokedAt" IS NULL
        AND child."expiresAt" > CURRENT_TIMESTAMP
        AND (
          child."issuedByUserId" IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM "Membership" parent
            WHERE parent."userId" = child."issuedByUserId" AND parent."orgId" = child."orgId"
          )
        )
    ),
    'AuthToken.currentInviteSubject', (
      SELECT count(*) FROM "AuthToken" child
      WHERE child."type" = 'INVITE'::"AuthTokenType"
        AND child."userId" IS NOT NULL
        AND child."consumedAt" IS NULL
        AND child."revokedAt" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "Membership" parent
          WHERE parent."userId" = child."userId" AND parent."orgId" = child."orgId"
        )
    ),
    'ProviderCredentialRotation.currentCredential', (
      SELECT count(*) FROM "ProviderCredentialRotation" child
      WHERE child."providerCredentialId" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "ProviderCredential" candidate
          WHERE candidate."id" = child."providerCredentialId"
        )
        AND NOT EXISTS (
          SELECT 1 FROM "ProviderCredential" parent
          WHERE parent."id" = child."providerCredentialId"
            AND parent."orgId" = child."orgId"
            AND parent."provider" = child."provider"
        )
    )
  );

  SELECT COALESCE(sum(value::bigint), 0)
  INTO violation_count
  FROM jsonb_each_text(violations);

  IF violation_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Tenant relation integrity preflight failed.',
      DETAIL = violations::text,
      HINT = 'Repair or quarantine every reported relation explicitly, then retry the migration.';
  END IF;
END
$preflight$;

-- Composite target keys. The global primary key still exists; these redundant unique keys are the
-- PostgreSQL targets that make organization identity part of each child foreign key.
CREATE UNIQUE INDEX "Contact_orgId_id_key" ON "Contact"("orgId", "id");
CREATE UNIQUE INDEX "Tag_orgId_id_key" ON "Tag"("orgId", "id");
CREATE UNIQUE INDEX "ContactList_orgId_id_key" ON "ContactList"("orgId", "id");
CREATE UNIQUE INDEX "MessageTemplate_orgId_id_key" ON "MessageTemplate"("orgId", "id");
CREATE UNIQUE INDEX "Campaign_orgId_id_key" ON "Campaign"("orgId", "id");
CREATE UNIQUE INDEX "Conversation_orgId_id_key" ON "Conversation"("orgId", "id");

-- Referencing-side indexes are not created automatically by PostgreSQL.
CREATE INDEX "ContactTag_orgId_contactId_idx" ON "ContactTag"("orgId", "contactId");
CREATE INDEX "ContactTag_orgId_tagId_idx" ON "ContactTag"("orgId", "tagId");
CREATE INDEX "ContactListMember_orgId_listId_idx" ON "ContactListMember"("orgId", "listId");
CREATE INDEX "ContactListMember_orgId_contactId_idx" ON "ContactListMember"("orgId", "contactId");
CREATE INDEX "Campaign_orgId_templateId_idx" ON "Campaign"("orgId", "templateId");
CREATE INDEX "CampaignRecipient_orgId_campaignId_idx" ON "CampaignRecipient"("orgId", "campaignId");
CREATE INDEX "CampaignRecipient_orgId_contactId_idx" ON "CampaignRecipient"("orgId", "contactId");
CREATE INDEX "Conversation_orgId_contactId_idx" ON "Conversation"("orgId", "contactId");
CREATE INDEX "Conversation_orgId_assignedToUserId_idx" ON "Conversation"("orgId", "assignedToUserId");
CREATE INDEX "QueueJob_orgId_campaignId_idx" ON "QueueJob"("orgId", "campaignId");
CREATE INDEX "Message_orgId_contactId_idx" ON "Message"("orgId", "contactId");
CREATE INDEX "Message_orgId_conversationId_idx" ON "Message"("orgId", "conversationId");
CREATE INDEX "Message_orgId_campaignId_idx" ON "Message"("orgId", "campaignId");
CREATE INDEX "InternalNote_orgId_conversationId_idx" ON "InternalNote"("orgId", "conversationId");
CREATE INDEX "InternalNote_orgId_authorUserId_idx" ON "InternalNote"("orgId", "authorUserId");
CREATE INDEX "AuthSession_orgId_userId_idx" ON "AuthSession"("orgId", "userId");
CREATE INDEX "AuthToken_orgId_userId_idx" ON "AuthToken"("orgId", "userId");
CREATE INDEX "AuthToken_orgId_issuedByUserId_idx" ON "AuthToken"("orgId", "issuedByUserId");
CREATE INDEX "ProviderCredentialRotation_orgId_providerCredentialId_idx"
  ON "ProviderCredentialRotation"("orgId", "providerCredentialId");
CREATE INDEX "ProviderCredentialRotation_orgId_actorUserId_idx"
  ON "ProviderCredentialRotation"("orgId", "actorUserId");
CREATE INDEX "LiveReadinessAuditEvent_orgId_actorUserId_idx"
  ON "LiveReadinessAuditEvent"("orgId", "actorUserId");
CREATE INDEX "LiveReadinessAuditEvent_orgId_subjectType_subjectId_idx"
  ON "LiveReadinessAuditEvent"("orgId", "subjectType", "subjectId");

CREATE UNIQUE INDEX "Message_orgId_providerMessageId_key"
  ON "Message"("orgId", "providerMessageId");

-- Strict same-tenant relations. NOT VALID closes the race for new writes immediately; validation below
-- proves all pre-existing rows before the legacy global-ID-only constraints are removed.
ALTER TABLE "ContactTag"
  ADD CONSTRAINT "ContactTag_orgId_contactId_fkey"
    FOREIGN KEY ("orgId", "contactId") REFERENCES "Contact"("orgId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "ContactTag_orgId_tagId_fkey"
    FOREIGN KEY ("orgId", "tagId") REFERENCES "Tag"("orgId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

ALTER TABLE "ContactListMember"
  ADD CONSTRAINT "ContactListMember_orgId_listId_fkey"
    FOREIGN KEY ("orgId", "listId") REFERENCES "ContactList"("orgId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "ContactListMember_orgId_contactId_fkey"
    FOREIGN KEY ("orgId", "contactId") REFERENCES "Contact"("orgId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

ALTER TABLE "Campaign"
  ADD CONSTRAINT "Campaign_orgId_templateId_fkey"
    FOREIGN KEY ("orgId", "templateId") REFERENCES "MessageTemplate"("orgId", "id")
    ON DELETE SET NULL ("templateId") ON UPDATE CASCADE NOT VALID;

ALTER TABLE "CampaignRecipient"
  ADD CONSTRAINT "CampaignRecipient_orgId_campaignId_fkey"
    FOREIGN KEY ("orgId", "campaignId") REFERENCES "Campaign"("orgId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "CampaignRecipient_orgId_contactId_fkey"
    FOREIGN KEY ("orgId", "contactId") REFERENCES "Contact"("orgId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_orgId_contactId_fkey"
    FOREIGN KEY ("orgId", "contactId") REFERENCES "Contact"("orgId", "id")
    ON DELETE SET NULL ("contactId") ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "Conversation_orgId_assignedToUserId_fkey"
    FOREIGN KEY ("orgId", "assignedToUserId") REFERENCES "Membership"("orgId", "userId")
    ON DELETE SET NULL ("assignedToUserId") ON UPDATE CASCADE NOT VALID;

ALTER TABLE "QueueJob"
  ADD CONSTRAINT "QueueJob_orgId_campaignId_fkey"
    FOREIGN KEY ("orgId", "campaignId") REFERENCES "Campaign"("orgId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_orgId_contactId_fkey"
    FOREIGN KEY ("orgId", "contactId") REFERENCES "Contact"("orgId", "id")
    ON DELETE SET NULL ("contactId") ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "Message_orgId_conversationId_fkey"
    FOREIGN KEY ("orgId", "conversationId") REFERENCES "Conversation"("orgId", "id")
    ON DELETE SET NULL ("conversationId") ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "Message_orgId_campaignId_fkey"
    FOREIGN KEY ("orgId", "campaignId") REFERENCES "Campaign"("orgId", "id")
    ON DELETE SET NULL ("campaignId") ON UPDATE CASCADE NOT VALID;

ALTER TABLE "InternalNote"
  ADD CONSTRAINT "InternalNote_orgId_conversationId_fkey"
    FOREIGN KEY ("orgId", "conversationId") REFERENCES "Conversation"("orgId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

ALTER TABLE "AuthSession"
  ADD CONSTRAINT "AuthSession_orgId_userId_fkey"
    FOREIGN KEY ("orgId", "userId") REFERENCES "Membership"("orgId", "userId")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

ALTER TABLE "QueueJob"
  ADD CONSTRAINT "QueueJob_tenant_correlation_check"
  CHECK (
    "type" <> 'SCHEDULED_CAMPAIGN'::"QueueJobType"
    OR (
      "campaignId" IS NOT NULL
      AND jsonb_typeof("payload") = 'object'
      AND "payload"->>'orgId' = "orgId"
      AND "payload"->>'campaignId' = "campaignId"
    )
  ) NOT VALID;

ALTER TABLE "ContactTag"
  VALIDATE CONSTRAINT "ContactTag_orgId_contactId_fkey",
  VALIDATE CONSTRAINT "ContactTag_orgId_tagId_fkey";
ALTER TABLE "ContactListMember"
  VALIDATE CONSTRAINT "ContactListMember_orgId_listId_fkey",
  VALIDATE CONSTRAINT "ContactListMember_orgId_contactId_fkey";
ALTER TABLE "Campaign" VALIDATE CONSTRAINT "Campaign_orgId_templateId_fkey";
ALTER TABLE "CampaignRecipient"
  VALIDATE CONSTRAINT "CampaignRecipient_orgId_campaignId_fkey",
  VALIDATE CONSTRAINT "CampaignRecipient_orgId_contactId_fkey";
ALTER TABLE "Conversation"
  VALIDATE CONSTRAINT "Conversation_orgId_contactId_fkey",
  VALIDATE CONSTRAINT "Conversation_orgId_assignedToUserId_fkey";
ALTER TABLE "QueueJob"
  VALIDATE CONSTRAINT "QueueJob_orgId_campaignId_fkey",
  VALIDATE CONSTRAINT "QueueJob_tenant_correlation_check";
ALTER TABLE "Message"
  VALIDATE CONSTRAINT "Message_orgId_contactId_fkey",
  VALIDATE CONSTRAINT "Message_orgId_conversationId_fkey",
  VALIDATE CONSTRAINT "Message_orgId_campaignId_fkey";
ALTER TABLE "InternalNote" VALIDATE CONSTRAINT "InternalNote_orgId_conversationId_fkey";
ALTER TABLE "AuthSession" VALIDATE CONSTRAINT "AuthSession_orgId_userId_fkey";

-- The composite constraints now subsume these global-ID-only relations.
ALTER TABLE "ContactTag"
  DROP CONSTRAINT "ContactTag_contactId_fkey",
  DROP CONSTRAINT "ContactTag_tagId_fkey";
ALTER TABLE "ContactListMember"
  DROP CONSTRAINT "ContactListMember_listId_fkey",
  DROP CONSTRAINT "ContactListMember_contactId_fkey";
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_templateId_fkey";
ALTER TABLE "CampaignRecipient"
  DROP CONSTRAINT "CampaignRecipient_campaignId_fkey",
  DROP CONSTRAINT "CampaignRecipient_contactId_fkey";
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_contactId_fkey";
ALTER TABLE "QueueJob" DROP CONSTRAINT "QueueJob_campaignId_fkey";
ALTER TABLE "Message"
  DROP CONSTRAINT "Message_contactId_fkey",
  DROP CONSTRAINT "Message_conversationId_fkey",
  DROP CONSTRAINT "Message_campaignId_fkey";
ALTER TABLE "InternalNote" DROP CONSTRAINT "InternalNote_conversationId_fkey";

-- Historical references are validated when written but are intentionally not reverse foreign keys:
-- deleting a membership or referenced audit subject must not erase already-recorded history.
CREATE OR REPLACE FUNCTION public.enforce_auth_token_tenant_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  validate_issuer boolean := TG_OP = 'INSERT';
  validate_subject boolean := TG_OP = 'INSERT';
BEGIN
  IF NEW."type" = 'INVITE'::public."AuthTokenType" THEN
    IF TG_OP = 'UPDATE' THEN
      validate_issuer := NEW."type" IS DISTINCT FROM OLD."type"
        OR NEW."orgId" IS DISTINCT FROM OLD."orgId"
        OR NEW."issuedByUserId" IS DISTINCT FROM OLD."issuedByUserId";
      validate_subject := NEW."type" IS DISTINCT FROM OLD."type"
        OR NEW."orgId" IS DISTINCT FROM OLD."orgId"
        OR NEW."userId" IS DISTINCT FROM OLD."userId";
    END IF;

    IF TG_OP = 'INSERT' AND NEW."issuedByUserId" IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23503',
        MESSAGE = 'Invite issuer must be a member of the token organization.';
    END IF;

    IF validate_issuer AND NEW."issuedByUserId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public."Membership"
      WHERE "orgId" = NEW."orgId" AND "userId" = NEW."issuedByUserId"
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23503',
        MESSAGE = 'Invite issuer must be a member of the token organization.';
    END IF;

    IF validate_subject AND NEW."userId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public."Membership"
      WHERE "orgId" = NEW."orgId" AND "userId" = NEW."userId"
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23503',
        MESSAGE = 'Invite subject must be a member of the token organization.';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_internal_note_author_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."Membership"
    WHERE "orgId" = NEW."orgId" AND "userId" = NEW."authorUserId"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Internal-note author must be a member of the note organization.';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_provider_rotation_tenant_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  validate_actor boolean := TG_OP = 'INSERT';
  validate_credential boolean := TG_OP = 'INSERT';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    validate_actor := NEW."orgId" IS DISTINCT FROM OLD."orgId"
      OR NEW."actorUserId" IS DISTINCT FROM OLD."actorUserId";
    validate_credential := NEW."orgId" IS DISTINCT FROM OLD."orgId"
      OR NEW."provider" IS DISTINCT FROM OLD."provider"
      OR NEW."providerCredentialId" IS DISTINCT FROM OLD."providerCredentialId";
  END IF;

  IF validate_actor AND NEW."actorUserId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."Membership"
    WHERE "orgId" = NEW."orgId" AND "userId" = NEW."actorUserId"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Provider-rotation actor must be a member of the rotation organization.';
  END IF;

  IF validate_credential AND NEW."providerCredentialId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."ProviderCredential"
    WHERE "id" = NEW."providerCredentialId"
      AND "orgId" = NEW."orgId"
      AND "provider" = NEW."provider"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Provider rotation must reference a credential in the same organization and provider.';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_readiness_audit_tenant_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  validate_actor boolean := TG_OP = 'INSERT';
  validate_subject boolean := TG_OP = 'INSERT';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    validate_actor := NEW."orgId" IS DISTINCT FROM OLD."orgId"
      OR NEW."actorUserId" IS DISTINCT FROM OLD."actorUserId";
    validate_subject := NEW."orgId" IS DISTINCT FROM OLD."orgId"
      OR NEW."subjectType" IS DISTINCT FROM OLD."subjectType"
      OR NEW."subjectId" IS DISTINCT FROM OLD."subjectId";
  END IF;

  IF validate_actor AND NEW."actorUserId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."Membership"
    WHERE "orgId" = NEW."orgId" AND "userId" = NEW."actorUserId"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Readiness-audit actor must be a member of the audit organization.';
  END IF;

  IF validate_subject AND NEW."subjectId" IS NOT NULL THEN
    IF NEW."subjectType" = 'Organization' AND NEW."subjectId" <> NEW."orgId" THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" = 'AppUser' AND NOT EXISTS (
      SELECT 1 FROM public."Membership"
      WHERE "orgId" = NEW."orgId" AND "userId" = NEW."subjectId"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" = 'AuthSession' AND NOT EXISTS (
      SELECT 1 FROM public."AuthSession"
      WHERE "id" = NEW."subjectId" AND "orgId" = NEW."orgId"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" = 'AuthToken' AND NOT EXISTS (
      SELECT 1 FROM public."AuthToken"
      WHERE "id" = NEW."subjectId" AND "orgId" = NEW."orgId"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" = 'Membership' AND NOT EXISTS (
      SELECT 1 FROM public."Membership"
      WHERE "id" = NEW."subjectId" AND "orgId" = NEW."orgId"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" = 'ComplianceProfile' AND NOT EXISTS (
      SELECT 1 FROM public."ComplianceProfile"
      WHERE "id" = NEW."subjectId" AND "orgId" = NEW."orgId"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" = 'ProviderPhoneNumber' AND NOT EXISTS (
      SELECT 1 FROM public."ProviderPhoneNumber"
      WHERE "id" = NEW."subjectId" AND "orgId" = NEW."orgId"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" = 'ProviderCredential' AND NOT EXISTS (
      SELECT 1 FROM public."ProviderCredential"
      WHERE "id" = NEW."subjectId" AND "orgId" = NEW."orgId"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Audit subject is outside the audit organization.';
    ELSIF NEW."subjectType" = 'Message' AND NOT EXISTS (
      SELECT 1 FROM public."Message"
      WHERE "id" = NEW."subjectId" AND "orgId" = NEW."orgId"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Audit subject is outside the audit organization.';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.enforce_auth_token_tenant_references() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_internal_note_author_org() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_provider_rotation_tenant_references() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_readiness_audit_tenant_references() FROM PUBLIC;

CREATE TRIGGER "AuthToken_tenant_references_trigger"
  BEFORE INSERT OR UPDATE OF "type", "orgId", "userId", "issuedByUserId"
  ON "AuthToken"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_auth_token_tenant_references();

CREATE TRIGGER "InternalNote_author_org_trigger"
  BEFORE INSERT OR UPDATE OF "orgId", "authorUserId"
  ON "InternalNote"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_internal_note_author_org();

CREATE TRIGGER "ProviderCredentialRotation_tenant_references_trigger"
  BEFORE INSERT OR UPDATE OF "orgId", "provider", "providerCredentialId", "actorUserId"
  ON "ProviderCredentialRotation"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_provider_rotation_tenant_references();

CREATE TRIGGER "LiveReadinessAuditEvent_tenant_references_trigger"
  BEFORE INSERT OR UPDATE OF "orgId", "actorUserId", "subjectType", "subjectId"
  ON "LiveReadinessAuditEvent"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_readiness_audit_tenant_references();

COMMIT;
