import { randomUUID } from "node:crypto";
import {
  archiveContact,
  ContactConsentEvidenceError,
  getContact,
  updateContact
} from "@/lib/db/repositories/contacts";
import { enqueueCustomerWebhookEvent } from "@/lib/integrations/customer-webhooks/outbox";
import { createPublicApiErrorResponse, createPublicApiSuccessResponse } from "@/lib/public-api/envelope";
import {
  serializePublicContact,
  serializePublicContactWebhookData
} from "@/lib/public-api/resource-dtos";
import {
  assertPublicApiRequestHasNoBody,
  publicApiErrorSnapshot,
  publicApiSuccessSnapshot,
  runPublicApiIdempotentMutation,
  toPublicApiJson
} from "@/lib/public-api/resource-mutations";
import {
  authorizePublicApiRequest,
  publicApiErrorResponse,
  readPublicApiJson
} from "@/lib/public-api/request";
import {
  publicApiResourceIdSchema,
  publicContactUpdateSchema
} from "@/lib/validation/public-api-resources";

import { createPublicApiMethodNotAllowedHandler } from "@/lib/public-api/method-not-allowed";

export const dynamic = "force-dynamic";

const methodNotAllowed = createPublicApiMethodNotAllowedHandler(["GET", "PATCH", "DELETE"]);
export {
  methodNotAllowed as POST,
  methodNotAllowed as PUT,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS
};

type RouteContext = Readonly<{ params: Promise<{ contactId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["contacts:read"]);
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const contactId = publicApiResourceIdSchema.parse((await context.params).contactId);
    const contact = await getContact(authorization.principal.orgId, contactId);
    if (!contact) {
      return createPublicApiErrorResponse({
        requestId: authorization.requestId,
        code: "NOT_FOUND",
        headers: authorization.responseHeaders
      });
    }
    return createPublicApiSuccessResponse(serializePublicContact(contact), {
      requestId: authorization.requestId,
      headers: authorization.responseHeaders
    });
  } catch (error) {
    return publicApiErrorResponse(error, {
      requestId: authorization.requestId,
      headers: authorization.responseHeaders
    });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["contacts:write"]);
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const contactId = publicApiResourceIdSchema.parse((await context.params).contactId);
    const requestBody = await readPublicApiJson(request);
    const input = publicContactUpdateSchema.parse(requestBody);
    return await runPublicApiIdempotentMutation(
      request,
      authorization,
      `/api/v1/contacts/${contactId}`,
      requestBody,
      async (tx) => {
        const existing = await getContact(authorization.principal.orgId, contactId, tx);
        if (!existing) {
          return publicApiErrorSnapshot("NOT_FOUND", authorization.requestId, 404);
        }
        let contact: Awaited<ReturnType<typeof updateContact>>;
        try {
          contact = await updateContact(authorization.principal.orgId, contactId, input, tx);
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
        if (!contact) {
          return publicApiErrorSnapshot("NOT_FOUND", authorization.requestId, 404);
        }
        const data = serializePublicContact(contact);
        const eventType = input.archived === true ? "contact.archived" : "contact.updated";
        await enqueueCustomerWebhookEvent(tx, {
          orgId: authorization.principal.orgId,
          deduplicationKey: eventDeduplicationKey(eventType),
          type: eventType,
          aggregateType: "contact",
          aggregateId: contact.id,
          data: toPublicApiJson(serializePublicContactWebhookData(contact))
        });
        return publicApiSuccessSnapshot(toPublicApiJson(data), authorization.requestId);
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, {
      requestId: authorization.requestId,
      headers: authorization.responseHeaders
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const authorization = await authorizePublicApiRequest(request, ["contacts:write"]);
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    await assertPublicApiRequestHasNoBody(request);
    const contactId = publicApiResourceIdSchema.parse((await context.params).contactId);
    return await runPublicApiIdempotentMutation(
      request,
      authorization,
      `/api/v1/contacts/${contactId}`,
      {},
      async (tx) => {
        const existing = await getContact(authorization.principal.orgId, contactId, tx);
        if (!existing) {
          return publicApiErrorSnapshot("NOT_FOUND", authorization.requestId, 404);
        }
        const contact = existing.archivedAt
          ? existing
          : await archiveContact(authorization.principal.orgId, contactId, tx);
        if (!contact) {
          return publicApiErrorSnapshot("NOT_FOUND", authorization.requestId, 404);
        }
        const data = serializePublicContact(contact);
        if (!existing.archivedAt) {
          await enqueueCustomerWebhookEvent(tx, {
            orgId: authorization.principal.orgId,
            deduplicationKey: eventDeduplicationKey("contact.archived"),
            type: "contact.archived",
            aggregateType: "contact",
            aggregateId: contact.id,
            data: toPublicApiJson(serializePublicContactWebhookData(contact))
          });
        }
        return publicApiSuccessSnapshot(toPublicApiJson(data), authorization.requestId);
      }
    );
  } catch (error) {
    return publicApiErrorResponse(error, {
      requestId: authorization.requestId,
      headers: authorization.responseHeaders
    });
  }
}

function eventDeduplicationKey(type: string): string {
  return `api:${type}:${randomUUID()}`;
}
