import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { RequestOptions } from "node:https";
import type { LookupOptions } from "node:dns";
import { describe, expect, it, vi } from "vitest";
import {
  postCustomerWebhook,
  type CustomerWebhookHttpsRequest
} from "@/lib/integrations/customer-webhooks/transport";

type ResponsePlan = Readonly<{
  statusCode?: number;
  headers?: Record<string, string>;
  chunks?: readonly (Buffer | string)[];
  end?: boolean;
}>;

describe("customer webhook pinned HTTPS transport", () => {
  it("re-resolves each attempt, vets all answers, and pins a public address without losing hostname TLS validation", async () => {
    const resolved = ["93.184.216.34", "8.8.8.8"];
    const resolver = vi.fn(async () => [
      { address: resolved.shift()!, family: 4 as const },
      { address: "2606:4700:4700::1111", family: 6 as const }
    ]);
    const observedOptions: RequestOptions[] = [];
    const pinnedAddresses: string[] = [];
    const bodies: Buffer[] = [];
    const request = requestDouble(
      { statusCode: 204, headers: { "retry-after": "60" }, chunks: ["ok"] },
      (options, body) => {
        observedOptions.push(options);
        bodies.push(body);
        options.lookup!(
          "hooks.example.com",
          { all: false } as LookupOptions,
          (error, address, family) => {
            expect(error).toBeNull();
            expect(family).toBe(4);
            pinnedAddresses.push(address as string);
          }
        );
      }
    );
    const rawBody = Buffer.from('{"id":"evt_1"}', "utf8");

    const first = await postCustomerWebhook(
      {
        endpointUrl: "https://Hooks.Example.COM:8443/events",
        rawBody,
        headers: { "X-SignalStack-Signature": `v1=${"a".repeat(64)}` }
      },
      { resolveDns: resolver, request }
    );
    const second = await postCustomerWebhook(
      { endpointUrl: "https://hooks.example.com:8443/events", rawBody },
      { resolveDns: resolver, request }
    );

    expect(resolver).toHaveBeenCalledTimes(2);
    expect(resolver).toHaveBeenNthCalledWith(1, "hooks.example.com");
    expect(pinnedAddresses).toEqual(["93.184.216.34", "8.8.8.8"]);
    expect(observedOptions[0]).toMatchObject({
      protocol: "https:",
      hostname: "hooks.example.com",
      servername: "hooks.example.com",
      port: 8443,
      path: "/events",
      method: "POST",
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
      agent: false
    });
    expect(observedOptions[0]).not.toHaveProperty("checkServerIdentity");
    expect(observedOptions[0]).not.toHaveProperty("maxRedirects");
    expect(observedOptions[0].headers).toMatchObject({
      "Content-Length": rawBody.length,
      "Content-Type": "application/json"
    });
    expect(bodies).toEqual([rawBody, rawBody]);
    expect(first).toEqual({ statusCode: 204, retryAfter: "60", body: Buffer.from("ok") });
    expect(second.statusCode).toBe(204);
  });

  it("rejects mixed public/private DNS answers before opening a socket", async () => {
    const request = vi.fn() as unknown as CustomerWebhookHttpsRequest;
    await expect(
      postCustomerWebhook(
        { endpointUrl: "https://hooks.example.com/events", rawBody: Buffer.from("{}") },
        {
          resolveDns: async () => [
            { address: "93.184.216.34", family: 4 },
            { address: "169.254.169.254", family: 4 }
          ],
          request
        }
      )
    ).rejects.toMatchObject({ code: "UNSAFE_ENDPOINT" });
    expect(request).not.toHaveBeenCalled();
  });

  it("returns redirects to the policy layer and never issues a second request", async () => {
    const request = vi.fn(
      requestDouble({ statusCode: 307, headers: { location: "https://internal.invalid/secret" } })
    );
    const response = await postCustomerWebhook(
      { endpointUrl: "https://hooks.example.com/events", rawBody: Buffer.from("{}") },
      { resolveDns: publicResolver, request }
    );

    expect(response.statusCode).toBe(307);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("bounds request input and forbids authority/hop-by-hop header overrides before DNS", async () => {
    const resolver = vi.fn(publicResolver);
    await expect(
      postCustomerWebhook(
        {
          endpointUrl: "https://hooks.example.com/events",
          rawBody: Buffer.from("{}"),
          headers: { Host: "169.254.169.254" }
        },
        { resolveDns: resolver }
      )
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(
      postCustomerWebhook(
        {
          endpointUrl: "https://hooks.example.com/events",
          rawBody: Buffer.alloc(11),
          limits: { maxRequestBodyBytes: 10 }
        },
        { resolveDns: resolver }
      )
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(resolver).not.toHaveBeenCalled();
  });

  it("enforces bounded DNS, request, response, and response-size failures", async () => {
    await expect(
      postCustomerWebhook(
        {
          endpointUrl: "https://hooks.example.com/events",
          rawBody: Buffer.from("{}"),
          limits: { dnsTimeoutMs: 100 }
        },
        { resolveDns: () => new Promise(() => undefined) }
      )
    ).rejects.toMatchObject({ code: "DNS_TIMEOUT" });

    await expect(
      postCustomerWebhook(
        {
          endpointUrl: "https://hooks.example.com/events",
          rawBody: Buffer.from("{}"),
          limits: { requestTimeoutMs: 100 }
        },
        { resolveDns: publicResolver, request: requestDouble({ end: false }, undefined, false) }
      )
    ).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });

    await expect(
      postCustomerWebhook(
        {
          endpointUrl: "https://hooks.example.com/events",
          rawBody: Buffer.from("{}"),
          limits: { responseTimeoutMs: 100 }
        },
        { resolveDns: publicResolver, request: requestDouble({ statusCode: 204, end: false }) }
      )
    ).rejects.toMatchObject({ code: "RESPONSE_TIMEOUT" });

    await expect(
      postCustomerWebhook(
        {
          endpointUrl: "https://hooks.example.com/events",
          rawBody: Buffer.from("{}"),
          limits: { maxResponseBodyBytes: 3 }
        },
        { resolveDns: publicResolver, request: requestDouble({ statusCode: 200, chunks: ["four"] }) }
      )
    ).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
  });

  it("sanitizes resolver and socket failures without reflecting endpoint or body details", async () => {
    const endpointUrl = "https://hooks.example.com/sensitive-customer-path";
    const rawBody = Buffer.from("sensitive-payload");
    const dnsFailure = postCustomerWebhook(
      { endpointUrl, rawBody },
      { resolveDns: async () => Promise.reject(new Error(`lookup failed for ${endpointUrl}`)) }
    );
    await expect(dnsFailure).rejects.toMatchObject({ code: "DNS_LOOKUP_FAILED" });
    await expect(dnsFailure).rejects.not.toThrow(/sensitive/);

    const networkFailure = postCustomerWebhook(
      { endpointUrl, rawBody },
      { resolveDns: publicResolver, request: requestDouble({}, undefined, true, true) }
    );
    await expect(networkFailure).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    await expect(networkFailure).rejects.not.toThrow(/sensitive/);
  });
});

async function publicResolver() {
  return [{ address: "93.184.216.34", family: 4 as const }];
}

function requestDouble(
  plan: ResponsePlan,
  observe?: (options: RequestOptions, body: Buffer) => void,
  invokeResponse = true,
  emitRequestError = false
): CustomerWebhookHttpsRequest {
  return (options, onResponse) => {
    const request = Object.assign(new EventEmitter(), {
      end(chunk?: Buffer | Uint8Array | string) {
        const body = chunk === undefined ? Buffer.alloc(0) : Buffer.from(chunk);
        observe?.(options, body);
        queueMicrotask(() => {
          if (emitRequestError) {
            request.emit("error", new Error("socket contained sensitive-payload"));
            return;
          }
          if (!invokeResponse) {
            return;
          }
          const response = Object.assign(new EventEmitter(), {
            statusCode: plan.statusCode,
            headers: plan.headers ?? {},
            destroy() {
              return response;
            }
          }) as unknown as IncomingMessage;
          onResponse(response);
          for (const responseChunk of plan.chunks ?? []) {
            response.emit("data", responseChunk);
          }
          if (plan.end !== false) {
            response.emit("end");
          }
        });
        return request;
      },
      destroy() {
        return request;
      }
    }) as unknown as ClientRequest;
    return request;
  };
}
