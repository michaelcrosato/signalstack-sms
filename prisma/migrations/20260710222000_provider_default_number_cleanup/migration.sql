-- Older databases could already contain multiple defaults because the prior application-only
-- update was raceable. Preserve the most recently updated row and demote only duplicate defaults
-- before the following migration installs the partial unique index.
WITH ranked_defaults AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "orgId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" ASC
    ) AS default_rank
  FROM "ProviderPhoneNumber"
  WHERE "isDefault" = true
)
UPDATE "ProviderPhoneNumber" AS provider_number
SET "isDefault" = false
FROM ranked_defaults
WHERE provider_number."id" = ranked_defaults."id"
  AND ranked_defaults.default_rank > 1;
