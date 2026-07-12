import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  decodePublicApiCursor,
  encodePublicApiCursor,
  PublicApiCursorError,
  PUBLIC_API_CURSOR_MAX_LENGTH
} from "@/lib/public-api/cursor";

const secret = "cursor-secret-material-that-is-at-least-32-bytes";
const otherSecret = "different-secret-material-that-is-32-bytes-minimum";
const input = {
  orgId: "org_tenant_a",
  resource: "contacts",
  createdAt: "2026-07-11T05:30:00.000Z",
  id: "contact_123"
} as const;

function signWirePayload(payload: unknown) {
  const payloadSegment = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signatureSegment = createHmac("sha256", secret)
    .update(`signalstack-public-api-cursor:v1.${payloadSegment}`, "utf8")
    .digest("base64url");
  return `${payloadSegment}.${signatureSegment}`;
}

describe("public API cursor codec", () => {
  it("round-trips a versioned tenant and resource-bound position", () => {
    const cursor = encodePublicApiCursor(input, secret);

    expect(cursor.length).toBeLessThanOrEqual(PUBLIC_API_CURSOR_MAX_LENGTH);
    expect(decodePublicApiCursor(cursor, { orgId: input.orgId, resource: input.resource }, secret)).toEqual({
      createdAt: input.createdAt,
      id: input.id
    });
  });

  it("is deterministic for an exact stable pagination position", () => {
    expect(encodePublicApiCursor(input, secret)).toBe(encodePublicApiCursor(input, secret));
  });

  it("rejects payload and signature tampering with one stable cursor error", () => {
    const cursor = encodePublicApiCursor(input, secret);
    const [payload, signature] = cursor.split(".");
    const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}.${signature}`;
    const tamperedSignature = `${payload}.${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;

    for (const candidate of [tamperedPayload, tamperedSignature]) {
      expect(() =>
        decodePublicApiCursor(candidate, { orgId: input.orgId, resource: input.resource }, secret)
      ).toThrow(PublicApiCursorError);
    }
  });

  it("rejects a valid cursor in another tenant, resource, or signing domain", () => {
    const cursor = encodePublicApiCursor(input, secret);

    expect(() => decodePublicApiCursor(cursor, { orgId: "org_tenant_b", resource: "contacts" }, secret)).toThrow(
      PublicApiCursorError
    );
    expect(() => decodePublicApiCursor(cursor, { orgId: input.orgId, resource: "campaigns" }, secret)).toThrow(
      PublicApiCursorError
    );
    expect(() =>
      decodePublicApiCursor(cursor, { orgId: input.orgId, resource: input.resource }, otherSecret)
    ).toThrow(PublicApiCursorError);
  });

  it("rejects a correctly signed unsupported version or extra wire fields", () => {
    const unsupported = signWirePayload({
      v: 2,
      t: input.orgId,
      r: input.resource,
      c: input.createdAt,
      i: input.id
    });
    const extended = signWirePayload({
      v: 1,
      t: input.orgId,
      r: input.resource,
      c: input.createdAt,
      i: input.id,
      extra: true
    });

    expect(() =>
      decodePublicApiCursor(unsupported, { orgId: input.orgId, resource: input.resource }, secret)
    ).toThrow(PublicApiCursorError);
    expect(() =>
      decodePublicApiCursor(extended, { orgId: input.orgId, resource: input.resource }, secret)
    ).toThrow(PublicApiCursorError);
  });

  it("rejects malformed, oversized, or non-canonical positions before use", () => {
    expect(() => decodePublicApiCursor("not-a-cursor", input, secret)).toThrow(PublicApiCursorError);
    expect(() => decodePublicApiCursor("a".repeat(PUBLIC_API_CURSOR_MAX_LENGTH + 1), input, secret)).toThrow(
      PublicApiCursorError
    );
    expect(() => encodePublicApiCursor({ ...input, createdAt: "2026-07-11T05:30:00Z" }, secret)).toThrow(
      TypeError
    );
    expect(() => encodePublicApiCursor({ ...input, resource: "Contacts" }, secret)).toThrow(TypeError);
  });

  it("requires provided high-entropy secret material without reading runtime state", () => {
    expect(() => encodePublicApiCursor(input, "too-short")).toThrow(RangeError);
    expect(() => encodePublicApiCursor(input, "x".repeat(257))).toThrow(RangeError);
  });
});
