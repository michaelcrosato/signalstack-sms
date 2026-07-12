import { ContactConsentEvidenceError, createContact } from "@/lib/db/repositories/contacts";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import { enqueueCustomerWebhookEvent } from "@/lib/integrations/customer-webhooks/outbox";
import { createPublicApiSuccessResponse } from "@/lib/public-api/envelope";
import {
  publicContactSelect,
  serializePublicContact,
  serializePublicContactWebhookData
} from "@/lib/public-api/resource-dtos";
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
import { publicContactCreateSchema } from "@/lib/validation/public-api-resources";

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

const resource = "contacts";

export async function GET(request: Request) {
  const authorization = await authorizePublicApiRequest(request, ["contacts:read"]);
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const binding = { orgId: authorization.principal.orgId, resource };
    const query = parsePublicApiCollectionQuery(request, binding);
    const cursorWhere = publicApiCursorWhere(query.cursor);
    const rows = await withTenantTransaction({ orgId: authorization.principal.orgId }, (tx) =>
      tx.contact.findMany({
        where: {
          orgId: authorization.principal.orgId,
          archivedAt: null,
          ...(cursorWhere ?? {})
        },
        select: publicContactSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1
      })
    );
    const page = createPublicApiPage(rows, query, binding);
    return createPublicApiSuccessResponse({ contacts: page.rows.map(serializePublicContact) }, {
      requestId: authorization.requestId,
      headers: authorization.responseHeaders,
      meta: page.pagination
    });
  } catch (error) {
    return publicApiErrorResponse(error, {
      requestId: authorization.requestId,
      headers: authorization.responseHeaders
    });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizePublicApiRequest(request, ["contacts:write"]);
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const requestBody = await readPublicApiJson(request);
    const input = publicContactCreateSchema.parse(requestBody);
    return await runPublicApiIdempotentMutation(
      request,
      authorization,
      "/api/v1/contacts",
      requestBody,
      async (tx) => {
        let contact: Awaited<ReturnType<typeof createContact>>;
        try {
          contact = await createContact(authorization.principal.orgId, input, tx);
        } catch (error) {
          if (error instanceof ContactConsentEvidenceError) {
            return publicApiErrorSnapshot(
              "OPERATION_NOT_ALLOWED",
              authorization.requestId,
              422,
              error.message
            );
          }
          throw error;
        }
        const data = serializePublicContact(contact);
        await enqueueCustomerWebhookEvent(tx, {
          orgId: authorization.principal.orgId,
          deduplicationKey: `api:contact.created:${contact.id}`,
          type: "contact.created",
          aggregateType: "contact",
          aggregateId: contact.id,
          data: toPublicApiJson(serializePublicContactWebhookData(contact))
        });
        return publicApiSuccessSnapshot(toPublicApiJson(data), authorization.requestId, 201, {
          location: `/api/v1/contacts/${contact.id}`
        });
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, {
      requestId: authorization.requestId,
      headers: authorization.responseHeaders
    });
  }
}
