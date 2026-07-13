-- M5: enforce canonical E.164 bounds and UUID callback correlation at rest.

BEGIN;

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_m5_e164_bounds_check" CHECK (
    "destination" IS NULL
    OR "destination" ~ '^\+[1-9][0-9]{4,14}$'
  );

ALTER TABLE "MessageAttempt"
  ADD CONSTRAINT "MessageAttempt_e164_bounds_check" CHECK (
    "destination" ~ '^\+[1-9][0-9]{4,14}$'
  ),
  ADD CONSTRAINT "MessageAttempt_callback_correlation_uuid_check" CHECK (
    "callbackCorrelationId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  );

COMMIT;
