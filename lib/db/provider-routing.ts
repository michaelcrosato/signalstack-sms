import type { PrismaClient } from "@prisma/client";
import { withProviderRoutingTransaction } from "@/lib/db/tenant-context";

export type VerifiedProviderDestination = Readonly<{
  orgId: string;
  providerAccountId: string;
  providerPhoneNumberId: string;
}>;

type ProviderDestinationRow = Readonly<{
  orgId: string;
  providerAccountId: string;
  providerPhoneNumberId: string;
}>;

/** Resolve one exact hash-bound destination without granting broad pre-tenant table reads. */
export async function resolveVerifiedProviderDestination(
  input: Readonly<{
    provider: string;
    externalAccountIdHash: string;
    phoneNumberHash: string;
  }>,
  options: Readonly<{ client?: PrismaClient; attest?: boolean }> = {}
): Promise<VerifiedProviderDestination | null> {
  assertProvider(input.provider);
  assertLookupHash(input.externalAccountIdHash);
  assertLookupHash(input.phoneNumberHash);
  const rows = await withProviderRoutingTransaction(
    (tx) =>
      tx.$queryRaw<ProviderDestinationRow[]>`
        SELECT
          "orgId",
          "providerAccountId",
          "providerPhoneNumberId"
        FROM public.resolve_verified_provider_destination(
          ${input.provider},
          ${input.externalAccountIdHash},
          ${input.phoneNumberHash}
        )
      `,
    options
  );
  if (rows.length === 0) return null;
  if (rows.length !== 1) {
    throw new Error("Provider destination resolver returned an invalid result.");
  }
  const row = rows[0];
  for (const value of Object.values(row)) {
    if (!validIdentifier(value)) {
      throw new Error("Provider destination resolver returned an invalid result.");
    }
  }
  return Object.freeze({ ...row });
}

function assertProvider(value: string): void {
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(value)) {
    throw new TypeError("Provider routing evidence is invalid.");
  }
}

function assertLookupHash(value: string): void {
  if (!/^pvlookup_v1_[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new TypeError("Provider routing evidence is invalid.");
  }
}

function validIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 191 &&
    value === value.trim() &&
    !Array.from(value).some((character) => (character.codePointAt(0) ?? 0) < 32)
  );
}
