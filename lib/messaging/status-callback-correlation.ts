import { createHmac, timingSafeEqual } from "node:crypto";
import { parseProviderCredentialMasterKey } from "@/lib/integrations/provider-accounts/credential-encryption";

const CALLBACK_PATH = "/api/webhooks/twilio/status";
const CORRELATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,190}$/;
const PROOF_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type MessageStatusCallbackCorrelation = Readonly<{
  attemptId: string;
  correlationId: string;
  proof: string;
}>;

export function createMessageStatusCallbackUrl(input: Readonly<{
  appUrl: string;
  orgId: string;
  attemptId: string;
  correlationId: string;
  masterKey: string | Buffer | Uint8Array;
}>): string {
  assertCorrelationBinding(input.orgId, input.attemptId, input.correlationId);
  const base = parseCallbackBaseUrl(input.appUrl);
  const proof = createCorrelationProof(input);
  base.searchParams.set("attempt", input.attemptId);
  base.searchParams.set("correlation", input.correlationId.toLowerCase());
  base.searchParams.set("proof", proof);
  return base.toString();
}

export function readMessageStatusCallbackCorrelation(
  callbackUrl: string
): MessageStatusCallbackCorrelation | null {
  let url: URL;
  try {
    url = new URL(callbackUrl);
  } catch {
    return null;
  }
  if (
    url.pathname !== CALLBACK_PATH ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) ||
    url.searchParams.getAll("attempt").length !== 1 ||
    url.searchParams.getAll("correlation").length !== 1 ||
    url.searchParams.getAll("proof").length !== 1
  ) {
    return null;
  }
  const allowedKeys = new Set(["attempt", "correlation", "proof"]);
  if (Array.from(url.searchParams.keys()).some((key) => !allowedKeys.has(key))) {
    return null;
  }
  const attemptId = url.searchParams.get("attempt") ?? "";
  const correlationId = url.searchParams.get("correlation") ?? "";
  const proof = url.searchParams.get("proof") ?? "";
  if (
    !IDENTIFIER_PATTERN.test(attemptId) ||
    !CORRELATION_ID_PATTERN.test(correlationId) ||
    !PROOF_PATTERN.test(proof)
  ) {
    return null;
  }
  return Object.freeze({ attemptId, correlationId: correlationId.toLowerCase(), proof });
}

export function validateMessageStatusCallbackCorrelation(input: Readonly<{
  orgId: string;
  correlation: MessageStatusCallbackCorrelation;
  masterKey: string | Buffer | Uint8Array;
}>): boolean {
  try {
    assertCorrelationBinding(
      input.orgId,
      input.correlation.attemptId,
      input.correlation.correlationId
    );
    if (!PROOF_PATTERN.test(input.correlation.proof)) return false;
    const expected = Buffer.from(
      createCorrelationProof({
        orgId: input.orgId,
        attemptId: input.correlation.attemptId,
        correlationId: input.correlation.correlationId,
        masterKey: input.masterKey
      }),
      "utf8"
    );
    const actual = Buffer.from(input.correlation.proof, "utf8");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function createCorrelationProof(input: Readonly<{
  orgId: string;
  attemptId: string;
  correlationId: string;
  masterKey: string | Buffer | Uint8Array;
}>): string {
  const masterKey = parseProviderCredentialMasterKey(input.masterKey);
  const key = createHmac("sha256", masterKey)
    .update("signalstack/message-status-callback-key/v1\0", "utf8")
    .digest();
  return createHmac("sha256", key)
    .update(
      JSON.stringify({
        context: "signalstack/message-status-callback",
        version: 1,
        orgId: input.orgId,
        attemptId: input.attemptId,
        correlationId: input.correlationId.toLowerCase()
      }),
      "utf8"
    )
    .digest("base64url");
}

function parseCallbackBaseUrl(value: string): URL {
  const input = new URL(value);
  if (input.protocol !== "https:" || input.username || input.password) {
    throw new Error("Live message callback origin is invalid.");
  }
  const callback = new URL(CALLBACK_PATH, input.origin);
  callback.hash = "";
  return callback;
}

function assertCorrelationBinding(orgId: string, attemptId: string, correlationId: string): void {
  if (
    !IDENTIFIER_PATTERN.test(orgId) ||
    !IDENTIFIER_PATTERN.test(attemptId) ||
    !CORRELATION_ID_PATTERN.test(correlationId)
  ) {
    throw new Error("Message callback correlation binding is invalid.");
  }
}
