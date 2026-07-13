import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  CustomerWebhookVerificationError,
  InMemoryEventDeduplicator,
  parseWebhookSecretsEnvironment,
  verifyCustomerWebhookRequest
} from "./verify";

const MAX_BODY_BYTES = 1024 * 1024;
const deduplicator = new InMemoryEventDeduplicator();

/**
 * Minimal dependency-free receiver. Replace the memory deduper with an atomic, durable UNIQUE(event_id)
 * claim before applying business effects; at-least-once delivery spans processes and restarts.
 */
const server = createServer(async (request, response) => {
  try {
    if (request.method !== "POST" || request.url !== "/signalstack/webhooks") {
      respond(response, 404);
      return;
    }
    const rawBody = await readBoundedRawBody(request);
    const verified = verifyCustomerWebhookRequest({
      rawHeaders: request.rawHeaders,
      rawBody,
      secretsByVersion: parseWebhookSecretsEnvironment(process.env)
    });
    if (!deduplicator.claim(verified.eventId)) {
      respond(response, 204);
      return;
    }

    // Apply effects only after verification and the durable event-ID claim in a production receiver.
    console.log(
      JSON.stringify({
        acceptedEventId: verified.eventId,
        eventType: verified.eventType,
        deliveryId: verified.deliveryId,
        secretVersion: verified.secretVersion
      })
    );
    respond(response, 204);
  } catch (error) {
    if (!(error instanceof CustomerWebhookVerificationError)) {
      console.error("Customer webhook receiver failed before acknowledgement.");
    }
    respond(response, 400);
  }
});

const host = "127.0.0.1";
const port = parsePort(process.env.SIGNALSTACK_WEBHOOK_RECEIVER_PORT ?? "8787");
server.listen(port, host, () => {
  console.log(`SignalStack webhook receiver listening at http://${host}:${port}/signalstack/webhooks`);
});

async function readBoundedRawBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > MAX_BODY_BYTES) throw new CustomerWebhookVerificationError();
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, length);
}

function respond(response: ServerResponse, statusCode: number): void {
  if (response.headersSent) return;
  response.writeHead(statusCode, { "Content-Length": "0", "Cache-Control": "no-store" });
  response.end();
}

function parsePort(value: string): number {
  if (!/^[1-9]\d{0,4}$/.test(value)) throw new Error("SIGNALSTACK_WEBHOOK_RECEIVER_PORT is invalid.");
  const parsed = Number(value);
  if (parsed > 65_535) throw new Error("SIGNALSTACK_WEBHOOK_RECEIVER_PORT is invalid.");
  return parsed;
}
