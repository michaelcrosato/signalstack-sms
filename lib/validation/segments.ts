import { z } from "zod";
import { ConsentStatus } from "@prisma/client";

// Shared segment-filter contract used by both the evaluate (`/segments`) and export
// (`/segments/export`) routes so the two siblings validate identical input and cannot drift.
export const segmentFilterSchema = z.object({
  tagNames: z.array(z.string()).optional(),
  consentStatuses: z.array(z.nativeEnum(ConsentStatus)).optional(),
  minLeadScore: z.number().int().optional(),
  maxLeadScore: z.number().int().optional()
});

export type SegmentFilterInput = z.infer<typeof segmentFilterSchema>;

/**
 * Parse a segment filter from request query params. Supports either a JSON `filter` object or the
 * discrete `tagNames`/`consentStatuses`/`minLeadScore`/`maxLeadScore` params. Both paths are validated
 * through `segmentFilterSchema`, so unknown consent statuses or non-numeric scores return a typed error
 * instead of reaching Prisma as an invalid enum/NaN (a 500).
 */
export function parseSegmentFilterParams(
  searchParams: URLSearchParams
): { ok: true; filter: SegmentFilterInput } | { ok: false; error: string } {
  const filterJson = searchParams.get("filter");
  if (filterJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(filterJson);
    } catch {
      return { ok: false, error: "Invalid JSON in filter parameter." };
    }
    const result = segmentFilterSchema.safeParse(parsed);
    if (!result.success) {
      return { ok: false, error: "Invalid filter format." };
    }
    return { ok: true, filter: result.data };
  }

  const tagNames = searchParams.get("tagNames")?.split(",").map((value) => value.trim()).filter(Boolean);
  const consentStatuses = searchParams
    .get("consentStatuses")
    ?.split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  const minLeadScore = searchParams.get("minLeadScore");
  const maxLeadScore = searchParams.get("maxLeadScore");

  const candidate: Record<string, unknown> = {};
  if (tagNames && tagNames.length > 0) candidate.tagNames = tagNames;
  if (consentStatuses && consentStatuses.length > 0) candidate.consentStatuses = consentStatuses;
  if (minLeadScore !== null) candidate.minLeadScore = Number(minLeadScore);
  if (maxLeadScore !== null) candidate.maxLeadScore = Number(maxLeadScore);

  const result = segmentFilterSchema.safeParse(candidate);
  if (!result.success) {
    return { ok: false, error: "Invalid filter parameters." };
  }
  return { ok: true, filter: result.data };
}
