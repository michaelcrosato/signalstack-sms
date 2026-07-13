import { ZodError } from "zod";
import { logger } from "@/lib/observability/logger";
import { CustomerWebhookEndpointSecurityError } from "@/lib/integrations/customer-webhooks/endpoint-security";
import { CustomerWebhookServiceError } from "@/lib/integrations/customer-webhooks/service";
import { ApiCredentialServiceError } from "@/lib/public-api/api-credential-service";
import {
  authenticatePublicApiKey,
  type PublicApiPrincipal
} from "@/lib/public-api/api-key-authentication";
import { PublicApiCursorError } from "@/lib/public-api/cursor";
import {
  createPublicApiErrorResponse,
  type PublicApiErrorResponseOptions
} from "@/lib/public-api/envelope";
import { PublicApiIdempotencyError } from "@/lib/public-api/idempotency";
import { resolvePublicApiRequestId } from "@/lib/public-api/request-id";
import type { ApiScope } from "@/lib/public-api/scopes";

const DEFAULT_MAX_JSON_BYTES = 1_048_576;

export type AuthorizedPublicApiRequest = Readonly<{
  ok: true;
  requestId: string;
  principal: PublicApiPrincipal;
  responseHeaders: Readonly<Record<string, string>>;
}>;

export type DeniedPublicApiRequest = Readonly<{
  ok: false;
  requestId: string;
  response: Response;
}>;

export type PublicApiRequestAuthorization = AuthorizedPublicApiRequest | DeniedPublicApiRequest;

export class PublicApiRequestError extends Error {
  readonly code:
    | "INVALID_JSON"
    | "PAYLOAD_TOO_LARGE"
    | "UNSUPPORTED_MEDIA_TYPE"
    | "INVALID_REQUEST";

  constructor(code: PublicApiRequestError["code"], message: string) {
    super(message);
    this.name = "PublicApiRequestError";
    this.code = code;
  }
}

export async function authorizePublicApiRequest(
  request: Request,
  requiredScopes: readonly ApiScope[]
): Promise<PublicApiRequestAuthorization> {
  const requestId = resolvePublicApiRequestId(request.headers);
  const authentication = await authenticatePublicApiKey(request, requiredScopes);
  if (!authentication.ok) {
    return Object.freeze({
      ok: false,
      requestId,
      response: createPublicApiErrorResponse({
        requestId,
        code: authentication.code,
        message: authentication.message,
        status: authentication.status,
        headers: authentication.headers
      })
    });
  }
  return Object.freeze({
    ok: true,
    requestId,
    principal: authentication.principal,
    responseHeaders: authentication.headers
  });
}

/** Read bounded UTF-8 JSON after authentication and scope authorization have succeeded. */
export async function readPublicApiJson(
  request: Request,
  maximumBytes = DEFAULT_MAX_JSON_BYTES
): Promise<unknown> {
  if (!Number.isInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > DEFAULT_MAX_JSON_BYTES) {
    throw new Error("Public API JSON limit is invalid.");
  }
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new PublicApiRequestError(
      "UNSUPPORTED_MEDIA_TYPE",
      "The request Content-Type must be application/json."
    );
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maximumBytes) {
    throw new PublicApiRequestError("PAYLOAD_TOO_LARGE", "The request payload is too large.");
  }

  const body = request.body;
  if (!body) {
    throw new PublicApiRequestError("INVALID_JSON", "The request body is not valid JSON.");
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) {
      break;
    }
    length += next.value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      throw new PublicApiRequestError("PAYLOAD_TOO_LARGE", "The request payload is too large.");
    }
    chunks.push(next.value);
  }

  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), length);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new PublicApiRequestError("INVALID_JSON", "The request body is not valid UTF-8 JSON.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new PublicApiRequestError("INVALID_JSON", "The request body is not valid JSON.");
  }
}

export function publicApiErrorResponse(
  error: unknown,
  input: Readonly<{
    requestId: string;
    headers?: HeadersInit;
    responseHeaders?: HeadersInit;
  }>
): Response {
  const mapped = mapPublicApiError(error);
  if (mapped) {
    return createPublicApiErrorResponse({
      requestId: input.requestId,
      ...mapped,
      headers: input.headers ?? input.responseHeaders
    });
  }

  logger.error("public_api_request_failed", {
    requestId: input.requestId,
    errorType: error instanceof Error ? error.name : "UnknownError"
  });
  return createPublicApiErrorResponse({
    requestId: input.requestId,
    code: "INTERNAL_ERROR",
    headers: input.headers ?? input.responseHeaders
  });
}

function mapPublicApiError(
  error: unknown
): Pick<PublicApiErrorResponseOptions, "code" | "message" | "details" | "status"> | null {
  if (error instanceof PublicApiRequestError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof PublicApiIdempotencyError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof PublicApiCursorError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof ZodError) {
    return {
      code: "VALIDATION_ERROR",
      message: "The request failed validation.",
      details: {
        issues: error.issues.slice(0, 50).map((issue) => ({
          code: issue.code,
          path: issue.path.map(String).join("."),
          message: issue.message
        }))
      }
    };
  }
  if (error instanceof ApiCredentialServiceError) {
    if (error.code === "API_CREDENTIAL_NOT_FOUND") {
      return { code: "NOT_FOUND", message: "The requested resource was not found." };
    }
    if (error.code === "API_CREDENTIAL_REVOKED") {
      return { code: "OPERATION_NOT_ALLOWED", message: error.message };
    }
    if (error.code === "API_CREDENTIAL_ROTATION_CONFLICT") {
      return { code: "CONFLICT", message: error.message };
    }
    return { code: "VALIDATION_ERROR", message: error.message };
  }
  if (error instanceof CustomerWebhookEndpointSecurityError) {
    return { code: "VALIDATION_ERROR", message: "The webhook endpoint URL is invalid or unsafe." };
  }
  if (error instanceof CustomerWebhookServiceError) {
    if (
      error.code === "WEBHOOK_ENDPOINT_NOT_FOUND" ||
      error.code === "WEBHOOK_DELIVERY_NOT_FOUND"
    ) {
      return { code: "NOT_FOUND", message: "The requested resource was not found." };
    }
    if (error.code === "WEBHOOK_REPLAY_NOT_ALLOWED") {
      return { code: "OPERATION_NOT_ALLOWED", message: error.message };
    }
    if (error.code === "WEBHOOK_SECRET_UNAVAILABLE") {
      return { code: "SERVICE_UNAVAILABLE", message: "The webhook secret service is unavailable." };
    }
    return { code: "VALIDATION_ERROR", message: error.message };
  }
  if (isPrismaError(error, "P2002")) {
    return { code: "CONFLICT", message: "The resource conflicts with an existing record." };
  }
  if (isPrismaError(error, "P2025")) {
    return { code: "NOT_FOUND", message: "The requested resource was not found." };
  }
  return null;
}

function isPrismaError(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
