export const terminalDeliveryFailureProviderStatuses = Object.freeze(["failed", "undelivered"] as const);

export type TerminalDeliveryFailureProviderStatus = (typeof terminalDeliveryFailureProviderStatuses)[number];

export function isTerminalDeliveryFailureProviderStatus(
  providerStatus: string | null | undefined
): providerStatus is TerminalDeliveryFailureProviderStatus {
  return terminalDeliveryFailureProviderStatuses.includes(providerStatus as TerminalDeliveryFailureProviderStatus);
}

export function isTerminalDeliveryFailure(message: {
  failedAt: Date | null;
  providerStatus: string | null;
}) {
  return message.failedAt !== null || isTerminalDeliveryFailureProviderStatus(message.providerStatus);
}

export function isLocalDeliveryDelivered(message: {
  deliveredAt: Date | null;
  failedAt: Date | null;
  providerStatus: string | null;
}) {
  return message.deliveredAt !== null && !isTerminalDeliveryFailure(message);
}
