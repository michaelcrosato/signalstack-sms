-- Credential fingerprints are safe, bounded HMAC-derived identifiers with one canonical shape.

BEGIN;

ALTER TABLE "ProviderCredentialSecret"
  ADD CONSTRAINT "ProviderCredentialSecret_fingerprint_check" CHECK (
    "fingerprint" ~ '^pvfp_[A-Za-z0-9_-]{22}$'
  );

COMMIT;
