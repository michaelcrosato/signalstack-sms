import { ConsentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { evaluateSegmentContacts, type SegmentFilter } from "@/lib/db/repositories/segments";
import { withOptionalTenantRls } from "@/lib/db/rls";
import { z } from "zod";

const segmentFilterSchema = z.object({
  tagNames: z.array(z.string()).optional(),
  consentStatuses: z.array(z.nativeEnum(ConsentStatus)).optional(),
  minLeadScore: z.number().optional(),
  maxLeadScore: z.number().optional(),
});

export async function GET(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
  const { searchParams } = new URL(request.url);

  let filter: SegmentFilter = {};

  const filterJson = searchParams.get("filter");
  if (filterJson) {
    try {
      const parsed = JSON.parse(filterJson);
      const validationResult = segmentFilterSchema.safeParse(parsed);
      if (!validationResult.success) {
        return NextResponse.json({ error: "Invalid filter schema.", details: validationResult.error.format() }, { status: 400 });
      }
      filter = validationResult.data;
    } catch {
      return NextResponse.json({ error: "Invalid JSON in filter parameter." }, { status: 400 });
    }
  } else {
    const tagNames = searchParams.get("tagNames")?.split(",").map((t) => t.trim()).filter(Boolean);
    const consentStatuses = searchParams.get("consentStatuses")?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const minLeadScore = searchParams.get("minLeadScore");
    const maxLeadScore = searchParams.get("maxLeadScore");

    if (tagNames && tagNames.length > 0) filter.tagNames = tagNames;
    if (consentStatuses && consentStatuses.length > 0) filter.consentStatuses = consentStatuses as ConsentStatus[];
    if (minLeadScore) filter.minLeadScore = parseInt(minLeadScore, 10);
    if (maxLeadScore) filter.maxLeadScore = parseInt(maxLeadScore, 10);
  }

  const contacts = await withOptionalTenantRls(currentOrg.orgId, async (tx) => {
    return evaluateSegmentContacts(currentOrg.orgId, filter, tx);
  });

  return NextResponse.json({ contacts });
}
