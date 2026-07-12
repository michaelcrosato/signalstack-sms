import {
  ProviderAccountStatus,
  ProviderPhoneNumberStatus,
  type Prisma
} from "@prisma/client";
import { resolveVerifiedProviderDestination } from "@/lib/db/provider-routing";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import {
  decryptProviderCredentialEnvelope,
  hashProviderLookupIdentifier,
  readProviderCredentialMasterKey,
  type ProviderCredentialEnvelope
} from "@/lib/integrations/provider-accounts/credential-encryption";
import { providerFactory, type ProviderFactory } from "@/lib/messaging/provider/factory";
import {
  e164PhoneNumberSchema,
  twilioAccountSidSchema
} from "@/lib/validation/provider";

const PROVIDER = "twilio" as const;

export type ProviderCallbackKind = "inbound" | "status";

export type VerifiedProviderCallbackBinding = Readonly<{
  orgId: string;
  provider: typeof PROVIDER;
  providerAccountId: string;
  providerPhoneNumberId: string;
  providerCredentialSecretId: string;
  credentialVersion: number;
  credentialFingerprint: string;
  externalAccountId: string;
  phoneNumber: string;
}>;

export type ProviderCallbackRoutingDependencies = Readonly<{
  environment?: Readonly<Record<string, string | undefined>>;
  factory?: ProviderFactory;
  resolve?: typeof resolveVerifiedProviderDestination;
}>;

export class ProviderCallbackAuthenticationError extends Error {
  readonly code: "INVALID_PROVIDER_CALLBACK" | "WEBHOOK_ROUTING_UNAVAILABLE";

  constructor(code: ProviderCallbackAuthenticationError["code"]) {
    super(
      code === "INVALID_PROVIDER_CALLBACK"
        ? "Provider callback rejected."
        : "Provider callback routing is unavailable."
    );
    this.name = "ProviderCallbackAuthenticationError";
    this.code = code;
  }
}

export function createProviderCallbackFailureResponse(error: unknown): Response {
  const unavailable =
    error instanceof ProviderCallbackAuthenticationError &&
    error.code === "WEBHOOK_ROUTING_UNAVAILABLE";
  return Response.json(
    unavailable
      ? { error: "Provider callback routing is unavailable.", code: "WEBHOOK_ROUTING_UNAVAILABLE" }
      : { error: "Provider callback rejected.", code: "INVALID_PROVIDER_CALLBACK" },
    {
      status: unavailable ? 503 : 403,
      headers: { "Cache-Control": "no-store, max-age=0" }
    }
  );
}

export async function authenticateTwilioProviderCallback(
  input: Readonly<{
    kind: ProviderCallbackKind;
    url: string;
    signature: string | null;
    params: Readonly<Record<string, string>>;
  }>,
  dependencies: ProviderCallbackRoutingDependencies = {}
): Promise<VerifiedProviderCallbackBinding> {
  const accountId = twilioAccountSidSchema.safeParse(input.params.AccountSid);
  const destination = e164PhoneNumberSchema.safeParse(
    input.kind === "inbound" ? input.params.To : input.params.From
  );
  if (!accountId.success || !destination.success || !validCallbackUrl(input.url)) {
    throw callbackError("INVALID_PROVIDER_CALLBACK");
  }

  let masterKey: Buffer;
  let resolved: Awaited<ReturnType<typeof resolveVerifiedProviderDestination>>;
  try {
    masterKey = readProviderCredentialMasterKey(dependencies.environment ?? process.env);
    resolved = await (dependencies.resolve ?? resolveVerifiedProviderDestination)({
      provider: PROVIDER,
      externalAccountIdHash: hashProviderLookupIdentifier({
        masterKey,
        provider: PROVIDER,
        kind: "account",
        value: accountId.data
      }),
      phoneNumberHash: hashProviderLookupIdentifier({
        masterKey,
        provider: PROVIDER,
        kind: "phone_number",
        value: destination.data
      })
    });
  } catch (error) {
    if (error instanceof ProviderCallbackAuthenticationError) throw error;
    throw callbackError("WEBHOOK_ROUTING_UNAVAILABLE");
  }
  if (!resolved) throw callbackError("INVALID_PROVIDER_CALLBACK");

  let snapshot: Awaited<ReturnType<typeof loadProviderCallbackCredential>>;
  try {
    snapshot = await loadProviderCallbackCredential(resolved);
  } catch (error) {
    if (error instanceof ProviderCallbackAuthenticationError) throw error;
    throw callbackError("WEBHOOK_ROUTING_UNAVAILABLE");
  }
  if (
    snapshot.account.externalAccountId !== accountId.data ||
    snapshot.number.phoneNumber !== destination.data
  ) {
    throw callbackError("INVALID_PROVIDER_CALLBACK");
  }

  let token: ReturnType<typeof decryptProviderCredentialEnvelope>;
  try {
    token = decryptProviderCredentialEnvelope({
      envelope: envelopeFromSnapshot(snapshot.secret),
      masterKey,
      binding: {
        orgId: resolved.orgId,
        provider: PROVIDER,
        externalAccountId: snapshot.account.externalAccountId,
        externalAccountIdHash: snapshot.account.externalAccountIdHash,
        providerAccountId: resolved.providerAccountId,
        secretId: snapshot.secret.id,
        credentialVersion: snapshot.secret.version
      }
    });
  } catch {
    throw callbackError("WEBHOOK_ROUTING_UNAVAILABLE");
  }
  let validSignature = false;
  try {
    const adapter = (dependencies.factory ?? providerFactory).create({
      name: PROVIDER,
      credentials: { externalAccountId: snapshot.account.externalAccountId, token }
    });
    validSignature = adapter.validateSignature({
      signature: input.signature,
      url: input.url,
      params: input.params
    });
  } catch {
    throw callbackError("WEBHOOK_ROUTING_UNAVAILABLE");
  }
  if (!validSignature) throw callbackError("INVALID_PROVIDER_CALLBACK");

  return Object.freeze({
    orgId: resolved.orgId,
    provider: PROVIDER,
    providerAccountId: resolved.providerAccountId,
    providerPhoneNumberId: resolved.providerPhoneNumberId,
    providerCredentialSecretId: snapshot.secret.id,
    credentialVersion: snapshot.secret.version,
    credentialFingerprint: snapshot.secret.fingerprint,
    externalAccountId: snapshot.account.externalAccountId,
    phoneNumber: snapshot.number.phoneNumber
  });
}

/** Lock and recheck the exact routing generation immediately before any tenant persistence. */
export async function assertProviderCallbackBindingActive(
  tx: Prisma.TransactionClient,
  binding: VerifiedProviderCallbackBinding
): Promise<void> {
  await tx.$queryRaw`
    SELECT account.id
    FROM "ProviderAccount" account
    JOIN "ProviderPhoneNumber" number
      ON number."orgId" = account."orgId"
     AND number."providerAccountId" = account.id
    JOIN "ProviderCredentialSecret" secret
      ON secret."orgId" = account."orgId"
     AND secret."providerAccountId" = account.id
    WHERE account."orgId" = ${binding.orgId}
      AND account.id = ${binding.providerAccountId}
      AND number.id = ${binding.providerPhoneNumberId}
      AND secret.id = ${binding.providerCredentialSecretId}
    FOR SHARE OF account, number, secret
  `;
  const [account, number, secret] = await Promise.all([
    tx.providerAccount.findFirst({
      where: {
        orgId: binding.orgId,
        id: binding.providerAccountId,
        provider: binding.provider,
        externalAccountId: binding.externalAccountId,
        status: ProviderAccountStatus.VERIFIED,
        revokedAt: null
      },
      select: { id: true }
    }),
    tx.providerPhoneNumber.findFirst({
      where: {
        orgId: binding.orgId,
        id: binding.providerPhoneNumberId,
        provider: binding.provider,
        providerAccountId: binding.providerAccountId,
        phoneNumber: binding.phoneNumber,
        status: ProviderPhoneNumberStatus.VERIFIED,
        disabledAt: null
      },
      select: { id: true }
    }),
    tx.providerCredentialSecret.findFirst({
      where: {
        orgId: binding.orgId,
        id: binding.providerCredentialSecretId,
        providerAccountId: binding.providerAccountId,
        version: binding.credentialVersion,
        fingerprint: binding.credentialFingerprint,
        retiredAt: null
      },
      select: { id: true }
    })
  ]);
  if (!account || !number || !secret) {
    throw callbackError("INVALID_PROVIDER_CALLBACK");
  }
}

async function loadProviderCallbackCredential(resolved: {
  orgId: string;
  providerAccountId: string;
  providerPhoneNumberId: string;
}) {
  return withTenantTransaction({ orgId: resolved.orgId }, async (tx) => {
    const account = await tx.providerAccount.findFirst({
      where: {
        orgId: resolved.orgId,
        id: resolved.providerAccountId,
        provider: PROVIDER,
        status: ProviderAccountStatus.VERIFIED,
        revokedAt: null
      },
      select: { externalAccountId: true, externalAccountIdHash: true }
    });
    const number = await tx.providerPhoneNumber.findFirst({
      where: {
        orgId: resolved.orgId,
        id: resolved.providerPhoneNumberId,
        provider: PROVIDER,
        providerAccountId: resolved.providerAccountId,
        status: ProviderPhoneNumberStatus.VERIFIED,
        disabledAt: null
      },
      select: { phoneNumber: true }
    });
    const secret = await tx.providerCredentialSecret.findFirst({
      where: {
        orgId: resolved.orgId,
        providerAccountId: resolved.providerAccountId,
        retiredAt: null
      },
      orderBy: { version: "desc" }
    });
    if (!account || !number || !secret) {
      throw callbackError("INVALID_PROVIDER_CALLBACK");
    }
    return Object.freeze({ account, number, secret });
  });
}

function envelopeFromSnapshot(secret: {
  envelopeVersion: number;
  algorithm: string;
  keyVersion: number;
  iv: string;
  ciphertext: string;
  authTag: string;
  fingerprint: string;
}): ProviderCredentialEnvelope {
  return {
    envelopeVersion: secret.envelopeVersion as 1,
    algorithm: secret.algorithm as "aes-256-gcm",
    keyVersion: secret.keyVersion,
    iv: secret.iv,
    ciphertext: secret.ciphertext,
    authTag: secret.authTag,
    fingerprint: secret.fingerprint
  };
}

function validCallbackUrl(value: string): boolean {
  if (typeof value !== "string" || value.length < 1 || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost")) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function callbackError(
  code: ProviderCallbackAuthenticationError["code"]
): ProviderCallbackAuthenticationError {
  return new ProviderCallbackAuthenticationError(code);
}
