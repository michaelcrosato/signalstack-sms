import { createHash, randomUUID } from "node:crypto";
import {
  PrismaClient,
  ProviderAccountStatus,
  ProviderMessagingServiceStatus,
  ProviderPhoneNumberStatus
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";

const run = process.env.RUN_DB_TESTS === "true";
const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
const loginRole = `signalstack_test_provider_${suffix}`;
const loginPassword = `provider-runtime-${suffix}-A9`;
const provider = "twilio";

type Fixture = Readonly<{
  orgAId: string;
  orgBId: string;
  accountAId: string;
  accountBId: string;
  accountAHash: string;
  accountBHash: string;
  secretAId: string;
  serviceAId: string;
  serviceBId: string;
  phoneAId: string;
  phoneBId: string;
  phoneAHash: string;
  phoneBHash: string;
}>;

describe.runIf(run)("M4 provider ownership database substrate", () => {
  let runtime: PrismaClient | undefined;
  let fixture: Fixture | undefined;

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`
      CREATE ROLE "${loginRole}"
      LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
      PASSWORD '${loginPassword}'
    `);
    await prisma.$executeRawUnsafe(`GRANT signalstack_web TO "${loginRole}"`);
    runtime = new PrismaClient({ datasourceUrl: runtimeDatabaseUrl() });
    await runtime.$connect();
    fixture = await seedFixture();
  });

  afterAll(async () => {
    if (fixture) {
      await prisma.organization.deleteMany({
        where: { id: { in: [fixture.orgAId, fixture.orgBId] } }
      });
    }
    await runtime?.$disconnect();
    await prisma.$executeRawUnsafe(`REVOKE signalstack_web FROM "${loginRole}"`);
    await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS "${loginRole}"`);
  });

  it("resolves only one exact verified hash tuple through the web-only capability", async () => {
    const seeded = requireFixture(fixture);
    const client = requireClient(runtime);
    const resolved = await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_web");
      return tx.$queryRaw<
        Array<{ orgId: string; providerAccountId: string; providerPhoneNumberId: string }>
      >`
        SELECT *
        FROM public.resolve_verified_provider_destination(
          ${provider},
          ${seeded.accountAHash},
          ${seeded.phoneAHash}
        )
      `;
    });
    expect(resolved).toEqual([
      {
        orgId: seeded.orgAId,
        providerAccountId: seeded.accountAId,
        providerPhoneNumberId: seeded.phoneAId
      }
    ]);
    expect(Object.keys(resolved[0] ?? {}).sort()).toEqual([
      "orgId",
      "providerAccountId",
      "providerPhoneNumberId"
    ]);

    const missing = await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_web");
      return tx.$queryRaw`
        SELECT *
        FROM public.resolve_verified_provider_destination(
          ${provider},
          ${seeded.accountAHash},
          ${hmac("unowned-destination")}
        )
      `;
    });
    expect(missing).toEqual([]);

    await expect(
      client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_runtime");
        return tx.$queryRaw`
          SELECT *
          FROM public.resolve_verified_provider_destination(
            ${provider},
            ${seeded.accountAHash},
            ${seeded.phoneAHash}
          )
        `;
      })
    ).rejects.toThrow();
    await expect(
      client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_web");
        return tx.$queryRaw`
          SELECT * FROM public.resolve_verified_provider_destination(
            ${"Twilio"}, ${seeded.accountAHash}, ${seeded.phoneAHash}
          )
        `;
      })
    ).rejects.toThrow("Provider destination resolver arguments are invalid");
  });

  it("enforces provider-scoped exact IDs and global verified hash ownership", async () => {
    const seeded = requireFixture(fixture);
    const checkedAt = new Date();
    await expect(
      prisma.providerAccount.create({
        data: {
          orgId: seeded.orgBId,
          provider,
          externalAccountId: `AC${suffix}A`,
          externalAccountIdHash: hmac("duplicate-exact-account"),
          externalAccountIdLast4: `${suffix}A`.slice(-4),
          status: ProviderAccountStatus.VERIFIED,
          verifiedAt: checkedAt,
          lastCheckedAt: checkedAt
        }
      })
    ).rejects.toThrow();

    await expect(
      prisma.providerAccount.create({
        data: {
          orgId: seeded.orgBId,
          provider: "telnyx",
          externalAccountId: `AC${suffix}A`,
          externalAccountIdHash: seeded.accountAHash,
          externalAccountIdLast4: `${suffix}A`.slice(-4),
          status: ProviderAccountStatus.VERIFIED,
          verifiedAt: checkedAt,
          lastCheckedAt: checkedAt
        }
      })
    ).rejects.toThrow();

    await expect(
      prisma.providerAccount.create({
        data: {
          orgId: seeded.orgBId,
          provider: "telnyx",
          externalAccountId: `AC${suffix}A`,
          externalAccountIdHash: hmac("telnyx-account"),
          externalAccountIdLast4: `${suffix}A`.slice(-4),
          status: ProviderAccountStatus.VERIFIED,
          verifiedAt: checkedAt,
          lastCheckedAt: checkedAt
        }
      })
    ).resolves.toMatchObject({ provider: "telnyx", externalAccountId: `AC${suffix}A` });

    await expect(
      prisma.providerPhoneNumber.create({
        data: {
          orgId: seeded.orgBId,
          phoneNumber: `+1415${numericTail("duplicate-verified")}`,
          phoneNumberHash: seeded.phoneAHash,
          provider,
          providerAccountId: seeded.accountBId,
          providerMessagingServiceId: seeded.serviceBId,
          externalNumberId: `PN${suffix}D`,
          externalNumberIdLast4: `${suffix}D`.slice(-4),
          status: ProviderPhoneNumberStatus.VERIFIED,
          capabilities: ["sms"],
          verifiedAt: checkedAt,
          lastCheckedAt: checkedAt
        }
      })
    ).rejects.toThrow();

    await expect(
      prisma.providerPhoneNumber.create({
        data: {
          orgId: seeded.orgBId,
          phoneNumber: `+1415${numericTail("legacy-duplicate")}`,
          phoneNumberHash: seeded.phoneAHash,
          provider,
          status: ProviderPhoneNumberStatus.CONFIGURED,
          capabilities: { sms: true }
        }
      })
    ).resolves.toMatchObject({ status: ProviderPhoneNumberStatus.CONFIGURED });

    const duplicateHashServiceId = `MG${suffix}H`;
    await expect(
      prisma.providerMessagingService.create({
        data: {
          orgId: seeded.orgBId,
          providerAccountId: seeded.accountBId,
          provider,
          externalServiceId: duplicateHashServiceId,
          externalServiceIdHash: hmac("service-a"),
          externalServiceIdLast4: duplicateHashServiceId.slice(-4),
          status: ProviderMessagingServiceStatus.VERIFIED,
          capabilities: ["sms", "mms"],
          verifiedAt: checkedAt,
          lastCheckedAt: checkedAt
        }
      })
    ).rejects.toThrow();
  });

  it("requires canonical live capabilities and one verified identity-binding transition", async () => {
    const seeded = requireFixture(fixture);
    const checkedAt = new Date();
    const invalidServiceId = `MG${suffix}C`;
    await expect(
      prisma.providerMessagingService.create({
        data: {
          orgId: seeded.orgBId,
          providerAccountId: seeded.accountBId,
          provider,
          externalServiceId: invalidServiceId,
          externalServiceIdHash: hmac("invalid-service-capabilities"),
          externalServiceIdLast4: invalidServiceId.slice(-4),
          status: ProviderMessagingServiceStatus.VERIFIED,
          capabilities: { sms: true },
          verifiedAt: checkedAt,
          lastCheckedAt: checkedAt
        }
      })
    ).rejects.toThrow();

    const disabledServiceId = `MG${suffix}Z`;
    await expect(
      prisma.providerMessagingService.create({
        data: {
          orgId: seeded.orgBId,
          providerAccountId: seeded.accountBId,
          provider,
          externalServiceId: disabledServiceId,
          externalServiceIdHash: hmac("initially-disabled-service"),
          externalServiceIdLast4: disabledServiceId.slice(-4),
          status: ProviderMessagingServiceStatus.DISABLED,
          capabilities: ["sms"],
          verifiedAt: checkedAt,
          lastCheckedAt: checkedAt,
          disabledAt: checkedAt
        }
      })
    ).rejects.toThrow("Provider messaging service must begin verified");

    const invalidPhoneId = `PN${suffix}C`;
    await expect(
      prisma.providerPhoneNumber.create({
        data: {
          orgId: seeded.orgBId,
          phoneNumber: `+1415${numericTail("invalid-capabilities")}`,
          phoneNumberHash: hmac("invalid-phone-capabilities"),
          provider,
          providerAccountId: seeded.accountBId,
          externalNumberId: invalidPhoneId,
          externalNumberIdLast4: invalidPhoneId.slice(-4),
          status: ProviderPhoneNumberStatus.VERIFIED,
          capabilities: { sms: true },
          verifiedAt: checkedAt,
          lastCheckedAt: checkedAt
        }
      })
    ).rejects.toThrow();

    const disabledPhoneId = `PN${suffix}Z`;
    await expect(
      prisma.providerPhoneNumber.create({
        data: {
          orgId: seeded.orgBId,
          phoneNumber: `+1415${numericTail("initially-disabled")}`,
          phoneNumberHash: hmac("initially-disabled-phone"),
          provider,
          providerAccountId: seeded.accountBId,
          externalNumberId: disabledPhoneId,
          externalNumberIdLast4: disabledPhoneId.slice(-4),
          status: ProviderPhoneNumberStatus.DISABLED,
          capabilities: ["sms"],
          verifiedAt: checkedAt,
          lastCheckedAt: checkedAt,
          disabledAt: checkedAt
        }
      })
    ).rejects.toThrow("Owned provider phone must begin verified");

    const rewrittenLegacyPhone = `+1415${numericTail("legacy-identity-rewrite")}`;
    const rewrittenLegacy = await prisma.providerPhoneNumber.create({
      data: {
        orgId: seeded.orgBId,
        phoneNumber: rewrittenLegacyPhone,
        provider,
        status: ProviderPhoneNumberStatus.CONFIGURED,
        capabilities: { sms: true }
      }
    });
    const rewrittenExternalId = `PN${suffix}R`;
    await expect(
      prisma.providerPhoneNumber.update({
        where: { id: rewrittenLegacy.id },
        data: {
          id: `${rewrittenLegacy.id}-rewritten`,
          providerAccountId: seeded.accountBId,
          phoneNumberHash: hmac("legacy-identity-rewrite"),
          externalNumberId: rewrittenExternalId,
          externalNumberIdLast4: rewrittenExternalId.slice(-4),
          status: ProviderPhoneNumberStatus.VERIFIED,
          capabilities: ["sms"],
          verifiedAt: checkedAt,
          lastCheckedAt: checkedAt
        }
      })
    ).rejects.toThrow("Legacy provider phone promotion is invalid");

    const legacyPhone = `+1415${numericTail("legacy-promotion")}`;
    const legacy = await prisma.providerPhoneNumber.create({
      data: {
        orgId: seeded.orgBId,
        phoneNumber: legacyPhone,
        provider,
        status: ProviderPhoneNumberStatus.CONFIGURED,
        capabilities: { sms: true }
      }
    });
    const promotedExternalId = `PN${suffix}V`;
    await expect(
      prisma.providerPhoneNumber.update({
        where: { id: legacy.id },
        data: {
          providerAccountId: seeded.accountBId,
          phoneNumberHash: hmac("legacy-promotion"),
          externalNumberId: promotedExternalId,
          externalNumberIdLast4: promotedExternalId.slice(-4),
          status: ProviderPhoneNumberStatus.VERIFIED,
          capabilities: ["sms"],
          verifiedAt: checkedAt,
          lastCheckedAt: checkedAt
        }
      })
    ).resolves.toMatchObject({
      providerAccountId: seeded.accountBId,
      status: ProviderPhoneNumberStatus.VERIFIED,
      capabilities: ["sms"]
    });

    const demoPhone = await prisma.providerPhoneNumber.create({
      data: {
        orgId: seeded.orgBId,
        phoneNumber: `+1415${numericTail("demo-promotion")}`,
        provider,
        status: ProviderPhoneNumberStatus.DEMO,
        capabilities: ["sms"]
      }
    });
    const rejectedExternalId = `PN${suffix}Y`;
    await expect(
      prisma.providerPhoneNumber.update({
        where: { id: demoPhone.id },
        data: {
          providerAccountId: seeded.accountBId,
          phoneNumberHash: hmac("demo-promotion"),
          externalNumberId: rejectedExternalId,
          externalNumberIdLast4: rejectedExternalId.slice(-4),
          status: ProviderPhoneNumberStatus.VERIFIED,
          capabilities: ["sms"],
          verifiedAt: checkedAt,
          lastCheckedAt: checkedAt
        }
      })
    ).rejects.toThrow("Legacy provider phone promotion is invalid");
  });

  it("rejects cross-tenant account/service ownership and audit subjects", async () => {
    const seeded = requireFixture(fixture);
    const checkedAt = new Date();
    const forgedServiceId = `MG${suffix}X`;
    await expect(
      prisma.providerMessagingService.create({
        data: {
          orgId: seeded.orgBId,
          providerAccountId: seeded.accountAId,
          provider,
          externalServiceId: forgedServiceId,
          externalServiceIdHash: hmac("forged-service"),
          externalServiceIdLast4: forgedServiceId.slice(-4),
          status: ProviderMessagingServiceStatus.VERIFIED,
          capabilities: ["sms", "mms"],
          verifiedAt: checkedAt,
          lastCheckedAt: checkedAt
        }
      })
    ).rejects.toThrow();
    await expect(
      prisma.providerPhoneNumber.create({
        data: {
          orgId: seeded.orgBId,
          phoneNumber: `+1415${numericTail("forged-phone")}`,
          phoneNumberHash: hmac("forged-phone"),
          provider,
          providerAccountId: seeded.accountAId,
          providerMessagingServiceId: seeded.serviceAId,
          externalNumberId: `PN${suffix}X`,
          externalNumberIdLast4: `${suffix}X`.slice(-4),
          status: ProviderPhoneNumberStatus.VERIFIED,
          capabilities: ["sms"],
          verifiedAt: checkedAt,
          lastCheckedAt: checkedAt
        }
      })
    ).rejects.toThrow();
    await expect(
      prisma.integrationAuditEvent.create({
        data: {
          orgId: seeded.orgBId,
          action: "PROVIDER_ACCOUNT_VERIFIED",
          subjectType: "provider_account",
          subjectId: seeded.accountAId
        }
      })
    ).rejects.toThrow();

    for (const subject of [
      ["provider_account", seeded.accountAId],
      ["provider_credential_secret", seeded.secretAId],
      ["provider_messaging_service", seeded.serviceAId],
      ["provider_phone_number", seeded.phoneAId]
    ] as const) {
      await expect(
        prisma.integrationAuditEvent.create({
          data: {
            orgId: seeded.orgAId,
            action: "PROVIDER_OWNERSHIP_RECORDED",
            subjectType: subject[0],
            subjectId: subject[1]
          }
        })
      ).resolves.toMatchObject({ orgId: seeded.orgAId, subjectType: subject[0] });
    }
  });

  it("allows verified re-import after local disable without permitting identity rewrites", async () => {
    const seeded = requireFixture(fixture);
    const disabledAt = new Date();
    await prisma.providerMessagingService.update({
      where: { id: seeded.serviceAId },
      data: {
        status: ProviderMessagingServiceStatus.DISABLED,
        isDefault: false,
        disabledAt
      }
    });
    await expect(
      prisma.providerMessagingService.update({
        where: { id: seeded.serviceAId },
        data: {
          status: ProviderMessagingServiceStatus.VERIFIED,
          disabledAt: null,
          lastCheckedAt: new Date(disabledAt.getTime() + 1)
        }
      })
    ).resolves.toMatchObject({
      status: ProviderMessagingServiceStatus.VERIFIED,
      disabledAt: null
    });

    await prisma.providerPhoneNumber.update({
      where: { id: seeded.phoneAId },
      data: { status: ProviderPhoneNumberStatus.DISABLED, isDefault: false, disabledAt }
    });
    await expect(
      prisma.providerPhoneNumber.update({
        where: { id: seeded.phoneAId },
        data: {
          status: ProviderPhoneNumberStatus.VERIFIED,
          disabledAt: null,
          lastCheckedAt: new Date(disabledAt.getTime() + 1)
        }
      })
    ).resolves.toMatchObject({ status: ProviderPhoneNumberStatus.VERIFIED, disabledAt: null });
    await expect(
      prisma.providerPhoneNumber.update({
        where: { id: seeded.phoneAId },
        data: { phoneNumber: `+1415${numericTail("identity-rewrite")}` }
      })
    ).rejects.toThrow("Verified provider phone identity is immutable");
  });

  it("allows retirement-only secret rotation and denies app hard deletes", async () => {
    const seeded = requireFixture(fixture);
    await expect(
      prisma.providerCredentialSecret.create({
        data: {
          orgId: seeded.orgAId,
          providerAccountId: seeded.accountAId,
          version: 2,
          keyVersion: 1,
          iv: "iv-two",
          ciphertext: "ciphertext-two",
          authTag: "tag-two",
          fingerprint: fingerprint("fingerprint-two")
        }
      })
    ).rejects.toThrow();

    await prisma.providerCredentialSecret.update({
      where: { id: seeded.secretAId },
      data: { retiredAt: new Date() }
    });
    await expect(
      prisma.providerCredentialSecret.update({
        where: { id: seeded.secretAId },
        data: { ciphertext: "tampered" }
      })
    ).rejects.toThrow("Provider credential secret material is immutable");
    await expect(
      prisma.providerCredentialSecret.create({
        data: {
          orgId: seeded.orgAId,
          providerAccountId: seeded.accountAId,
          version: 2,
          keyVersion: 2,
          iv: "iv-two",
          ciphertext: "ciphertext-two",
          authTag: "tag-two",
          fingerprint: fingerprint("fingerprint-two")
        }
      })
    ).resolves.toMatchObject({ version: 2, retiredAt: null });

    const client = requireClient(runtime);
    await expect(
      client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_runtime");
        await tx.$queryRaw`SELECT set_config('app.current_org_id', ${seeded.orgAId}, true)`;
        return tx.providerAccount.delete({ where: { id: seeded.accountAId } });
      })
    ).rejects.toThrow();
  });
});

async function seedFixture(): Promise<Fixture> {
  const checkedAt = new Date();
  const orgA = await prisma.organization.create({
    data: { name: "Provider Ownership A", slug: `provider-ownership-a-${suffix}` }
  });
  const orgB = await prisma.organization.create({
    data: { name: "Provider Ownership B", slug: `provider-ownership-b-${suffix}` }
  });
  const externalAccountA = `AC${suffix}A`;
  const externalAccountB = `AC${suffix}B`;
  const accountAHash = hmac(`account:${externalAccountA}`);
  const accountBHash = hmac(`account:${externalAccountB}`);
  const accountA = await prisma.providerAccount.create({
    data: {
      orgId: orgA.id,
      provider,
      externalAccountId: externalAccountA,
      externalAccountIdHash: accountAHash,
      externalAccountIdLast4: externalAccountA.slice(-4),
      status: ProviderAccountStatus.VERIFIED,
      isDefault: true,
      verifiedAt: checkedAt,
      lastCheckedAt: checkedAt
    }
  });
  const accountB = await prisma.providerAccount.create({
    data: {
      orgId: orgB.id,
      provider,
      externalAccountId: externalAccountB,
      externalAccountIdHash: accountBHash,
      externalAccountIdLast4: externalAccountB.slice(-4),
      status: ProviderAccountStatus.VERIFIED,
      isDefault: true,
      verifiedAt: checkedAt,
      lastCheckedAt: checkedAt
    }
  });
  const secretA = await prisma.providerCredentialSecret.create({
    data: {
      orgId: orgA.id,
      providerAccountId: accountA.id,
      version: 1,
      keyVersion: 1,
      iv: "provider-iv",
      ciphertext: "provider-ciphertext",
      authTag: "provider-auth-tag",
      fingerprint: fingerprint("provider-fingerprint")
    }
  });
  const externalServiceA = `MG${suffix}A`;
  const externalServiceB = `MG${suffix}B`;
  const serviceA = await prisma.providerMessagingService.create({
    data: {
      orgId: orgA.id,
      providerAccountId: accountA.id,
      provider,
      externalServiceId: externalServiceA,
      externalServiceIdHash: hmac("service-a"),
      externalServiceIdLast4: externalServiceA.slice(-4),
      status: ProviderMessagingServiceStatus.VERIFIED,
      isDefault: true,
      capabilities: ["sms", "mms"],
      verifiedAt: checkedAt,
      lastCheckedAt: checkedAt
    }
  });
  const serviceB = await prisma.providerMessagingService.create({
    data: {
      orgId: orgB.id,
      providerAccountId: accountB.id,
      provider,
      externalServiceId: externalServiceB,
      externalServiceIdHash: hmac("service-b"),
      externalServiceIdLast4: externalServiceB.slice(-4),
      status: ProviderMessagingServiceStatus.VERIFIED,
      isDefault: true,
      capabilities: ["sms", "mms"],
      verifiedAt: checkedAt,
      lastCheckedAt: checkedAt
    }
  });
  const externalNumberA = `PN${suffix}A`;
  const externalNumberB = `PN${suffix}B`;
  const phoneAHash = hmac("phone-a");
  const phoneBHash = hmac("phone-b");
  const phoneA = await prisma.providerPhoneNumber.create({
    data: {
      orgId: orgA.id,
      phoneNumber: `+1415${numericTail("phone-a")}`,
      phoneNumberHash: phoneAHash,
      provider,
      providerAccountId: accountA.id,
      providerMessagingServiceId: serviceA.id,
      externalNumberId: externalNumberA,
      externalNumberIdLast4: externalNumberA.slice(-4),
      status: ProviderPhoneNumberStatus.VERIFIED,
      capabilities: ["sms", "mms"],
      isDefault: true,
      verifiedAt: checkedAt,
      lastCheckedAt: checkedAt
    }
  });
  const phoneB = await prisma.providerPhoneNumber.create({
    data: {
      orgId: orgB.id,
      phoneNumber: `+1415${numericTail("phone-b")}`,
      phoneNumberHash: phoneBHash,
      provider,
      providerAccountId: accountB.id,
      providerMessagingServiceId: serviceB.id,
      externalNumberId: externalNumberB,
      externalNumberIdLast4: externalNumberB.slice(-4),
      status: ProviderPhoneNumberStatus.VERIFIED,
      capabilities: ["sms", "mms"],
      isDefault: true,
      verifiedAt: checkedAt,
      lastCheckedAt: checkedAt
    }
  });
  return {
    orgAId: orgA.id,
    orgBId: orgB.id,
    accountAId: accountA.id,
    accountBId: accountB.id,
    accountAHash,
    accountBHash,
    secretAId: secretA.id,
    serviceAId: serviceA.id,
    serviceBId: serviceB.id,
    phoneAId: phoneA.id,
    phoneBId: phoneB.id,
    phoneAHash,
    phoneBHash
  };
}

function hmac(label: string): string {
  return `pvlookup_v1_${createHash("sha256")
    .update(`${suffix}:${provider}:${label}`, "utf8")
    .digest("base64url")}`;
}

function fingerprint(label: string): string {
  return `pvfp_${createHash("sha256")
    .update(`${suffix}:${provider}:${label}`, "utf8")
    .digest("base64url")
    .slice(0, 22)}`;
}

function numericTail(label: string): string {
  const numeric = BigInt(`0x${createHash("sha256").update(`${suffix}:${label}`).digest("hex").slice(0, 12)}`);
  return (numeric % 10_000_000n).toString().padStart(7, "0");
}

function requireFixture(value: Fixture | undefined): Fixture {
  if (!value) throw new Error("Provider ownership fixture was not initialized.");
  return value;
}

function requireClient(value: PrismaClient | undefined): PrismaClient {
  if (!value) throw new Error("Provider ownership runtime client was not initialized.");
  return value;
}

function runtimeDatabaseUrl(): string {
  const source = process.env.DATABASE_URL;
  if (!source) throw new Error("DATABASE_URL is required for provider ownership tests.");
  const url = new URL(source);
  url.username = loginRole;
  url.password = loginPassword;
  url.searchParams.set("connection_limit", "1");
  return url.toString();
}
