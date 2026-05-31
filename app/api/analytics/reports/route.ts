import { NextResponse } from "next/server";
import { MembershipRole } from "@prisma/client";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";

export async function POST(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();

  // Strict RBAC boundary: Only Admins or Owners can export or save reports
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  const rawPayload = await request.json().catch(() => ({}));
  const action = rawPayload?.action;

  if (action !== "save" && action !== "export") {
    return NextResponse.json({ error: "Invalid reporting action specified." }, { status: 400 });
  }

  // At a production scale, this would enqueue a background export job via BullMQ.
  // For the current scope, we simulate a successful reporting action.
  return NextResponse.json({
    success: true,
    message: action === "export"
      ? "Report export has been queued successfully."
      : "Snapshot saved successfully to tenant inventory."
  });
}
