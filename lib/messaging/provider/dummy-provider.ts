import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { normalizeProviderMessageStatus } from "./status";
import type {
  ProviderAdapter,
  ProviderErrorClassification,
  ProviderMessageCreateInput,
  ProviderMessageCreateResult,
  ProviderMessageRecord,
  ProviderSignatureValidationInput
} from "./types";

const DUMMY_ACCOUNT_ID = "dummy-account";
const DUMMY_SIGNATURE_KEY = "signalstack-dummy-provider-signature-v1";

function deterministicMessageId(idempotencyKey: string) {
  return `dummy_${idempotencyKey}`;
}

function deterministicIsoDate(value: string) {
  const digest = createHash("sha256").update(value, "utf8").digest();
  const offsetMs = digest.readUInt32BE(0) * 1000;
  return new Date(Date.UTC(2020, 0, 1) + offsetMs).toISOString();
}

function dummySignature(input: Omit<ProviderSignatureValidationInput, "signature">) {
  const body = Object.keys(input.params)
    .sort()
    .reduce((value, key) => `${value}${key}${input.params[key]}`, input.url);
  return createHmac("sha256", DUMMY_SIGNATURE_KEY).update(body, "utf8").digest("base64url");
}

export function createDummyProvider(): ProviderAdapter {
  const adapter: ProviderAdapter = {
    name: "dummy",
    externalAccountId: DUMMY_ACCOUNT_ID,

    async send(input) {
      return {
        providerMessageId: deterministicMessageId(input.idempotencyKey),
        status: "queued"
      };
    },

    async createMessage(input: ProviderMessageCreateInput): Promise<ProviderMessageCreateResult> {
      return Object.freeze({
        providerMessageId: deterministicMessageId(input.idempotencyKey),
        externalAccountId: DUMMY_ACCOUNT_ID,
        status: normalizeProviderMessageStatus("queued"),
        to: input.to,
        from: input.from ?? null,
        messagingServiceId: input.messagingServiceId ?? null,
        providerErrorCode: null
      });
    },

    async fetchMessage(input): Promise<ProviderMessageRecord> {
      const createdAt = deterministicIsoDate(input.providerMessageId);
      return Object.freeze({
        providerMessageId: input.providerMessageId,
        externalAccountId: DUMMY_ACCOUNT_ID,
        status: normalizeProviderMessageStatus("queued"),
        to: "+15555550100",
        from: "+15555550199",
        messagingServiceId: null,
        providerErrorCode: null,
        createdAt,
        sentAt: null
      });
    },

    normalizeStatus: normalizeProviderMessageStatus,

    classifyError(): ProviderErrorClassification {
      return Object.freeze({
        disposition: "terminal",
        retryable: false,
        safeCode: "DUMMY_PROVIDER_ERROR",
        providerCode: null
      });
    },

    validateSignature(input) {
      if (!input.signature) {
        return false;
      }
      const expected = Buffer.from(dummySignature(input), "utf8");
      const actual = Buffer.from(input.signature, "utf8");
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    },

    async verifyAccount() {
      return Object.freeze({
        externalAccountId: DUMMY_ACCOUNT_ID,
        friendlyName: "SignalStack deterministic dummy",
        status: "active" as const
      });
    },

    async discoverPhoneNumbers() {
      return Object.freeze([
        Object.freeze({
          externalNumberId: "dummy-number",
          externalAccountId: DUMMY_ACCOUNT_ID,
          phoneNumber: "+15555550199",
          friendlyName: "Dummy sender",
          capabilities: Object.freeze({ sms: true, mms: true })
        })
      ]);
    },

    async discoverMessagingServices() {
      return Object.freeze([
        Object.freeze({
          externalServiceId: "dummy-service",
          externalAccountId: DUMMY_ACCOUNT_ID,
          friendlyName: "Dummy messaging service"
        })
      ]);
    },

    async getHealth() {
      return Object.freeze({
        healthy: true,
        checkedAt: new Date(0).toISOString(),
        safeCode: "PROVIDER_HEALTHY" as const
      });
    }
  };

  return Object.freeze(adapter);
}

export const dummyProvider = createDummyProvider();

/** Test helper for deterministic signed dummy webhook fixtures. */
export function signDummyProviderRequest(
  input: Omit<ProviderSignatureValidationInput, "signature">
): string {
  return dummySignature(input);
}
