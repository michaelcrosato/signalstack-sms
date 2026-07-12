import { decodePublicApiCursor, encodePublicApiCursor } from "@/lib/public-api/cursor";
import { readApiKeyPepper } from "@/lib/public-api/api-key-crypto";
import { PublicApiRequestError } from "@/lib/public-api/request";
import { publicApiCollectionQuerySchema } from "@/lib/validation/public-api-resources";

export type PublicApiCollectionQuery = Readonly<{
  limit: number;
  cursor: Readonly<{ createdAt: Date; id: string }> | null;
}>;

export type PublicApiPaginationMeta = Readonly<{
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}>;

export function parsePublicApiCollectionQuery(
  request: Request,
  binding: Readonly<{ orgId: string; resource: string }>
): PublicApiCollectionQuery {
  const searchParams = new URL(request.url).searchParams;
  const values: Record<string, string> = {};
  for (const [name, value] of searchParams) {
    if (Object.hasOwn(values, name)) {
      throw new PublicApiRequestError("INVALID_REQUEST", `The ${name} query parameter must not be repeated.`);
    }
    values[name] = value;
  }

  const parsed = publicApiCollectionQuerySchema.parse(values);
  if (!parsed.cursor) {
    return Object.freeze({ limit: parsed.limit, cursor: null });
  }

  const cursor = decodePublicApiCursor(parsed.cursor, binding, readApiKeyPepper());
  return Object.freeze({
    limit: parsed.limit,
    cursor: Object.freeze({ createdAt: new Date(cursor.createdAt), id: cursor.id })
  });
}

export function publicApiCursorWhere(cursor: PublicApiCollectionQuery["cursor"]) {
  if (!cursor) {
    return undefined;
  }
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } }
    ]
  };
}

export function createPublicApiPage<T extends Readonly<{ id: string; createdAt: Date }>>(
  rows: readonly T[],
  query: PublicApiCollectionQuery,
  binding: Readonly<{ orgId: string; resource: string }>
): Readonly<{ rows: readonly T[]; pagination: PublicApiPaginationMeta }> {
  const hasMore = rows.length > query.limit;
  const pageRows = rows.slice(0, query.limit);
  const lastRow = hasMore ? pageRows.at(-1) : undefined;
  const nextCursor = lastRow
    ? encodePublicApiCursor(
        {
          ...binding,
          createdAt: lastRow.createdAt.toISOString(),
          id: lastRow.id
        },
        readApiKeyPepper()
      )
    : null;

  return Object.freeze({
    rows: Object.freeze(pageRows),
    pagination: Object.freeze({ limit: query.limit, hasMore, nextCursor })
  });
}
