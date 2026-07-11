-- Application checks provide friendly errors, while this trigger closes the concurrent
-- read-then-write race and protects every database writer. Each evidence field may transition
-- from NULL to a value once; an existing non-null value may be re-written only identically.
CREATE OR REPLACE FUNCTION "protectContactConsentEvidence"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."consentCapturedAt" IS NOT NULL
     AND NEW."consentCapturedAt" IS DISTINCT FROM OLD."consentCapturedAt" THEN
    RAISE EXCEPTION 'consentCapturedAt is write-once'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."consentMethod" IS NOT NULL
     AND NEW."consentMethod" IS DISTINCT FROM OLD."consentMethod" THEN
    RAISE EXCEPTION 'consentMethod is write-once'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."consentDisclosure" IS NOT NULL
     AND NEW."consentDisclosure" IS DISTINCT FROM OLD."consentDisclosure" THEN
    RAISE EXCEPTION 'consentDisclosure is write-once'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Contact_consent_evidence_write_once"
BEFORE UPDATE OF "consentCapturedAt", "consentMethod", "consentDisclosure"
ON "Contact"
FOR EACH ROW
EXECUTE FUNCTION "protectContactConsentEvidence"();
