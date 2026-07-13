import type {
  ProviderAdapter,
  ProviderErrorClassification,
  ProviderMessageCreateResult
} from "@/lib/messaging/provider/types";

export const DIRECT_MESSAGE_MAX_ATTEMPTS = 3;
export const DIRECT_MESSAGE_RETRY_DELAYS_MS = Object.freeze([5_000, 30_000] as const);

export type DirectMessageAttemptDecision =
  | Readonly<{
      outcome: "sent" | "delivered";
      result: ProviderMessageCreateResult;
    }>
  | Readonly<{
      outcome: "failed";
      errorCode: string;
      providerErrorCode: string | null;
      disposition: "terminal" | "retryable";
      result?: ProviderMessageCreateResult;
    }>
  | Readonly<{
      outcome: "retry";
      errorCode: string;
      providerErrorCode: string | null;
      disposition: "retryable";
      nextAttemptAt: Date;
    }>
  | Readonly<{
      outcome: "ambiguous";
      errorCode: string;
      providerErrorCode: string | null;
      disposition: "ambiguous";
    }>;

const terminalFailureStatuses = new Set(["failed", "undelivered", "canceled"]);

export function decideDirectMessageCreateResult(
  result: ProviderMessageCreateResult
): DirectMessageAttemptDecision {
  if (result.status.status === "delivered") {
    return Object.freeze({ outcome: "delivered", result });
  }
  if (terminalFailureStatuses.has(result.status.status)) {
    return Object.freeze({
      outcome: "failed",
      errorCode: `PROVIDER_STATUS_${result.status.status.toUpperCase()}`,
      providerErrorCode: result.providerErrorCode,
      disposition: "terminal",
      result
    });
  }
  return Object.freeze({ outcome: "sent", result });
}

export function decideDirectMessageCreateError(input: Readonly<{
  adapter: Pick<ProviderAdapter, "classifyError">;
  error: unknown;
  attemptNumber: number;
  now: Date;
}>): DirectMessageAttemptDecision {
  assertAttemptNumber(input.attemptNumber);
  const classification = input.adapter.classifyError(input.error, "create_message");
  return decideClassifiedCreateError({
    classification,
    attemptNumber: input.attemptNumber,
    now: input.now
  });
}

export function decideClassifiedCreateError(input: Readonly<{
  classification: ProviderErrorClassification;
  attemptNumber: number;
  now: Date;
}>): DirectMessageAttemptDecision {
  assertAttemptNumber(input.attemptNumber);
  if (!Number.isFinite(input.now.getTime())) {
    throw new Error("Direct message retry clock is invalid.");
  }
  const errorCode = normalizeSafeCode(input.classification.safeCode);
  const providerErrorCode = normalizeProviderCode(input.classification.providerCode);

  if (input.classification.disposition === "ambiguous") {
    return Object.freeze({
      outcome: "ambiguous",
      errorCode,
      providerErrorCode,
      disposition: "ambiguous"
    });
  }
  if (input.classification.disposition === "retryable" && input.classification.retryable) {
    if (input.attemptNumber < DIRECT_MESSAGE_MAX_ATTEMPTS) {
      const delay = DIRECT_MESSAGE_RETRY_DELAYS_MS[input.attemptNumber - 1];
      if (delay === undefined) {
        throw new Error("Direct message retry policy is incomplete.");
      }
      return Object.freeze({
        outcome: "retry",
        errorCode,
        providerErrorCode,
        disposition: "retryable",
        nextAttemptAt: new Date(input.now.getTime() + delay)
      });
    }
    return Object.freeze({
      outcome: "failed",
      errorCode: "AUTOMATIC_RETRIES_EXHAUSTED",
      providerErrorCode,
      disposition: "retryable"
    });
  }
  return Object.freeze({
    outcome: "failed",
    errorCode,
    providerErrorCode,
    disposition: "terminal"
  });
}

function assertAttemptNumber(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > DIRECT_MESSAGE_MAX_ATTEMPTS) {
    throw new Error("Direct message attempt number is invalid.");
  }
}

function normalizeSafeCode(value: string): string {
  return /^[A-Z][A-Z0-9_]{1,127}$/.test(value) ? value : "PROVIDER_OPERATION_FAILED";
}

function normalizeProviderCode(value: string | null): string | null {
  return value && /^[A-Z][A-Z0-9_]{1,127}$/.test(value) ? value : null;
}
