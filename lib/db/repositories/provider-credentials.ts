import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { ProviderSettingsUpdateInput } from "@/lib/validation/provider";
import type { ReadinessAuditInput } from "@/lib/db/repositories/readiness-audit";

export function redactValue(value: string, visible = 4) {
  const trimmed = value.trim();
  const suffix = trimmed.slice(-visible);
  return suffix ? `redacted_${suffix}` : "redacted";
}

export function fingerprintSecret(value: string) {
  return createHash("sha256").update(value.trim()).digest("hex");
}

export async function getProviderCredential(orgId: string, provider: string) {
  return prisma.providerCredential.findUnique({
    where: {
      orgId_provider: {
        orgId,
        provider
      }
    }
  });
}

export async function upsertProviderCredentialMetadata(
  orgId: string,
  input: ProviderSettingsUpdateInput,
  audit?: Pick<ReadinessAuditInput, "actorUserId">
) {
  return prisma.$transaction(async (tx) => {
    const credential = await tx.providerCredential.upsert({
      where: {
        orgId_provider: {
          orgId,
          provider: input.provider
        }
      },
      update: {
        accountSidRedacted: redactValue(input.twilio.accountSid),
        accountSidLast4: input.twilio.accountSid.slice(-4),
        authTokenFingerprint: fingerprintSecret(input.twilio.authToken),
        authTokenConfigured: true,
        fromNumberRedacted: redactValue(input.twilio.fromNumber),
        fromNumberLast4: input.twilio.fromNumber.slice(-4),
        source: "local_metadata"
      },
      create: {
        orgId,
        provider: input.provider,
        accountSidRedacted: redactValue(input.twilio.accountSid),
        accountSidLast4: input.twilio.accountSid.slice(-4),
        authTokenFingerprint: fingerprintSecret(input.twilio.authToken),
        authTokenConfigured: true,
        fromNumberRedacted: redactValue(input.twilio.fromNumber),
        fromNumberLast4: input.twilio.fromNumber.slice(-4),
        source: "local_metadata"
      }
    });

    await tx.liveReadinessAuditEvent.create({
      data: {
        orgId,
        actorUserId: audit?.actorUserId,
        action: "PROVIDER_CREDENTIAL_METADATA_UPSERTED",
        subjectType: "ProviderCredential",
        subjectId: credential.id,
        metadata: {
          provider: credential.provider,
          accountSidConfigured: Boolean(credential.accountSidRedacted),
          authTokenConfigured: credential.authTokenConfigured,
          fromNumberConfigured: Boolean(credential.fromNumberRedacted),
          source: credential.source
        }
      }
    });

    return credential;
  });
}
