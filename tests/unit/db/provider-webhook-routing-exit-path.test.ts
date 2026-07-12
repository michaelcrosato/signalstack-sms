import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  PrismaClient,
  ProviderAccountStatus,
  ProviderPhoneNumberStatus,
  type Prisma
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { resolveVerifiedProviderDestination } from "@/lib/db/provider-routing";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import {
  createProviderCredentialEnvelope,
  hashProviderLookupIdentifier,
  type ProviderCredentialEnvelope
} from "@/lib/integrations/provider-accounts/credential-encryption";
import {
  assertProviderCallbackBindingActive,
  authenticateTwilioProviderCallback,
  type VerifiedProviderCallbackBinding
} from "@/lib/integrations/provider-accounts/webhook-routing";

const run = process.env.RUN_DB_TESTS === "true";
const provider = "twilio" as const;
const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
const loginRole = `signalstack_test_routing_${suffix}`;
const loginPassword = `provider-routing-${suffix}-A9`;
const masterKey = createHash("sha256")
  .update(`signalstack-m4-routing-master:${suffix}`, "utf8")
  .digest("hex");
const callbackOrigin = "https://sms.example.test";

type AccountFixture = Readonly<{
  orgId: string;
  accountId: string;
  externalAccountId: string;
  externalAccountIdHash: string;
  phoneNumberId: string;
  phoneNumber: string;
  phoneNumberHash: string;
  secretId: string;
  credentialVersion: number;
  credentialFingerprint: string;
  authToken: string;
  providerMessageId: string;
}>;

type RoutingFixture = Readonly<{
  accountA: AccountFixture;
  accountB: AccountFixture;
  checkedAt: Date;
}>;

describe.runIf(run)("M4 signed two-account provider-routing exit path", () => {
  let runtime: PrismaClient | undefined;
  let fixture: RoutingFixture | undefined;
  let roleCreated = false;

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`
      CREATE ROLE "${loginRole}"
      LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
      PASSWORD '${loginPassword}'
    `);
    roleCreated = true;
    await prisma.$executeRawUnsafe(`GRANT signalstack_web TO "${loginRole}"`);
    runtime = new PrismaClient({ datasourceUrl: routingDatabaseUrl() });
    await runtime.$connect();
    fixture = await seedRoutingFixture();
  });

  afterAll(async () => {
    if (fixture) {
      await prisma.organization.deleteMany({
        where: { id: { in: [fixture.accountA.orgId, fixture.accountB.orgId] } }
      });
    }
    await runtime?.$disconnect();
    if (roleCreated) {
      await prisma.$executeRawUnsafe(`REVOKE signalstack_web FROM "${loginRole}"`);
      await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS "${loginRole}"`);
    }
  });

  it("selects A/B exactly and rejects crossed, wrong-token, and unknown callback evidence", async () => {
    const seeded = requireFixture(fixture);
    const client = requireClient(runtime);
    const resolve = resolverUsing(client);

    try {
      const directRows = await client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_web");
        return tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "ProviderAccount" LIMIT 1`;
      });
      expect(directRows).toEqual([]);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }

    const bindingA = await authenticate(seeded.accountA, seeded.accountA.phoneNumber, seeded.accountA.authToken, resolve);
    const bindingB = await authenticate(
      seeded.accountB,
      seeded.accountB.phoneNumber,
      seeded.accountB.authToken,
      resolve,
      "status"
    );

    expect(bindingA).toMatchObject({
      orgId: seeded.accountA.orgId,
      providerAccountId: seeded.accountA.accountId,
      providerPhoneNumberId: seeded.accountA.phoneNumberId,
      providerCredentialSecretId: seeded.accountA.secretId,
      credentialVersion: 1
    });
    expect(bindingB).toMatchObject({
      orgId: seeded.accountB.orgId,
      providerAccountId: seeded.accountB.accountId,
      providerPhoneNumberId: seeded.accountB.phoneNumberId,
      providerCredentialSecretId: seeded.accountB.secretId,
      credentialVersion: 1
    });
    expect(bindingA.orgId).not.toBe(bindingB.orgId);

    await expectBindingActive(bindingA);
    await expectBindingActive(bindingB);

    await expect(
      authenticate(
        seeded.accountA,
        seeded.accountB.phoneNumber,
        seeded.accountA.authToken,
        resolve
      )
    ).rejects.toMatchObject({ code: "INVALID_PROVIDER_CALLBACK" });

    await expect(
      authenticate(
        seeded.accountA,
        seeded.accountA.phoneNumber,
        seeded.accountB.authToken,
        resolve
      )
    ).rejects.toMatchObject({ code: "INVALID_PROVIDER_CALLBACK" });

    await expect(
      authenticate(
        seeded.accountA,
        uniquePhoneNumber("unknown-destination"),
        seeded.accountA.authToken,
        resolve
      )
    ).rejects.toMatchObject({ code: "INVALID_PROVIDER_CALLBACK" });

    expect(await prisma.webhookEvent.count({
      where: { orgId: { in: [seeded.accountA.orgId, seeded.accountB.orgId] } }
    })).toBe(0);
  });

  it("rejects authenticated bindings after credential rotation and account revocation", async () => {
    const seeded = requireFixture(fixture);
    const resolve = resolverUsing(requireClient(runtime));
    const initial = await authenticate(
      seeded.accountA,
      seeded.accountA.phoneNumber,
      seeded.accountA.authToken,
      resolve
    );
    await expectBindingActive(initial);

    const nextToken = strictToken("account-a-rotated-token");
    const nextSecretId = randomUUID();
    const nextVersion = initial.credentialVersion + 1;
    const nextEnvelope = credentialEnvelope({
      account: seeded.accountA,
      secretId: nextSecretId,
      credentialVersion: nextVersion,
      authToken: nextToken
    });
    const rotatedAt = new Date(seeded.checkedAt.getTime() + 1_000);
    await prisma.$transaction(async (tx) => {
      await tx.providerCredentialSecret.update({
        where: { id: initial.providerCredentialSecretId },
        data: { retiredAt: rotatedAt }
      });
      await tx.providerCredentialSecret.create({
        data: {
          id: nextSecretId,
          orgId: seeded.accountA.orgId,
          providerAccountId: seeded.accountA.accountId,
          version: nextVersion,
          ...envelopeColumns(nextEnvelope),
          activeFrom: rotatedAt
        }
      });
    });

    await expectBindingRejected(initial);

    const rotated = await authenticate(
      seeded.accountA,
      seeded.accountA.phoneNumber,
      nextToken,
      resolve
    );
    expect(rotated).toMatchObject({
      providerCredentialSecretId: nextSecretId,
      credentialVersion: nextVersion,
      credentialFingerprint: nextEnvelope.fingerprint
    });
    await expectBindingActive(rotated);

    const revokedAt = new Date(seeded.checkedAt.getTime() + 2_000);
    await prisma.$transaction(async (tx) => {
      await tx.providerCredentialSecret.update({
        where: { id: nextSecretId },
        data: { retiredAt: revokedAt }
      });
      await tx.providerPhoneNumber.update({
        where: { id: seeded.accountA.phoneNumberId },
        data: {
          status: ProviderPhoneNumberStatus.DISABLED,
          isDefault: false,
          disabledAt: revokedAt
        }
      });
      await tx.providerAccount.update({
        where: { id: seeded.accountA.accountId },
        data: {
          status: ProviderAccountStatus.REVOKED,
          isDefault: false,
          revokedAt,
          lastCheckedAt: revokedAt
        }
      });
    });

    await expectBindingRejected(rotated);
    await expect(
      authenticate(seeded.accountA, seeded.accountA.phoneNumber, nextToken, resolve)
    ).rejects.toMatchObject({ code: "INVALID_PROVIDER_CALLBACK" });

    const stillActiveB = await authenticate(
      seeded.accountB,
      seeded.accountB.phoneNumber,
      seeded.accountB.authToken,
      resolve,
      "status"
    );
    await expectBindingActive(stillActiveB);
  });
});

async function seedRoutingFixture(): Promise<RoutingFixture> {
  const checkedAt = new Date();
  return prisma.$transaction(async (tx) => {
    const orgA = await tx.organization.create({
      data: { name: "Provider Routing Exit A", slug: `provider-routing-exit-a-${suffix}` }
    });
    const orgB = await tx.organization.create({
      data: { name: "Provider Routing Exit B", slug: `provider-routing-exit-b-${suffix}` }
    });
    const accountA = await seedAccount(tx, {
      orgId: orgA.id,
      discriminator: "a",
      checkedAt
    });
    const accountB = await seedAccount(tx, {
      orgId: orgB.id,
      discriminator: "b",
      checkedAt
    });
    return Object.freeze({ accountA, accountB, checkedAt });
  });
}

async function seedAccount(
  tx: Prisma.TransactionClient,
  input: Readonly<{ orgId: string; discriminator: "a" | "b"; checkedAt: Date }>
): Promise<AccountFixture> {
  const accountId = randomUUID();
  const phoneNumberId = randomUUID();
  const secretId = randomUUID();
  const externalAccountId = `AC${strictHex(`account-${input.discriminator}`)}`;
  const phoneNumber = uniquePhoneNumber(`phone-${input.discriminator}`);
  const externalAccountIdHash = lookupHash("account", externalAccountId);
  const phoneNumberHash = lookupHash("phone_number", phoneNumber);
  const authToken = strictToken(`token-${input.discriminator}`);
  const credentialVersion = 1;
  const envelope = createProviderCredentialEnvelope({
    secret: authToken,
    masterKey,
    keyVersion: 1,
    binding: {
      orgId: input.orgId,
      provider,
      externalAccountId,
      externalAccountIdHash,
      providerAccountId: accountId,
      secretId,
      credentialVersion
    }
  });
  await tx.providerAccount.create({
    data: {
      id: accountId,
      orgId: input.orgId,
      provider,
      externalAccountId,
      externalAccountIdHash,
      externalAccountIdLast4: externalAccountId.slice(-4),
      status: ProviderAccountStatus.VERIFIED,
      isDefault: true,
      accountStatus: "active",
      verifiedAt: input.checkedAt,
      lastCheckedAt: input.checkedAt
    }
  });
  await tx.providerCredentialSecret.create({
    data: {
      id: secretId,
      orgId: input.orgId,
      providerAccountId: accountId,
      version: credentialVersion,
      ...envelopeColumns(envelope),
      activeFrom: input.checkedAt
    }
  });
  const externalNumberId = `PN${strictHex(`number-${input.discriminator}`)}`;
  await tx.providerPhoneNumber.create({
    data: {
      id: phoneNumberId,
      orgId: input.orgId,
      phoneNumber,
      phoneNumberHash,
      provider,
      providerAccountId: accountId,
      externalNumberId,
      externalNumberIdLast4: externalNumberId.slice(-4),
      status: ProviderPhoneNumberStatus.VERIFIED,
      capabilities: ["sms", "mms"],
      isDefault: true,
      verifiedAt: input.checkedAt,
      lastCheckedAt: input.checkedAt
    }
  });
  return Object.freeze({
    orgId: input.orgId,
    accountId,
    externalAccountId,
    externalAccountIdHash,
    phoneNumberId,
    phoneNumber,
    phoneNumberHash,
    secretId,
    credentialVersion,
    credentialFingerprint: envelope.fingerprint,
    authToken,
    providerMessageId: `SM${strictHex(`message-${input.discriminator}`)}`
  });
}

async function authenticate(
  account: AccountFixture,
  destination: string,
  signingToken: string,
  resolve: typeof resolveVerifiedProviderDestination,
  kind: "inbound" | "status" = "inbound"
): Promise<VerifiedProviderCallbackBinding> {
  const url = `${callbackOrigin}/api/webhooks/twilio/${kind}`;
  const params = Object.freeze({
    AccountSid: account.externalAccountId,
    From: kind === "inbound" ? "+14155550100" : destination,
    To: kind === "inbound" ? destination : "+14155550100",
    Body: "signed routing fixture",
    MessageSid: account.providerMessageId,
    ...(kind === "status" ? { MessageStatus: "delivered" } : {})
  });
  return authenticateTwilioProviderCallback(
    {
      kind,
      url,
      signature: twilioSignature(url, params, signingToken),
      params
    },
    { environment: { SECRETS_MASTER_KEY: masterKey }, resolve }
  );
}

function resolverUsing(client: PrismaClient): typeof resolveVerifiedProviderDestination {
  return (input) => resolveVerifiedProviderDestination(input, { client, attest: false });
}

async function expectBindingActive(binding: VerifiedProviderCallbackBinding): Promise<void> {
  await expect(
    withTenantTransaction(
      { orgId: binding.orgId },
      (tx) => assertProviderCallbackBindingActive(tx, binding),
      { client: prisma, attest: false }
    )
  ).resolves.toBeUndefined();
}

async function expectBindingRejected(binding: VerifiedProviderCallbackBinding): Promise<void> {
  await expect(
    withTenantTransaction(
      { orgId: binding.orgId },
      (tx) => assertProviderCallbackBindingActive(tx, binding),
      { client: prisma, attest: false }
    )
  ).rejects.toMatchObject({ code: "INVALID_PROVIDER_CALLBACK" });
}

function credentialEnvelope(input: {
  account: AccountFixture;
  secretId: string;
  credentialVersion: number;
  authToken: string;
}): ProviderCredentialEnvelope {
  return createProviderCredentialEnvelope({
    secret: input.authToken,
    masterKey,
    keyVersion: 1,
    binding: {
      orgId: input.account.orgId,
      provider,
      externalAccountId: input.account.externalAccountId,
      externalAccountIdHash: input.account.externalAccountIdHash,
      providerAccountId: input.account.accountId,
      secretId: input.secretId,
      credentialVersion: input.credentialVersion
    }
  });
}

function envelopeColumns(envelope: ProviderCredentialEnvelope) {
  return {
    envelopeVersion: envelope.envelopeVersion,
    algorithm: envelope.algorithm,
    keyVersion: envelope.keyVersion,
    iv: envelope.iv,
    ciphertext: envelope.ciphertext,
    authTag: envelope.authTag,
    fingerprint: envelope.fingerprint
  } as const;
}

function lookupHash(kind: "account" | "phone_number", value: string): string {
  return hashProviderLookupIdentifier({ masterKey, provider, kind, value });
}

function twilioSignature(url: string, params: Readonly<Record<string, string>>, token: string): string {
  const base = Object.keys(params)
    .sort()
    .reduce((value, key) => `${value}${key}${params[key]}`, url);
  return createHmac("sha1", token).update(base, "utf8").digest("base64");
}

function strictHex(label: string): string {
  return createHash("sha256").update(`${suffix}:${label}`, "utf8").digest("hex").slice(0, 32);
}

function strictToken(label: string): string {
  return strictHex(label);
}

function uniquePhoneNumber(label: string): string {
  const numeric = BigInt(`0x${strictHex(label).slice(0, 12)}`);
  return `+1415${(numeric % 10_000_000n).toString().padStart(7, "0")}`;
}

function requireFixture(value: RoutingFixture | undefined): RoutingFixture {
  if (!value) throw new Error("Provider routing exit fixture was not initialized.");
  return value;
}

function requireClient(value: PrismaClient | undefined): PrismaClient {
  if (!value) throw new Error("Provider routing runtime client was not initialized.");
  return value;
}

function routingDatabaseUrl(): string {
  const source = process.env.DATABASE_URL;
  if (!source) throw new Error("DATABASE_URL is required for provider routing exit tests.");
  const url = new URL(source);
  url.username = loginRole;
  url.password = loginPassword;
  url.searchParams.set("connection_limit", "1");
  return url.toString();
}
