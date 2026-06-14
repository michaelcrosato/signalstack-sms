export type MessagingProviderName = "dummy" | "twilio";

export interface MessageSendInput {
  to: string;
  from: string;
  body: string;
  orgId: string;
  idempotencyKey: string;
}

export interface MessageSendResult {
  providerMessageId: string;
  status: "queued" | "blocked";
}

export interface MessagingProvider {
  name: MessagingProviderName;
  send(input: MessageSendInput): Promise<MessageSendResult>;
}
