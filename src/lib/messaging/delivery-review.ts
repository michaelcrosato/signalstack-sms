export function getLocalDeliveryReviewStatus({
  outboundMessages,
  delivered,
  pending,
  failed
}: {
  outboundMessages: number;
  delivered: number;
  pending: number;
  failed: number;
}) {
  if (outboundMessages === 0) {
    return "No outbound evidence";
  }

  if (failed > 0) {
    return `${failed} failed; review evidence`;
  }

  if (pending > 0) {
    return `${pending} pending; awaiting provider status`;
  }

  if (delivered === outboundMessages) {
    return "All delivered";
  }

  return "Review delivery evidence";
}
