import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import { createPublicApiErrorResponse, createPublicApiSuccessResponse } from "@/lib/public-api/envelope";
import { publicContactSelect, serializePublicContact } from "@/lib/public-api/resource-dtos";
import {
  createPublicApiPage,
  parsePublicApiCollectionQuery,
  publicApiCursorWhere
} from "@/lib/public-api/resource-pagination";
import { authorizePublicApiRequest, publicApiErrorResponse } from "@/lib/public-api/request";
import {
  publicApiResourceIdSchema,
  publicSegmentDefinitionSchema
} from "@/lib/validation/public-api-resources";
import { createPublicApiMethodNotAllowedHandler } from "@/lib/public-api/method-not-allowed";

export const dynamic = "force-dynamic";

const methodNotAllowed = createPublicApiMethodNotAllowedHandler(["GET"]);
export {
  methodNotAllowed as POST,
  methodNotAllowed as PUT,
  methodNotAllowed as PATCH,
  methodNotAllowed as DELETE,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS
};

type RouteContext = Readonly<{ params: Promise<{ segmentId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["segments:read", "contacts:read"]);
  if (!authorization.ok) return authorization.response;

  try {
    const segmentId = publicApiResourceIdSchema.parse((await context.params).segmentId);
    const binding = {
      orgId: authorization.principal.orgId,
      resource: audienceCursorResource("segment", segmentId)
    };
    const query = parsePublicApiCollectionQuery(request, binding);
    const result = await withTenantTransaction(
      { orgId: authorization.principal.orgId },
      async (tx) => {
        const segment = await tx.segment.findFirst({
          where: { orgId: authorization.principal.orgId, id: segmentId },
          select: { id: true, definition: true }
        });
        if (!segment) return null;

        const parsedDefinition = publicSegmentDefinitionSchema.safeParse(segment.definition);
        if (!parsedDefinition.success) {
          throw new TypeError("The stored segment definition is invalid.");
        }
        const rows = await tx.contact.findMany({
          where: {
            ...segmentContactWhere(authorization.principal.orgId, parsedDefinition.data),
            ...(publicApiCursorWhere(query.cursor) ?? {})
          },
          select: publicContactSelect,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: query.limit + 1
        });
        return createPublicApiPage(rows, query, binding);
      }
    );
    if (!result) {
      return createPublicApiErrorResponse({
        requestId: authorization.requestId,
        code: "NOT_FOUND",
        headers: authorization.responseHeaders
      });
    }
    return createPublicApiSuccessResponse(
      { contacts: result.rows.map(serializePublicContact) },
      {
        requestId: authorization.requestId,
        headers: authorization.responseHeaders,
        meta: result.pagination
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, {
      requestId: authorization.requestId,
      headers: authorization.responseHeaders
    });
  }
}

function segmentContactWhere(
  orgId: string,
  definition: ReturnType<typeof publicSegmentDefinitionSchema.parse>
): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = { orgId, archivedAt: null };
  if (definition.consentStatuses.length > 0) {
    where.consentStatus = { in: definition.consentStatuses };
  }
  if (definition.minLeadScore !== undefined || definition.maxLeadScore !== undefined) {
    where.leadScore = {
      ...(definition.minLeadScore !== undefined ? { gte: definition.minLeadScore } : {}),
      ...(definition.maxLeadScore !== undefined ? { lte: definition.maxLeadScore } : {})
    };
  }
  if (definition.tagNames.length > 0) {
    where.tagLinks = {
      some: {
        orgId,
        tag: { name: { in: definition.tagNames } }
      }
    };
  }
  return where;
}

function audienceCursorResource(kind: "segment", id: string): string {
  const digest = createHash("sha256").update(id, "utf8").digest("hex").slice(0, 46);
  return `${kind}-contacts-${digest}`;
}
