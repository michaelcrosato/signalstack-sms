import { NextResponse } from "next/server";
import { requestHasTrustedOrigin } from "@/lib/auth/request-origin";
import {
  DeliveryAttemptReviewError,
  type DeliveryAttemptReviewErrorCode
} from "@/lib/messaging/delivery-attempt-review";
import { getRuntimeConfig } from "@/lib/env/runtime-config";
import type { output, ZodTypeAny } from "zod";

const noStoreHeaders = Object.freeze({
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache"
});

const errorDefinitions: Readonly<
  Record<DeliveryAttemptReviewErrorCode, Readonly<{ status: number; message: string }>>
> = Object.freeze({
  DELIVERY_ATTEMPT_INVALID: Object.freeze({
    status: 400,
    message: "Delivery attempt request is invalid."
  }),
  DELIVERY_ATTEMPT_NOT_FOUND: Object.freeze({
    status: 404,
    message: "Delivery attempt was not found."
  }),
  DELIVERY_ATTEMPT_CONFLICT: Object.freeze({
    status: 409,
    message: "Delivery attempt state changed or is not eligible for this action."
  }),
  DELIVERY_ATTEMPT_PROVIDER_UNAVAILABLE: Object.freeze({
    status: 503,
    message: "Delivery attempt provider credential is unavailable."
  }),
  DELIVERY_ATTEMPT_FETCH_FAILED: Object.freeze({
    status: 502,
    message: "Delivery attempt provider reconciliation failed."
  })
});

export function deliveryAttemptJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: noStoreHeaders });
}

export function withDeliveryAttemptNoStore(response: Response): Response {
  response.headers.set("Cache-Control", noStoreHeaders["Cache-Control"]);
  response.headers.set("Pragma", noStoreHeaders.Pragma);
  return response;
}

export function deliveryAttemptRouteError(error: unknown): NextResponse {
  if (error instanceof DeliveryAttemptReviewError) {
    const definition = errorDefinitions[error.code];
    return deliveryAttemptJson(
      { error: definition.message, code: error.code },
      definition.status
    );
  }
  return deliveryAttemptJson(
    {
      error: "Delivery attempt review service is unavailable.",
      code: "DELIVERY_ATTEMPT_SERVICE_UNAVAILABLE"
    },
    503
  );
}

export function requireDeliveryAttemptMutationOrigin(request: Request): NextResponse | null {
  try {
    if (!requestHasTrustedOrigin(request, getRuntimeConfig().web)) {
      return deliveryAttemptJson(
        { error: "Request origin is invalid.", code: "INVALID_REQUEST_ORIGIN" },
        403
      );
    }
    return null;
  } catch {
    return deliveryAttemptJson(
      {
        error: "Delivery attempt review service is unavailable.",
        code: "DELIVERY_ATTEMPT_SERVICE_UNAVAILABLE"
      },
      503
    );
  }
}

export async function parseDeliveryAttemptJson<TSchema extends ZodTypeAny>(
  request: Request,
  schema: TSchema
): Promise<
  | Readonly<{ ok: true; data: output<TSchema> }>
  | Readonly<{ ok: false; response: NextResponse }>
> {
  const raw = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Object.freeze({
      ok: false,
      response: deliveryAttemptJson(
        { error: "Delivery attempt request is invalid.", code: "DELIVERY_ATTEMPT_INVALID" },
        400
      )
    });
  }
  return Object.freeze({ ok: true, data: parsed.data });
}
