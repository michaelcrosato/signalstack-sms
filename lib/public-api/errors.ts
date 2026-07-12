export const PUBLIC_API_ERROR_DEFINITIONS = {
  AUTHENTICATION_REQUIRED: {
    status: 401,
    message: "A bearer API key is required."
  },
  INVALID_API_KEY: {
    status: 401,
    message: "The API key is invalid."
  },
  INSUFFICIENT_SCOPE: {
    status: 403,
    message: "The API key does not grant the required scope."
  },
  INVALID_REQUEST: {
    status: 400,
    message: "The request is invalid."
  },
  INVALID_JSON: {
    status: 400,
    message: "The request body is not valid JSON."
  },
  INVALID_CURSOR: {
    status: 400,
    message: "The pagination cursor is invalid."
  },
  IDEMPOTENCY_KEY_REQUIRED: {
    status: 400,
    message: "An Idempotency-Key header is required."
  },
  IDEMPOTENCY_KEY_INVALID: {
    status: 400,
    message: "The Idempotency-Key header is invalid."
  },
  PAYLOAD_TOO_LARGE: {
    status: 413,
    message: "The request payload is too large."
  },
  UNSUPPORTED_MEDIA_TYPE: {
    status: 415,
    message: "The request media type is not supported."
  },
  VALIDATION_ERROR: {
    status: 422,
    message: "The request failed validation."
  },
  OPERATION_NOT_ALLOWED: {
    status: 422,
    message: "The requested operation is not allowed for this resource."
  },
  NOT_FOUND: {
    status: 404,
    message: "The requested resource was not found."
  },
  METHOD_NOT_ALLOWED: {
    status: 405,
    message: "The request method is not allowed."
  },
  CONFLICT: {
    status: 409,
    message: "The request conflicts with the current resource state."
  },
  IDEMPOTENCY_CONFLICT: {
    status: 409,
    message: "The idempotency key was already used for a different request."
  },
  RATE_LIMIT_EXCEEDED: {
    status: 429,
    message: "The API key rate limit was exceeded."
  },
  INTERNAL_ERROR: {
    status: 500,
    message: "An internal error occurred."
  },
  UPSTREAM_ERROR: {
    status: 502,
    message: "An upstream service failed."
  },
  SERVICE_UNAVAILABLE: {
    status: 503,
    message: "The service is temporarily unavailable."
  }
} as const satisfies Record<string, Readonly<{ status: number; message: string }>>;

export type PublicApiErrorCode = keyof typeof PUBLIC_API_ERROR_DEFINITIONS;

export const PUBLIC_API_ERROR_CODES = Object.freeze(
  Object.keys(PUBLIC_API_ERROR_DEFINITIONS) as PublicApiErrorCode[]
);

const publicApiErrorCodeSet: ReadonlySet<string> = new Set(PUBLIC_API_ERROR_CODES);

export function isPublicApiErrorCode(value: unknown): value is PublicApiErrorCode {
  return typeof value === "string" && publicApiErrorCodeSet.has(value);
}

export function getPublicApiErrorDefinition(code: PublicApiErrorCode) {
  return PUBLIC_API_ERROR_DEFINITIONS[code];
}
