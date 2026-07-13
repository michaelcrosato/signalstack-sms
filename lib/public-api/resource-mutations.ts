import type { Prisma } from "@prisma/client";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import {
  createPublicApiErrorEnvelope,
  createPublicApiSuccessEnvelope
} from "@/lib/public-api/envelope";
import {
  canonicalizePublicApiJson,
  executeIdempotentMutation,
  type IdempotentMutationResponse
} from "@/lib/public-api/idempotency";
import { PUBLIC_API_REQUEST_ID_HEADER } from "@/lib/public-api/request-id";
import { PublicApiRequestError, type AuthorizedPublicApiRequest } from "@/lib/public-api/request";
import type { PublicApiErrorCode } from "@/lib/public-api/errors";

export type PublicApiMutationSnapshot = IdempotentMutationResponse;

export function toPublicApiJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(canonicalizePublicApiJson(value)) as Prisma.InputJsonValue;
}

export async function assertPublicApiRequestHasNoBody(request: Request): Promise<void> {
  const body = request.body;
  if (body === null) return;

  const reader = body.getReader();
  while (true) {
    const next = await reader.read();
    if (next.done) return;
    if (next.value.byteLength > 0) {
      await reader.cancel().catch(() => undefined);
      throw new PublicApiRequestError("INVALID_REQUEST", "This request must not include a body.");
    }
  }
}

export function publicApiSuccessSnapshot(
  data: Prisma.InputJsonValue,
  requestId: string,
  status = 200,
  headers?: Readonly<Record<string, string>>
): PublicApiMutationSnapshot {
  return {
    status,
    body: createPublicApiSuccessEnvelope(data, requestId) as unknown as Prisma.InputJsonValue,
    headers
  };
}

export function publicApiErrorSnapshot(
  code: PublicApiErrorCode,
  requestId: string,
  status: number,
  message?: string
): PublicApiMutationSnapshot {
  return {
    status,
    body: createPublicApiErrorEnvelope(code, requestId, { message }) as unknown as Prisma.InputJsonValue
  };
}

export async function runPublicApiIdempotentMutation(
  request: Request,
  authorization: AuthorizedPublicApiRequest,
  canonicalRoute: string,
  requestBody: unknown,
  mutation: (tx: Prisma.TransactionClient) => Promise<PublicApiMutationSnapshot>
): Promise<Response> {
  const result = await withTenantTransaction({ orgId: authorization.principal.orgId }, (tx) =>
    executeIdempotentMutation(
      tx,
      {
        orgId: authorization.principal.orgId,
        credentialId: authorization.principal.credentialId,
        idempotencyKey: request.headers.get("idempotency-key"),
        method: request.method,
        canonicalRoute,
        requestBody
      },
      () => mutation(tx)
    )
  );

  const headers = new Headers(authorization.responseHeaders);
  for (const [name, value] of Object.entries(result.headers)) {
    headers.set(name, value);
  }
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set(PUBLIC_API_REQUEST_ID_HEADER, responseRequestId(result.body, authorization.requestId));
  headers.set("Idempotency-Replayed", result.replayed ? "true" : "false");
  return new Response(JSON.stringify(result.body), { status: result.status, headers });
}

function responseRequestId(body: Prisma.JsonValue | Prisma.InputJsonValue, fallback: string): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fallback;
  }
  const meta = (body as Record<string, unknown>).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return fallback;
  }
  const requestId = (meta as Record<string, unknown>).requestId;
  return typeof requestId === "string" ? requestId : fallback;
}
