import { randomUUID } from "node:crypto";

export const PUBLIC_API_REQUEST_ID_HEADER = "X-Request-Id";

const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPublicApiRequestId(value: unknown): value is string {
  return typeof value === "string" && requestIdPattern.test(value);
}

export function resolvePublicApiRequestId(
  headers: Pick<Headers, "get">,
  generate: () => string = randomUUID
): string {
  const supplied = headers.get(PUBLIC_API_REQUEST_ID_HEADER);
  if (isPublicApiRequestId(supplied)) {
    return supplied.toLowerCase();
  }

  const generated = generate();
  if (!isPublicApiRequestId(generated)) {
    throw new TypeError("The request ID generator returned an invalid value.");
  }
  return generated.toLowerCase();
}
