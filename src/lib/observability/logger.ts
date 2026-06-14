// PII-safe structured logger (SPEC-006). Emits single-line JSON and never logs phone numbers, message
// bodies, or secrets: a denylist of sensitive keys is redacted recursively, and phone-like digit runs in
// any string value are masked. Demo-safe — writes to stdout/stderr only; no third-party calls.

export type LogLevel = "debug" | "info" | "warn" | "error";

const REDACTED = "[redacted]";

// Keys whose values must never be emitted. Compared case-insensitively.
const REDACTED_KEYS = new Set(
  [
    "phone",
    "to",
    "from",
    "body",
    "message",
    "messageBody",
    "text",
    "authToken",
    "twilioAuthToken",
    "secret",
    "token",
    "apiKey",
    "password",
    "stripeSecretKey",
    "providerFingerprint"
  ].map((key) => key.toLowerCase())
);

// Phone-like runs (E.164 / long digit sequences). Over-redaction is acceptable; leaking is not.
const PHONE_PATTERN = /\+?\d[\d\-\s().]{6,}\d/g;

// Secret regex patterns to redact connection URLs, Bearer tokens, Clerk keys, etc.
const SECRET_PATTERNS = [
  { pattern: /((?:postgres(?:ql)?|redis(?:s)?):\/\/(?:[^:]+)?(?::))([^@]+)(@)/gi, replacement: "$1[redacted]$3" },
  { pattern: /\bBearer\s+[A-Za-z0-9._-]{6,}/gi, replacement: "Bearer [redacted]" },
  { pattern: /\b(?:sk|pk)_(?:live|test)_[a-zA-Z0-9]+/g, replacement: "[redacted]" },
  { pattern: /\bAC[a-fA-F0-9]{32}\b/g, replacement: "[redacted]" }
];

export function redactValue(value: unknown, key?: string): unknown {
  if (key !== undefined && REDACTED_KEYS.has(key.toLowerCase())) {
    return REDACTED;
  }
  if (typeof value === "string") {
    let redacted = value;
    for (const { pattern, replacement } of SECRET_PATTERNS) {
      redacted = redacted.replace(pattern, replacement);
    }
    redacted = redacted.replace(PHONE_PATTERN, REDACTED);
    return redacted;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        redactValue(childValue, childKey)
      ])
    );
  }
  return value;
}

export function redactLogContext(context: Record<string, unknown>): Record<string, unknown> {
  return redactValue(context) as Record<string, unknown>;
}

export function observabilityIsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.OBSERVABILITY_ENABLED === "true";
}

function emit(level: LogLevel, message: string, context: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    level,
    message: redactValue(message) as string,
    ...redactLogContext(context),
    ts: new Date().toISOString()
  });

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = Object.freeze({
  debug: (message: string, context?: Record<string, unknown>) => emit("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => emit("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => emit("error", message, context)
});
