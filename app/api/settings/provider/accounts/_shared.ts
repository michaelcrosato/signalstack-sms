import { NextResponse } from "next/server";
import { ProviderAccountServiceError } from "@/lib/integrations/provider-accounts/service";
import type { output, ZodTypeAny } from "zod";

const noStoreHeaders = Object.freeze({
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache"
});

type ServiceErrorDefinition = Readonly<{
  status: 400 | 404 | 409 | 422 | 502 | 503;
  message: string;
}>;

const serviceErrorDefinitions: Readonly<
  Record<ProviderAccountServiceError["code"], ServiceErrorDefinition>
> = Object.freeze({
  INVALID_PROVIDER_ACCOUNT: Object.freeze({
    status: 400,
    message: "Provider account request is invalid."
  }),
  PROVIDER_ACCOUNT_NOT_FOUND: Object.freeze({
    status: 404,
    message: "Provider account was not found."
  }),
  PROVIDER_ACCOUNT_CONFLICT: Object.freeze({
    status: 409,
    message: "Provider account ownership conflicts with another account."
  }),
  PROVIDER_VERIFICATION_FAILED: Object.freeze({
    status: 502,
    message: "Provider account verification failed."
  }),
  PROVIDER_CREDENTIAL_UNAVAILABLE: Object.freeze({
    status: 503,
    message: "Provider credential service is unavailable."
  }),
  PROVIDER_DISCOVERY_FAILED: Object.freeze({
    status: 502,
    message: "Provider resource discovery failed."
  }),
  PROVIDER_DISCOVERY_STALE: Object.freeze({
    status: 409,
    message: "Provider discovery evidence is stale."
  }),
  PROVIDER_IMPORT_INVALID: Object.freeze({
    status: 422,
    message: "Provider resource import is invalid."
  }),
  PROVIDER_OWNERSHIP_CONFLICT: Object.freeze({
    status: 409,
    message: "Provider resource ownership conflicts with another organization."
  }),
  PROVIDER_LIFECYCLE_CONFLICT: Object.freeze({
    status: 409,
    message: "Provider lifecycle changed concurrently."
  }),
  PROVIDER_RESOURCE_NOT_FOUND: Object.freeze({
    status: 404,
    message: "Provider resource was not found."
  })
});

export function noStoreResponse(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", noStoreHeaders["Cache-Control"]);
  response.headers.set("Pragma", noStoreHeaders.Pragma);
  return response;
}

export async function parseProviderJson<TSchema extends ZodTypeAny>(
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
      response: providerJson(
        {
          error: "Provider request payload is invalid.",
          code: "INVALID_PROVIDER_REQUEST"
        },
        400
      )
    });
  }
  return Object.freeze({ ok: true, data: parsed.data });
}

export function providerJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: noStoreHeaders });
}

export function providerRouteError(error: unknown): NextResponse {
  if (error instanceof ProviderAccountServiceError) {
    const definition = serviceErrorDefinitions[error.code];
    return providerJson(
      {
        error: definition.message,
        code: error.code
      },
      definition.status
    );
  }

  return providerJson(
    {
      error: "Provider account service is unavailable.",
      code: "PROVIDER_SERVICE_UNAVAILABLE"
    },
    503
  );
}

export function routeParam(value: string): string {
  return typeof value === "string" && value.length <= 128 ? value : "";
}
