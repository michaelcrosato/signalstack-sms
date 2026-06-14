import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { complianceProfileIsComplete, evaluateMessagingHardGate } from "@/lib/compliance/gates";
import { getOrCreateComplianceProfile, updateComplianceProfile } from "@/lib/db/repositories/compliance";
import { recordLiveReadinessAuditEvent } from "@/lib/db/repositories/readiness-audit";
import { complianceProfileUpdateSchema } from "@/lib/validation/compliance";

export async function GET() {
  const currentOrg = await getOrCreateCurrentOrg();
  const profile = await getOrCreateComplianceProfile(currentOrg.orgId);
  const gate = evaluateMessagingHardGate({
    demoMode: currentOrg.demoMode,
    liveMessagingEnabled: process.env.LIVE_MESSAGING_ENABLED === "true",
    messagingProvider: process.env.MESSAGING_PROVIDER ?? "dummy",
    complianceProfile: profile
  });

  return NextResponse.json({
    profile,
    checklist: {
      complete: complianceProfileIsComplete(profile),
      liveMessagingAllowed: gate.allowed,
      blockers: gate.reasons
    }
  });
}

export async function PATCH(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  const rawPayload = await request.json().catch(() => undefined);
  const payload = complianceProfileUpdateSchema.safeParse(rawPayload);

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid compliance profile payload.", issues: payload.error.issues }, { status: 400 });
  }

  const profile = await updateComplianceProfile(currentOrg.orgId, payload.data);
  await recordLiveReadinessAuditEvent(currentOrg.orgId, {
    actorUserId: currentOrg.userId,
    action: "COMPLIANCE_PROFILE_UPDATED",
    subjectType: "ComplianceProfile",
    subjectId: profile.id,
    metadata: {
      a2pRegistrationStatus: profile.a2pRegistrationStatus,
      complete: complianceProfileIsComplete(profile)
    }
  });
  const gate = evaluateMessagingHardGate({
    demoMode: currentOrg.demoMode,
    liveMessagingEnabled: process.env.LIVE_MESSAGING_ENABLED === "true",
    messagingProvider: process.env.MESSAGING_PROVIDER ?? "dummy",
    complianceProfile: profile
  });

  return NextResponse.json({
    profile,
    checklist: {
      complete: complianceProfileIsComplete(profile),
      liveMessagingAllowed: gate.allowed,
      blockers: gate.reasons
    }
  });
}
