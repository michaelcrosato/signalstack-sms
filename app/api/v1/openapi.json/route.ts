import openApiDocument from "@/public/openapi/v1.json";
import { resolvePublicApiRequestId } from "@/lib/public-api/request-id";
import { createPublicMetadataMethodNotAllowedHandler } from "@/lib/public-api/method-not-allowed";

export const dynamic = "force-dynamic";

const methodNotAllowed = createPublicMetadataMethodNotAllowedHandler(["GET"]);
export {
  methodNotAllowed as POST,
  methodNotAllowed as PUT,
  methodNotAllowed as PATCH,
  methodNotAllowed as DELETE,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS
};

/** Public metadata exception: no database, runtime secret, or authentication initialization. */
export async function GET(request: Request) {
  return new Response(JSON.stringify(openApiDocument), {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Request-Id": resolvePublicApiRequestId(request.headers)
    }
  });
}
