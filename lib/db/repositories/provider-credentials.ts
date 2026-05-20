import { createHash } from "node:crypto";
import type { ProviderCredential } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { ProviderCredentialRotationAction, ProviderSettingsUpdateInput } from "@/lib/validation/provider";
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

export function getCredentialHistoryAction(previous: ProviderCredential | null | undefined, next: ProviderCredential) {
  if (!previous) {
    return "CONFIGURED";
  }

  const changed =
    previous.accountSidLast4 !== next.accountSidLast4 ||
    previous.authTokenFingerprint !== next.authTokenFingerprint ||
    previous.authTokenConfigured !== next.authTokenConfigured ||
    previous.fromNumberLast4 !== next.fromNumberLast4;

  return changed ? "ROTATED" : "REFRESHED";
}

export async function listProviderCredentialRotations(
  orgId: string,
  provider: string,
  take = 20,
  action?: ProviderCredentialRotationAction
) {
  const rotations = await prisma.providerCredentialRotation.findMany({
    where: { orgId, provider, ...(action ? { action } : {}) },
    orderBy: { createdAt: "desc" },
    take
  });

  return rotations.map((rotation) => ({
    id: rotation.id,
    provider: rotation.provider,
    action: rotation.action,
    providerCredentialId: rotation.providerCredentialId,
    actorUserId: rotation.actorUserId,
    accountSidRedacted: rotation.accountSidRedacted,
    accountSidLast4: rotation.accountSidLast4,
    fromNumberRedacted: rotation.fromNumberRedacted,
    fromNumberLast4: rotation.fromNumberLast4,
    authTokenConfigured: rotation.authTokenConfigured,
    previousAccountSidLast4: rotation.previousAccountSidLast4,
    previousFromNumberLast4: rotation.previousFromNumberLast4,
    previousAuthTokenConfigured: rotation.previousAuthTokenConfigured,
    source: rotation.source,
    createdAt: rotation.createdAt
  }));
}

export async function upsertProviderCredentialMetadata(
  orgId: string,
  input: ProviderSettingsUpdateInput,
  audit?: Pick<ReadinessAuditInput, "actorUserId">
) {
  return prisma.$transaction(async (tx) => {
    const previousCredential = await tx.providerCredential.findUnique({
      where: {
        orgId_provider: {
          orgId,
          provider: input.provider
        }
      }
    });

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
    const historyAction = getCredentialHistoryAction(previousCredential, credential);

    await tx.providerCredentialRotation.create({
      data: {
        orgId,
        provider: credential.provider,
        providerCredentialId: credential.id,
        action: historyAction,
        actorUserId: audit?.actorUserId,
        accountSidRedacted: credential.accountSidRedacted,
        accountSidLast4: credential.accountSidLast4,
        fromNumberRedacted: credential.fromNumberRedacted,
        fromNumberLast4: credential.fromNumberLast4,
        authTokenConfigured: credential.authTokenConfigured,
        previousAccountSidLast4: previousCredential?.accountSidLast4,
        previousFromNumberLast4: previousCredential?.fromNumberLast4,
        previousAuthTokenConfigured: previousCredential?.authTokenConfigured ?? false,
        source: credential.source
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

export async function deleteProviderCredentialMetadata(
  orgId: string,
  provider: string,
  audit?: Pick<ReadinessAuditInput, "actorUserId">
) {
  return prisma.$transaction(async (tx) => {
    const credential = await tx.providerCredential.findUnique({
      where: {
        orgId_provider: {
          orgId,
          provider
        }
      }
    });

    if (credential) {
      await tx.providerCredentialRotation.create({
        data: {
          orgId,
          provider: credential.provider,
          providerCredentialId: credential.id,
          action: "DELETED",
          actorUserId: audit?.actorUserId,
          accountSidRedacted: null,
          accountSidLast4: null,
          fromNumberRedacted: null,
          fromNumberLast4: null,
          authTokenConfigured: false,
          previousAccountSidLast4: credential.accountSidLast4,
          previousFromNumberLast4: credential.fromNumberLast4,
          previousAuthTokenConfigured: credential.authTokenConfigured,
          source: credential.source
        }
      });

      await tx.providerCredential.delete({
        where: {
          orgId_provider: {
            orgId,
            provider
          }
        }
      });
    }

    await tx.liveReadinessAuditEvent.create({
      data: {
        orgId,
        actorUserId: audit?.actorUserId,
        action: "PROVIDER_CREDENTIAL_METADATA_DELETED",
        subjectType: "ProviderCredential",
        subjectId: credential?.id,
        metadata: {
          provider,
          existed: Boolean(credential)
        }
      }
    });

    return { deleted: Boolean(credential) };
  });
}
