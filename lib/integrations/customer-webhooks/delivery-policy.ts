const MIN_ATTEMPTS = 1;
const MAX_ATTEMPTS = 12;
const INITIAL_BACKOFF_SECONDS = 30;
const MAX_BACKOFF_SECONDS = 6 * 60 * 60;

export type CustomerWebhookTransportFailureKind = "network" | "timeout" | "unsafe-endpoint";

export type CustomerWebhookAttemptDecision = Readonly<{
  outcome: "delivered" | "retry" | "failed" | "disable";
  reason:
    | "acknowledged"
    | "receiver-gone"
    | "unsafe-endpoint"
    | "retryable-transport"
    | "retryable-status"
    | "attempts-exhausted"
    | "permanent-status";
  retryDelaySeconds: number | null;
  retryAfterAccepted: boolean;
}>;

export type CustomerWebhookAttemptResult = Readonly<{
  attemptNumber: number;
  maxAttempts: number;
  statusCode?: number;
  transportFailure?: CustomerWebhookTransportFailureKind;
  retryAfterHeader?: string | null;
  nowMilliseconds?: number;
}>;

/**
 * A 2xx response acknowledges delivery. Redirects are deliberately permanent failures because the transport
 * never forwards a signed request to a different authority. 410 and unsafe DNS disable the endpoint.
 */
export function classifyCustomerWebhookAttempt(
  result: CustomerWebhookAttemptResult
): CustomerWebhookAttemptDecision {
  assertAttemptBounds(result.attemptNumber, result.maxAttempts);
  const hasStatus = result.statusCode !== undefined;
  const hasTransportFailure = result.transportFailure !== undefined;
  if (hasStatus === hasTransportFailure) {
    throw new Error("Customer webhook attempt must contain exactly one result kind.");
  }

  if (hasStatus) {
    assertStatusCode(result.statusCode);
    if (result.statusCode >= 200 && result.statusCode <= 299) {
      return decision("delivered", "acknowledged");
    }
    if (result.statusCode === 410) {
      return decision("disable", "receiver-gone");
    }
  }

  if (result.transportFailure === "unsafe-endpoint") {
    return decision("disable", "unsafe-endpoint");
  }

  const retryable =
    hasTransportFailure ||
    result.statusCode === 408 ||
    result.statusCode === 409 ||
    result.statusCode === 425 ||
    result.statusCode === 429 ||
    (result.statusCode !== undefined && result.statusCode >= 500 && result.statusCode <= 599);

  if (!retryable) {
    return decision("failed", "permanent-status");
  }
  if (result.attemptNumber >= result.maxAttempts) {
    return decision("failed", "attempts-exhausted");
  }

  const backoffSeconds = customerWebhookBackoffSeconds(result.attemptNumber);
  const retryAfterSeconds = parseCustomerWebhookRetryAfter(
    result.retryAfterHeader,
    result.nowMilliseconds ?? Date.now()
  );
  const retryDelaySeconds = Math.min(
    MAX_BACKOFF_SECONDS,
    Math.max(backoffSeconds, retryAfterSeconds ?? 0)
  );

  return Object.freeze({
    outcome: "retry",
    reason: hasTransportFailure ? "retryable-transport" : "retryable-status",
    retryDelaySeconds,
    retryAfterAccepted: retryAfterSeconds !== null
  });
}

/** attemptNumber is the just-finished attempt; the result is the delay before the next attempt. */
export function customerWebhookBackoffSeconds(attemptNumber: number): number {
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > MAX_ATTEMPTS) {
    throw new Error("Customer webhook attempt number is invalid.");
  }
  return Math.min(MAX_BACKOFF_SECONDS, INITIAL_BACKOFF_SECONDS * 4 ** (attemptNumber - 1));
}

/** Supports both RFC delta-seconds and HTTP-date forms, always clamped to the delivery retry ceiling. */
export function parseCustomerWebhookRetryAfter(
  value: string | null | undefined,
  nowMilliseconds: number
): number | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    !Number.isFinite(nowMilliseconds) ||
    nowMilliseconds < 0
  ) {
    return null;
  }
  const normalized = value.trim();
  if (/^\d{1,10}$/.test(normalized)) {
    const seconds = Number(normalized);
    return Number.isSafeInteger(seconds) ? Math.min(seconds, MAX_BACKOFF_SECONDS) : null;
  }

  const retryAt = Date.parse(normalized);
  if (!Number.isFinite(retryAt)) {
    return null;
  }
  const seconds = Math.max(0, Math.ceil((retryAt - nowMilliseconds) / 1_000));
  return Math.min(seconds, MAX_BACKOFF_SECONDS);
}

function assertAttemptBounds(attemptNumber: number, maxAttempts: number): void {
  if (
    !Number.isSafeInteger(attemptNumber) ||
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < MIN_ATTEMPTS ||
    maxAttempts > MAX_ATTEMPTS ||
    attemptNumber < 1 ||
    attemptNumber > maxAttempts
  ) {
    throw new Error("Customer webhook attempt bounds are invalid.");
  }
}

function assertStatusCode(statusCode: number | undefined): asserts statusCode is number {
  if (typeof statusCode !== "number" || !Number.isSafeInteger(statusCode) || statusCode < 100 || statusCode > 599) {
    throw new Error("Customer webhook response status is invalid.");
  }
}

function decision(
  outcome: CustomerWebhookAttemptDecision["outcome"],
  reason: CustomerWebhookAttemptDecision["reason"]
): CustomerWebhookAttemptDecision {
  return Object.freeze({ outcome, reason, retryDelaySeconds: null, retryAfterAccepted: false });
}
