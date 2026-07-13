import {
  getPublicApiErrorDefinition,
  type PublicApiErrorCode
} from "@/lib/public-api/errors";
import { PUBLIC_API_REQUEST_ID_HEADER } from "@/lib/public-api/request-id";

export type PublicApiMeta<TMeta extends Record<string, unknown> = Record<never, never>> = Readonly<
  { requestId: string } & TMeta
>;

export type PublicApiSuccessEnvelope<
  TData,
  TMeta extends Record<string, unknown> = Record<never, never>
> = Readonly<{
  ok: true;
  data: TData;
  meta: PublicApiMeta<TMeta>;
}>;

export type PublicApiErrorEnvelope = Readonly<{
  ok: false;
  error: Readonly<{
    code: PublicApiErrorCode;
    message: string;
    details?: unknown;
  }>;
  meta: PublicApiMeta;
}>;

export type PublicApiSuccessResponseOptions<
  TMeta extends Record<string, unknown> = Record<never, never>
> = Readonly<{
  requestId: string;
  status?: number;
  meta?: TMeta;
  headers?: HeadersInit;
}>;

export type PublicApiErrorResponseOptions = Readonly<{
  requestId: string;
  code: PublicApiErrorCode;
  message?: string;
  details?: unknown;
  status?: number;
  headers?: HeadersInit;
}>;

export function createPublicApiSuccessEnvelope<
  TData,
  TMeta extends Record<string, unknown> = Record<never, never>
>(
  data: TData,
  requestId: string,
  meta?: TMeta
): PublicApiSuccessEnvelope<TData, TMeta> {
  return {
    ok: true,
    data,
    meta: {
      ...meta,
      requestId
    } as PublicApiMeta<TMeta>
  };
}

export function createPublicApiErrorEnvelope(
  code: PublicApiErrorCode,
  requestId: string,
  options: Readonly<{ message?: string; details?: unknown }> = {}
): PublicApiErrorEnvelope {
  const definition = getPublicApiErrorDefinition(code);
  const error =
    options.details === undefined
      ? { code, message: options.message ?? definition.message }
      : { code, message: options.message ?? definition.message, details: options.details };

  return {
    ok: false,
    error,
    meta: { requestId }
  };
}

function publicApiJsonResponse(body: unknown, requestId: string, status: number, inputHeaders?: HeadersInit) {
  const headers = new Headers(inputHeaders);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set(PUBLIC_API_REQUEST_ID_HEADER, requestId);

  return new Response(JSON.stringify(body), { status, headers });
}

export function createPublicApiSuccessResponse<
  TData,
  TMeta extends Record<string, unknown> = Record<never, never>
>(data: TData, options: PublicApiSuccessResponseOptions<TMeta>): Response {
  const status = options.status ?? 200;
  if (!Number.isInteger(status) || status < 200 || status > 299) {
    throw new RangeError("A public API success response requires a 2xx status.");
  }

  return publicApiJsonResponse(
    createPublicApiSuccessEnvelope(data, options.requestId, options.meta),
    options.requestId,
    status,
    options.headers
  );
}

export function createPublicApiErrorResponse(options: PublicApiErrorResponseOptions): Response {
  const definition = getPublicApiErrorDefinition(options.code);
  const status = options.status ?? definition.status;
  if (status !== definition.status) {
    throw new RangeError("A public API error response must use its catalog status.");
  }

  return publicApiJsonResponse(
    createPublicApiErrorEnvelope(options.code, options.requestId, {
      message: options.message,
      details: options.details
    }),
    options.requestId,
    status,
    options.headers
  );
}
