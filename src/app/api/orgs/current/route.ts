import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getOrganizationSummary } from "@/lib/db/repositories/orgs";

export async function GET() {
  const currentOrg = await getOrCreateCurrentOrg();
  const org = await getOrganizationSummary(currentOrg.orgId);

  if (!org) {
    return NextResponse.json({ error: "Current organization not found." }, { status: 404 });
  }

  return NextResponse.json({
    currentUser: {
      id: currentOrg.userId,
      email: currentOrg.email,
      role: currentOrg.role
    },
    organization: org
  });
}

