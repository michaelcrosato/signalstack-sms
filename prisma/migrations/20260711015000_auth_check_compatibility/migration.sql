-- Invite issuers are retained as creation evidence when present, but the foreign key intentionally
-- uses ON DELETE SET NULL so deleting an operator account cannot make token cleanup impossible.
ALTER TABLE "AuthToken"
  DROP CONSTRAINT "AuthToken_shape_check";

ALTER TABLE "AuthToken"
  ADD CONSTRAINT "AuthToken_shape_check"
  CHECK (
    (
      "type" = 'INVITE'
      AND "orgId" IS NOT NULL
      AND "email" IS NOT NULL
      AND "role" IS NOT NULL
    )
    OR
    (
      "type" = 'PASSWORD_RESET'
      AND "userId" IS NOT NULL
      AND "role" IS NULL
    )
  );
