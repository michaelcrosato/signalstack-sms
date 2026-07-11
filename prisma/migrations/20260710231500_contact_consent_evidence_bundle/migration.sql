-- Consent evidence describes one capture event. Keep the timestamp, method, and verbatim
-- disclosure atomic so concurrent or direct writers cannot assemble evidence from different
-- requests. The preceding write-once trigger prevents later replacement of any field.
ALTER TABLE "Contact"
ADD CONSTRAINT "Contact_consent_evidence_complete_check"
CHECK (
  (
    "consentCapturedAt" IS NULL
    AND "consentMethod" IS NULL
    AND "consentDisclosure" IS NULL
  )
  OR
  (
    "consentCapturedAt" IS NOT NULL
    AND "consentMethod" IS NOT NULL
    AND length(btrim("consentMethod")) > 0
    AND "consentDisclosure" IS NOT NULL
    AND length(btrim("consentDisclosure")) > 0
  )
);
