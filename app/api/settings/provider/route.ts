import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getOrCreateComplianceProfile } from "@/lib/db/repositories/compliance";
import {
  deleteProviderCredentialMetadata,
  getProviderCredential,
  upsertProviderCredentialMetadata
} from "@/lib/db/repositories/provider-credentials";
import { getProviderSettings } from "@/lib/messaging/provider/settings";
import { providerSettingsUpdateSchema } from "@/lib/validation/provider";

export async function GET() {
  const currentOrg = await getOrCreateCurrentOrg();
  const [complianceProfile, providerCredential] = await Promise.all([
    getOrCreateComplianceProfile(currentOrg.orgId),
    getProviderCredential(currentOrg.orgId, "twilio")
  ]);

  return NextResponse.json({
    providerSettings: getProviderSettings({
      demoMode: currentOrg.demoMode,
      liveMessagingEnabled: process.env.LIVE_MESSAGING_ENABLED === "true",
      messagingProvider: process.env.MESSAGING_PROVIDER ?? "dummy",
      complianceProfile,
      providerCredential,
      env: process.env
    })
  });
}

export async function PATCH(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  const payload = providerSettingsUpdateSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid provider settings payload.", issues: payload.error.flatten() }, { status: 400 });
  }

  const credential = await upsertProviderCredentialMetadata(currentOrg.orgId, payload.data, {
    actorUserId: currentOrg.userId
  });
  const complianceProfile = await getOrCreateComplianceProfile(currentOrg.orgId);

  return NextResponse.json({
    providerSettings: getProviderSettings({
      demoMode: currentOrg.demoMode,
      liveMessagingEnabled: process.env.LIVE_MESSAGING_ENABLED === "true",
      messagingProvider: process.env.MESSAGING_PROVIDER ?? "dummy",
      complianceProfile,
      providerCredential: credential,
      env: process.env
    })
  });
}

export async function DELETE() {
  const currentOrg = await getOrCreateCurrentOrg();
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  await deleteProviderCredentialMetadata(currentOrg.orgId, "twilio", {
    actorUserId: currentOrg.userId
  });
  const complianceProfile = await getOrCreateComplianceProfile(currentOrg.orgId);

  return NextResponse.json({
    providerSettings: getProviderSettings({
      demoMode: currentOrg.demoMode,
      liveMessagingEnabled: process.env.LIVE_MESSAGING_ENABLED === "true",
      messagingProvider: process.env.MESSAGING_PROVIDER ?? "dummy",
      complianceProfile,
      providerCredential: null,
      env: process.env
    })
  });
}
