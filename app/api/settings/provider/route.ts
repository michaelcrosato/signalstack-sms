import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getOrCreateComplianceProfile } from "@/lib/db/repositories/compliance";
import { getProviderSettings } from "@/lib/messaging/provider/settings";

export async function GET() {
  const currentOrg = await getOrCreateCurrentOrg();
  const complianceProfile = await getOrCreateComplianceProfile(currentOrg.orgId);

  return NextResponse.json({
    providerSettings: getProviderSettings({
      demoMode: currentOrg.demoMode,
      liveMessagingEnabled: process.env.LIVE_MESSAGING_ENABLED === "true",
      messagingProvider: process.env.MESSAGING_PROVIDER ?? "dummy",
      complianceProfile,
      env: process.env
    })
  });
}
