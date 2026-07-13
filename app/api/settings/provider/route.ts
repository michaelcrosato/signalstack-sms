import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { getComplianceProfile } from "@/lib/db/repositories/compliance";
import {
  getProviderCredential
} from "@/lib/db/repositories/provider-credentials";
import {
  listOwnedProviderPhoneNumbers,
  listProviderAccounts,
  revokeProviderAccount
} from "@/lib/integrations/provider-accounts/service";
import { getProviderSettings } from "@/lib/messaging/provider/settings";

const noStoreHeaders = Object.freeze({ "Cache-Control": "no-store, max-age=0" });

export async function GET() {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const [complianceProfile, providerCredential, providerAccounts, providerPhoneNumbers] = await Promise.all([
    getComplianceProfile(currentOrg.orgId),
    getProviderCredential(currentOrg.orgId, "twilio"),
    listProviderAccounts(currentOrg.orgId),
    listOwnedProviderPhoneNumbers(currentOrg.orgId)
  ]);

  return NextResponse.json({
    providerSettings: getProviderSettings({
      demoMode: currentOrg.demoMode,
      liveMessagingEnabled: process.env.LIVE_MESSAGING_ENABLED === "true",
      messagingProvider: process.env.MESSAGING_PROVIDER ?? "dummy",
      complianceProfile,
      providerAccounts,
      providerPhoneNumbers,
      providerCredential,
      env: process.env
    }),
    accounts: providerAccounts,
    numbers: providerPhoneNumbers
  }, { headers: noStoreHeaders });
}

export async function PATCH(request: Request) {
  const authentication = await authenticateApiRequest(request);
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  return NextResponse.json({
    error: "Use the verified provider accounts endpoint.",
    code: "PROVIDER_METADATA_ENDPOINT_RETIRED"
  }, { status: 410, headers: noStoreHeaders });
}

export async function DELETE(request: Request) {
  const authentication = await authenticateApiRequest(request);
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  const accounts = await listProviderAccounts(currentOrg.orgId);
  const account = accounts.find((candidate) => candidate.isDefault && candidate.revokedAt === null);
  if (!account) {
    return NextResponse.json(
      { error: "Provider account not found.", code: "PROVIDER_ACCOUNT_NOT_FOUND" },
      { status: 404, headers: noStoreHeaders }
    );
  }
  const revoked = await revokeProviderAccount({
    orgId: currentOrg.orgId,
    providerAccountId: account.id,
    actor: { userId: currentOrg.userId }
  });
  return NextResponse.json({ account: revoked }, { headers: noStoreHeaders });
}
