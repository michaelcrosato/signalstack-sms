import { lookup as dnsLookup } from "node:dns/promises";
import type { LookupOptions } from "node:dns";
import type { ClientRequest, IncomingMessage } from "node:http";
import { request as nodeHttpsRequest, type RequestOptions } from "node:https";
import type { LookupFunction } from "node:net";
import {
  assertSafeCustomerWebhookDnsAnswers,
  canonicalizeCustomerWebhookEndpointUrl,
  CustomerWebhookEndpointSecurityError,
  type CustomerWebhookDnsAnswer
} from "@/lib/integrations/customer-webhooks/endpoint-security";

const DEFAULT_DNS_TIMEOUT_MS = 3_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_RESPONSE_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_REQUEST_BODY_BYTES = 1024 * 1024;
const DEFAULT_MAX_RESPONSE_BODY_BYTES = 64 * 1024;

export type CustomerWebhookDnsResolver = (
  hostname: string
) => Promise<readonly CustomerWebhookDnsAnswer[]>;

export type CustomerWebhookHttpsRequest = (
  options: RequestOptions,
  onResponse: (response: IncomingMessage) => void
) => ClientRequest;

export type CustomerWebhookTransportDependencies = Readonly<{
  resolveDns?: CustomerWebhookDnsResolver;
  request?: CustomerWebhookHttpsRequest;
}>;

export type CustomerWebhookTransportLimits = Readonly<{
  dnsTimeoutMs?: number;
  requestTimeoutMs?: number;
  responseTimeoutMs?: number;
  maxRequestBodyBytes?: number;
  maxResponseBodyBytes?: number;
}>;

export type CustomerWebhookTransportResponse = Readonly<{
  statusCode: number;
  retryAfter: string | null;
  body: Buffer;
}>;

export class CustomerWebhookTransportError extends Error {
  readonly code:
    | "INVALID_REQUEST"
    | "UNSAFE_ENDPOINT"
    | "DNS_TIMEOUT"
    | "DNS_LOOKUP_FAILED"
    | "REQUEST_TIMEOUT"
    | "RESPONSE_TIMEOUT"
    | "RESPONSE_TOO_LARGE"
    | "NETWORK_ERROR";

  constructor(code: CustomerWebhookTransportError["code"], message: string) {
    super(message);
    this.name = "CustomerWebhookTransportError";
    this.code = code;
  }
}

/**
 * Performs one HTTPS POST attempt. Every invocation resolves DNS again, rejects the entire answer set if any
 * address is unsafe, then pins one vetted address while preserving the original hostname for SNI and PKIX.
 */
export async function postCustomerWebhook(
  input: {
    endpointUrl: string;
    rawBody: Buffer | Uint8Array;
    headers?: Readonly<Record<string, string>>;
    limits?: CustomerWebhookTransportLimits;
  },
  dependencies: CustomerWebhookTransportDependencies = {}
): Promise<CustomerWebhookTransportResponse> {
  const limits = resolveLimits(input.limits);
  const body = requireRequestBody(input.rawBody, limits.maxRequestBodyBytes);
  const headers = buildRequestHeaders(input.headers, body.length);

  let endpoint: URL;
  try {
    endpoint = new URL(canonicalizeCustomerWebhookEndpointUrl(input.endpointUrl));
  } catch (error) {
    if (error instanceof CustomerWebhookEndpointSecurityError) {
      throw transportError("UNSAFE_ENDPOINT", "Customer webhook endpoint failed URL security validation.");
    }
    throw error;
  }

  const resolver = dependencies.resolveDns ?? resolveCustomerWebhookDns;
  let answers: readonly CustomerWebhookDnsAnswer[];
  try {
    answers = await promiseWithTimeout(
      resolver(endpoint.hostname),
      limits.dnsTimeoutMs,
      transportError("DNS_TIMEOUT", "Customer webhook endpoint DNS lookup timed out.")
    );
  } catch (error) {
    if (error instanceof CustomerWebhookTransportError) {
      throw error;
    }
    throw transportError("DNS_LOOKUP_FAILED", "Customer webhook endpoint DNS lookup failed.");
  }

  let vetted: readonly CustomerWebhookDnsAnswer[];
  try {
    vetted = assertSafeCustomerWebhookDnsAnswers(endpoint.hostname, answers);
  } catch (error) {
    if (error instanceof CustomerWebhookEndpointSecurityError) {
      throw transportError("UNSAFE_ENDPOINT", "Customer webhook endpoint DNS failed security validation.");
    }
    throw error;
  }

  const pinned = vetted[0];
  const lookup = createPinnedLookup(endpoint.hostname, pinned);
  const requestOptions: RequestOptions = {
    protocol: "https:",
    hostname: endpoint.hostname,
    port: endpoint.port === "" ? undefined : Number(endpoint.port),
    path: endpoint.pathname,
    method: "POST",
    headers,
    lookup,
    servername: endpoint.hostname,
    rejectUnauthorized: true,
    minVersion: "TLSv1.2",
    agent: false,
    maxHeaderSize: 16 * 1024
  };

  return performHttpsRequest(
    dependencies.request ?? nodeHttpsRequest,
    requestOptions,
    body,
    limits.requestTimeoutMs,
    limits.responseTimeoutMs,
    limits.maxResponseBodyBytes
  );
}

export async function resolveCustomerWebhookDns(
  hostname: string
): Promise<readonly CustomerWebhookDnsAnswer[]> {
  const answers = await dnsLookup(hostname, { all: true, verbatim: true });
  return answers.map((answer) => ({ address: answer.address, family: answer.family as 4 | 6 }));
}

function performHttpsRequest(
  requestFactory: CustomerWebhookHttpsRequest,
  options: RequestOptions,
  body: Buffer,
  requestTimeoutMs: number,
  responseTimeoutMs: number,
  maxResponseBodyBytes: number
): Promise<CustomerWebhookTransportResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let requestTimer: ReturnType<typeof setTimeout> | null = null;
    let responseTimer: ReturnType<typeof setTimeout> | null = null;
    const finish = (result: CustomerWebhookTransportResponse | CustomerWebhookTransportError) => {
      if (settled) {
        return;
      }
      settled = true;
      if (requestTimer) {
        clearTimeout(requestTimer);
      }
      if (responseTimer) {
        clearTimeout(responseTimer);
      }
      if (result instanceof CustomerWebhookTransportError) {
        reject(result);
      } else {
        resolve(result);
      }
    };

    let request: ClientRequest;
    try {
      request = requestFactory(options, (response) => {
        if (requestTimer) {
          clearTimeout(requestTimer);
        }
        responseTimer = setTimeout(() => {
          const error = transportError("RESPONSE_TIMEOUT", "Customer webhook endpoint response timed out.");
          finish(error);
          response.destroy(error);
        }, responseTimeoutMs);

        const chunks: Buffer[] = [];
        let receivedBytes = 0;
        response.on("data", (chunk: Buffer | string) => {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          receivedBytes += bytes.length;
          if (receivedBytes > maxResponseBodyBytes) {
            const error = transportError("RESPONSE_TOO_LARGE", "Customer webhook endpoint response exceeded the limit.");
            finish(error);
            response.destroy(error);
            return;
          }
          chunks.push(bytes);
        });
        response.once("end", () => {
          if (!Number.isSafeInteger(response.statusCode) || response.statusCode! < 100 || response.statusCode! > 599) {
            finish(transportError("NETWORK_ERROR", "Customer webhook endpoint returned an invalid response."));
            return;
          }
          finish(
            Object.freeze({
              statusCode: response.statusCode!,
              retryAfter: firstHeaderValue(response.headers["retry-after"]),
              body: Buffer.concat(chunks, receivedBytes)
            })
          );
        });
        response.once("error", () => {
          finish(transportError("NETWORK_ERROR", "Customer webhook endpoint response failed."));
        });
      });
    } catch {
      reject(transportError("NETWORK_ERROR", "Customer webhook request could not be created."));
      return;
    }

    requestTimer = setTimeout(() => {
      const error = transportError("REQUEST_TIMEOUT", "Customer webhook endpoint request timed out.");
      finish(error);
      request.destroy(error);
    }, requestTimeoutMs);

    request.once("error", () => {
      finish(transportError("NETWORK_ERROR", "Customer webhook endpoint request failed."));
    });
    request.end(body);
  });
}

function createPinnedLookup(expectedHostname: string, answer: CustomerWebhookDnsAnswer): LookupFunction {
  return (hostname: string, options: LookupOptions, callback) => {
    if (hostname.toLowerCase() !== expectedHostname.toLowerCase()) {
      const error = new Error("Pinned customer webhook lookup received an unexpected hostname.") as NodeJS.ErrnoException;
      error.code = "EAI_FAIL";
      callback(error, "", answer.family);
      return;
    }
    if (options.all) {
      callback(null, [{ address: answer.address, family: answer.family }]);
      return;
    }
    callback(null, answer.address, answer.family);
  };
}

function resolveLimits(limits: CustomerWebhookTransportLimits | undefined): Required<CustomerWebhookTransportLimits> {
  const resolved = {
    dnsTimeoutMs: limits?.dnsTimeoutMs ?? DEFAULT_DNS_TIMEOUT_MS,
    requestTimeoutMs: limits?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    responseTimeoutMs: limits?.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS,
    maxRequestBodyBytes: limits?.maxRequestBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES,
    maxResponseBodyBytes: limits?.maxResponseBodyBytes ?? DEFAULT_MAX_RESPONSE_BODY_BYTES
  };
  if (
    !boundedInteger(resolved.dnsTimeoutMs, 100, 30_000) ||
    !boundedInteger(resolved.requestTimeoutMs, 100, 30_000) ||
    !boundedInteger(resolved.responseTimeoutMs, 100, 30_000) ||
    !boundedInteger(resolved.maxRequestBodyBytes, 1, 4 * 1024 * 1024) ||
    !boundedInteger(resolved.maxResponseBodyBytes, 0, 1024 * 1024)
  ) {
    throw transportError("INVALID_REQUEST", "Customer webhook transport limits are invalid.");
  }
  return resolved;
}

function requireRequestBody(body: Buffer | Uint8Array, maximumBytes: number): Buffer {
  if (!(Buffer.isBuffer(body) || body instanceof Uint8Array)) {
    throw transportError("INVALID_REQUEST", "Customer webhook request body must be raw bytes.");
  }
  const result = Buffer.from(body);
  if (result.length > maximumBytes) {
    throw transportError("INVALID_REQUEST", "Customer webhook request body exceeds the limit.");
  }
  return result;
}

function buildRequestHeaders(
  supplied: Readonly<Record<string, string>> | undefined,
  contentLength: number
): Readonly<Record<string, string | number>> {
  const entries = Object.entries(supplied ?? {});
  if (entries.length > 32) {
    throw transportError("INVALID_REQUEST", "Customer webhook request has too many headers.");
  }
  const forbidden = new Set(["host", "content-length", "transfer-encoding", "connection", "upgrade", "proxy-authorization"]);
  const headers: Record<string, string | number> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "SignalStack-Customer-Webhooks/1",
    "Content-Length": contentLength
  };
  for (const [name, value] of entries) {
    if (
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(name) ||
      forbidden.has(name.toLowerCase()) ||
      typeof value !== "string" ||
      value.length > 2_048 ||
      Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint < 32 || codePoint === 127;
      })
    ) {
      throw transportError("INVALID_REQUEST", "Customer webhook request contains an invalid header.");
    }
    headers[name] = value;
  }
  return Object.freeze(headers);
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number, error: CustomerWebhookTransportError): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(error), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (reason: unknown) => {
        clearTimeout(timer);
        reject(reason);
      }
    );
  });
}

function boundedInteger(value: number, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function transportError(
  code: CustomerWebhookTransportError["code"],
  message: string
): CustomerWebhookTransportError {
  return new CustomerWebhookTransportError(code, message);
}
