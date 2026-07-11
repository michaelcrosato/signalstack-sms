-- Keep the local provider-number metadata deterministic under concurrent default-number writes.
-- Partial indexes are not expressible in the Prisma schema, so this invariant lives in SQL.
CREATE UNIQUE INDEX "ProviderPhoneNumber_one_default_per_org"
ON "ProviderPhoneNumber" ("orgId")
WHERE "isDefault" = true;
