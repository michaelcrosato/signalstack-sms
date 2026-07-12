import { describe, expect, it } from "vitest";
import { PublicApiRequestError, readPublicApiJson } from "@/lib/public-api/request";

describe("public API bounded JSON reader", () => {
  it("accepts application/json and returns parsed data", async () => {
    const request = new Request("https://example.test/api/v1/contacts", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ phone: "+15551234567" })
    });
    await expect(readPublicApiJson(request)).resolves.toEqual({ phone: "+15551234567" });
  });

  it("rejects unsupported media types before reading", async () => {
    const request = new Request("https://example.test/api/v1/contacts", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}"
    });
    await expect(readPublicApiJson(request)).rejects.toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE"
    });
  });

  it("cancels a streaming body once the byte cap is crossed", async () => {
    const request = new Request("https://example.test/api/v1/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"body":"0123456789"}'));
          controller.close();
        }
      }),
      duplex: "half"
    } as RequestInit & { duplex: "half" });
    await expect(readPublicApiJson(request, 8)).rejects.toBeInstanceOf(PublicApiRequestError);
  });

  it("rejects malformed JSON and invalid UTF-8", async () => {
    const malformed = new Request("https://example.test/api/v1/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{"
    });
    await expect(readPublicApiJson(malformed)).rejects.toMatchObject({ code: "INVALID_JSON" });

    const invalidUtf8 = new Request("https://example.test/api/v1/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Uint8Array([0xff])
    });
    await expect(readPublicApiJson(invalidUtf8)).rejects.toMatchObject({ code: "INVALID_JSON" });
  });
});
