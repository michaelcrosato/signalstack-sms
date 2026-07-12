import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export type TwilioCallbackKind = "inbound" | "status";

export type TwilioCallbackExample = Readonly<{
  kind: TwilioCallbackKind;
  url: string;
  params: Readonly<Record<string, string>>;
  signature: string;
}>;

/** Twilio's form boundary: exact public URL followed by every form field in sorted-name order. */
export function signTwilioForm(
  url: string,
  params: Readonly<Record<string, string>>,
  authToken: string
): string {
  if (!authToken || hasControlCharacter(authToken)) throw new TypeError("TWILIO_AUTH_TOKEN is required.");
  const signed = Object.keys(params)
    .sort()
    .reduce((value, key) => `${value}${key}${params[key]}`, url);
  return createHmac("sha1", authToken).update(signed, "utf8").digest("base64");
}

export function createTwilioCallbackExample(input: Readonly<{
  kind: TwilioCallbackKind;
  baseUrl: string;
  authToken: string;
  messageSid?: string;
}>): TwilioCallbackExample {
  const baseUrl = requireLocalBaseUrl(input.baseUrl);
  const path = `/api/webhooks/twilio/${input.kind}`;
  const url = `${baseUrl}${path}`;
  const messageSid = input.messageSid ?? "SM_LOCAL_EXAMPLE_001";
  const params: Readonly<Record<string, string>> =
    input.kind === "inbound"
      ? {
          AccountSid: "AC_LOCAL_EXAMPLE_001",
          MessageSid: messageSid,
          From: "+15555550100",
          To: "+15555550199",
          Body: "Local signed callback example"
        }
      : {
          AccountSid: "AC_LOCAL_EXAMPLE_001",
          MessageSid: messageSid,
          MessageStatus: "delivered"
        };
  return Object.freeze({
    kind: input.kind,
    url,
    params: Object.freeze(params),
    signature: signTwilioForm(url, params, input.authToken)
  });
}

export async function runTwilioCallbackExample(
  argumentsList = process.argv.slice(2),
  environment: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const kind = parseKind(argumentsList);
  const send = argumentsList.includes("--send");
  const authToken = environment.TWILIO_AUTH_TOKEN;
  if (!authToken) throw new Error("TWILIO_AUTH_TOKEN is required and must match the local server.");
  const example = createTwilioCallbackExample({
    kind,
    baseUrl: environment.SIGNALSTACK_BASE_URL ?? "http://127.0.0.1:3000",
    authToken,
    messageSid: environment.TWILIO_MESSAGE_SID
  });

  if (!send) {
    console.log(
      JSON.stringify({
        mode: "dry-run",
        kind: example.kind,
        url: example.url,
        contentType: "application/x-www-form-urlencoded",
        params: example.params,
        headers: { "X-Twilio-Signature": example.signature },
        note: "The auth token is read from the environment and is never printed. Add --send for localhost only."
      })
    );
    return;
  }

  const response = await fetch(example.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": example.signature
    },
    body: new URLSearchParams(example.params)
  });
  const responseBody = await response.text();
  console.log(JSON.stringify({ kind, status: response.status, responseBody }));
}

function parseKind(argumentsList: readonly string[]): TwilioCallbackKind {
  const kindIndex = argumentsList.indexOf("--kind");
  const value = kindIndex >= 0 ? argumentsList[kindIndex + 1] : "inbound";
  if (value !== "inbound" && value !== "status") {
    throw new TypeError("--kind must be inbound or status.");
  }
  return value;
}

function requireLocalBaseUrl(value: string): string {
  const url = new URL(value);
  if (!(["http:", "https:"] as const).includes(url.protocol as "http:" | "https:")) {
    throw new TypeError("SIGNALSTACK_BASE_URL must use http or https.");
  }
  const hostname = url.hostname.toLowerCase();
  if (!(hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1")) {
    throw new TypeError("This callback example intentionally permits localhost targets only.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError("SIGNALSTACK_BASE_URL cannot contain credentials, query, or fragment.");
  }
  return url.toString().replace(/\/$/, "");
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => (character.codePointAt(0) ?? 0) < 32);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  runTwilioCallbackExample().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Twilio callback example failed.");
    process.exitCode = 1;
  });
}
