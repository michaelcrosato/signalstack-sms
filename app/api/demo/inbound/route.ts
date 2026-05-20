import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { createDemoInboundMessage } from "@/lib/db/repositories/inbox";
import { inboundMessageSchema } from "@/lib/validation/inbox";

export async function POST(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
  const payload = inboundMessageSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid demo inbound payload.", issues: payload.error.issues }, { status: 400 });
  }

  const result = await createDemoInboundMessage(currentOrg.orgId, payload.data);
  return NextResponse.json(result, { status: 201 });
}
