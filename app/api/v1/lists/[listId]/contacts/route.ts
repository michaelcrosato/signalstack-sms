import { createHash } from "node:crypto";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import { createPublicApiErrorResponse, createPublicApiSuccessResponse } from "@/lib/public-api/envelope";
import { publicContactSelect, serializePublicContact } from "@/lib/public-api/resource-dtos";
import {
  publicApiErrorSnapshot,
  publicApiSuccessSnapshot,
  runPublicApiIdempotentMutation,
  toPublicApiJson
} from "@/lib/public-api/resource-mutations";
import {
  createPublicApiPage,
  parsePublicApiCollectionQuery,
  publicApiCursorWhere
} from "@/lib/public-api/resource-pagination";
import {
  authorizePublicApiRequest,
  publicApiErrorResponse,
  readPublicApiJson
} from "@/lib/public-api/request";
import {
  publicApiResourceIdSchema,
  publicListMembershipCreateSchema
} from "@/lib/validation/public-api-resources";

import { createPublicApiMethodNotAllowedHandler } from "@/lib/public-api/method-not-allowed";

export const dynamic = "force-dynamic";

const methodNotAllowed = createPublicApiMethodNotAllowedHandler(["GET", "POST"]);
export {
  methodNotAllowed as PUT,
  methodNotAllowed as PATCH,
  methodNotAllowed as DELETE,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS
};

type RouteContext = Readonly<{ params: Promise<{ listId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["lists:read", "contacts:read"]);
  if (!authorization.ok) return authorization.response;

  try {
    const listId = publicApiResourceIdSchema.parse((await context.params).listId);
    const binding = {
      orgId: authorization.principal.orgId,
      resource: audienceCursorResource("list", listId)
    };
    const query = parsePublicApiCollectionQuery(request, binding);
    const result = await withTenantTransaction(
      { orgId: authorization.principal.orgId },
      async (tx) => {
        const list = await tx.contactList.findFirst({
          where: { orgId: authorization.principal.orgId, id: listId },
          select: { id: true }
        });
        if (!list) return null;

        const rows = await tx.contact.findMany({
          where: {
            orgId: authorization.principal.orgId,
            listLinks: {
              some: { orgId: authorization.principal.orgId, listId }
            },
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

export async function POST(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["lists:write"]);
  if (!authorization.ok) return authorization.response;

  try {
    const listId = publicApiResourceIdSchema.parse((await context.params).listId);
    const requestBody = await readPublicApiJson(request);
    const input = publicListMembershipCreateSchema.parse(requestBody);
    return await runPublicApiIdempotentMutation(
      request,
      authorization,
      `/api/v1/lists/${listId}/contacts`,
      requestBody,
      async (tx) => {
        const list = await tx.contactList.findFirst({
          where: { orgId: authorization.principal.orgId, id: listId },
          select: { id: true }
        });
        const contacts = await tx.contact.findMany({
          where: {
            orgId: authorization.principal.orgId,
            id: { in: input.contactIds }
          },
          select: { id: true }
        });
        if (!list || contacts.length !== input.contactIds.length) {
          return publicApiErrorSnapshot("NOT_FOUND", authorization.requestId, 404);
        }

        const inserted = await tx.contactListMember.createMany({
          data: input.contactIds.map((contactId) => ({
            orgId: authorization.principal.orgId,
            listId,
            contactId
          })),
          skipDuplicates: true
        });
        return publicApiSuccessSnapshot(
          toPublicApiJson({
            membership: {
              listId,
              contactIds: input.contactIds,
              addedCount: inserted.count
            }
          }),
          authorization.requestId
        );
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, {
      requestId: authorization.requestId,
      headers: authorization.responseHeaders
    });
  }
}

function audienceCursorResource(kind: "list", id: string): string {
  const digest = createHash("sha256").update(id, "utf8").digest("hex").slice(0, 46);
  return `${kind}-contacts-${digest}`;
}
