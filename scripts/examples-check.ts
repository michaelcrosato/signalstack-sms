import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateTwilioSignature } from "@/lib/messaging/twilio-webhooks";
import { generateCustomerWebhookGoldenVector } from "@/examples/customer-webhook/generate-golden-vector";
import {
  CustomerWebhookVerificationError,
  headersRecordToRawHeaders,
  verifyCustomerWebhookRequest
} from "@/examples/customer-webhook/verify";
import { createTwilioCallbackExample } from "@/examples/provider-callback/twilio-callback";

const root = process.cwd();
const fixturePath = join(root, "examples", "customer-webhook", "golden-vector.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as ReturnType<
  typeof generateCustomerWebhookGoldenVector
>;
const generated = generateCustomerWebhookGoldenVector();
if (JSON.stringify(fixture) !== JSON.stringify(generated)) {
  throw new Error("Customer-webhook golden vector drifted from the production signer.");
}

const rawBody = Buffer.from(fixture.rawBodyBase64, "base64");
const rawHeaders = headersRecordToRawHeaders(fixture.headers);
const verified = verifyCustomerWebhookRequest({
  rawHeaders,
  rawBody,
  secretsByVersion: new Map([[fixture.secretVersion, fixture.secret]]),
  nowSeconds: fixture.nowSeconds,
  toleranceSeconds: fixture.toleranceSeconds
});
if (
  verified.eventId !== fixture.eventId ||
  verified.eventType !== fixture.eventType ||
  verified.deliveryId !== fixture.deliveryId ||
  verified.secretVersion !== fixture.secretVersion
) {
  throw new Error("TypeScript receiver did not preserve golden-vector identity evidence.");
}

expectWebhookRejection(
  [...rawHeaders, "X-SignalStack-Signature", fixture.headers["X-SignalStack-Signature"]],
  rawBody,
  fixture.nowSeconds,
  "duplicate signature"
);
expectWebhookRejection(rawHeaders, Buffer.from(rawBody.toString("utf8").trim()), fixture.nowSeconds, "changed body");
expectWebhookRejection(rawHeaders, rawBody, fixture.nowSeconds + 301, "stale timestamp");

const twilio = createTwilioCallbackExample({
  kind: "inbound",
  baseUrl: "http://127.0.0.1:3000",
  authToken: "local-example-token"
});
if (
  !validateTwilioSignature({
    authToken: "local-example-token",
    signature: twilio.signature,
    url: twilio.url,
    params: { ...twilio.params }
  })
) {
  throw new Error("Provider-callback example drifted from the implemented Twilio signature boundary.");
}

assertExampleMarkers("examples/public-api/curl-flow.sh", [
  "/api/v1/contacts",
  "/api/v1/messages",
  "/api-keys/current/rotate",
  "Idempotency-Key"
]);
assertExampleMarkers("examples/public-api/typescript-client.ts", [
  "iterateCollection",
  "Idempotency-Key",
  "applicationStatus",
  "requiresReview",
  "cancelMessage"
]);
assertExampleMarkers("examples/public-api/python_client.py", [
  "iterate_collection",
  "Idempotency-Key",
  "applicationStatus",
  "requiresReview",
  "cancel_message"
]);
assertExampleExcludes("examples/public-api/curl-flow.sh", [
  'post_json "/api/v1/api-keys/current/rotate"',
  '"$ROTATE_KEY" \'{}\'',
  '--header "Authorization: Bearer'
]);
assertExampleExcludes("examples/public-api/typescript-client.ts", [
  '"/api/v1/api-keys/current/rotate",\n      { method: "POST", body:'
]);
assertExampleExcludes("examples/public-api/python_client.py", [
  '"/api/v1/api-keys/current/rotate", "POST", {},'
]);

const python = findPython();
if (python) {
  const result = spawnSync(python, ["-B", join(root, "examples", "customer-webhook", "receiver.py"), "--verify-fixture", fixturePath], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }
  });
  if (result.status !== 0) {
    throw new Error(`Python customer-webhook verifier failed: ${(result.stderr || result.stdout).trim()}`);
  }
  if (!result.stdout.includes("golden vector passed")) {
    throw new Error("Python customer-webhook verifier did not report golden-vector completion.");
  }
} else {
  console.log("Python was not available; Python receiver execution was skipped.");
}

console.log(
  `Integration examples verified: production-signer vector, TypeScript receiver, ${python ? "Python receiver, " : ""}provider callback, and M5 public message lifecycle.`
);

function expectWebhookRejection(
  headers: readonly string[],
  body: Buffer,
  nowSeconds: number,
  label: string
): void {
  try {
    verifyCustomerWebhookRequest({
      rawHeaders: headers,
      rawBody: body,
      secretsByVersion: new Map([[fixture.secretVersion, fixture.secret]]),
      nowSeconds,
      toleranceSeconds: fixture.toleranceSeconds
    });
  } catch (error) {
    if (error instanceof CustomerWebhookVerificationError) return;
    throw error;
  }
  throw new Error(`TypeScript customer-webhook receiver accepted ${label}.`);
}

function assertExampleMarkers(relativePath: string, markers: readonly string[]): void {
  const text = readFileSync(join(root, relativePath), "utf8");
  for (const marker of markers) {
    if (!text.includes(marker)) throw new Error(`${relativePath} is missing required example marker: ${marker}`);
  }
}

function assertExampleExcludes(relativePath: string, forbidden: readonly string[]): void {
  const source = readFileSync(join(root, relativePath), "utf8");
  for (const marker of forbidden) {
    if (source.includes(marker)) throw new Error(`${relativePath} contains forbidden example drift: ${marker}`);
  }
}

function findPython(): string | null {
  for (const command of process.platform === "win32" ? ["python", "python3"] : ["python3", "python"]) {
    const result = spawnSync(command, ["--version"], { encoding: "utf8" });
    if (result.status === 0) return command;
  }
  return null;
}
