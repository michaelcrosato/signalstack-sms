import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { createDemoInboundMessage, listConversations } from "@/lib/db/repositories/inbox";
import { inboundMessageSchema } from "@/lib/validation/inbox";

export async function GET() {
  const currentOrg = await getOrCreateCurrentOrg();
  const conversations = await listConversations(currentOrg.orgId);

  return NextResponse.json({ conversations });
}

export async function POST(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
  const payload = inboundMessageSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid inbound message payload.", issues: payload.error.issues }, { status: 400 });
  }

  const result = await createDemoInboundMessage(currentOrg.orgId, payload.data);
  return NextResponse.json(result, { status: 201 });
}
