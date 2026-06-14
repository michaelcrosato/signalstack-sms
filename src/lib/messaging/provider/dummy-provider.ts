import type { MessagingProvider } from "./types";

export const dummyProvider: MessagingProvider = {
  name: "dummy",
  async send(input) {
    return {
      providerMessageId: `dummy_${input.idempotencyKey}`,
      status: "queued"
    };
  }
};
