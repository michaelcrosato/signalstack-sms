import { isLocalDeliveryDelivered, isTerminalDeliveryFailure } from "@/lib/messaging/delivery-status";

export type DeliveryMessageMetricInput = {
  direction: string;
  deliveredAt: Date | null;
  failedAt: Date | null;
  providerStatus: string | null;
};

export function getDeliveryMessageMetrics<T extends DeliveryMessageMetricInput>(messages: readonly T[]) {
  const outboundMessages = messages.filter((message) => message.direction === "OUTBOUND");
  const inboundMessages = messages.filter((message) => message.direction === "INBOUND");
  const deliveredMessages = outboundMessages.filter(isLocalDeliveryDelivered);
  const failedMessages = outboundMessages.filter(isTerminalDeliveryFailure);
  const providerStatuses = Array.from(new Set(messages.map((message) => message.providerStatus ?? "local_only")));

  return {
    outboundMessages,
    inboundMessages,
    deliveredMessages,
    failedMessages,
    providerStatuses
  };
}
