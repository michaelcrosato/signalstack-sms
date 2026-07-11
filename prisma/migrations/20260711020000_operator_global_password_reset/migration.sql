-- Organization administrators must never mint a bearer that changes a user-global credential.
-- Invalidate every legacy organization-scoped reset before enforcing operator-global token shape.
DELETE FROM "AuthToken" WHERE "type" = 'PASSWORD_RESET';

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
      AND "orgId" IS NULL
      AND "email" IS NULL
      AND "role" IS NULL
      AND "issuedByUserId" IS NULL
    )
  );
