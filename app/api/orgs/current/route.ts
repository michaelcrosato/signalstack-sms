import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { getOrganizationSummary } from "@/lib/db/repositories/orgs";

export async function GET() {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
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

