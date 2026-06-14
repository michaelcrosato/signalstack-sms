import type { Prisma } from "@prisma/client";
import { terminalDeliveryFailureProviderStatuses } from "@/lib/messaging/delivery-status";

export function outboundMessageWhere(orgId: string): Prisma.MessageWhereInput {
  return {
    orgId,
    direction: "OUTBOUND"
  };
}

export function outboundDeliveredMessageWhere(orgId: string): Prisma.MessageWhereInput {
  return {
    ...outboundMessageWhere(orgId),
    deliveredAt: { not: null },
    failedAt: null,
    OR: [{ providerStatus: null }, { providerStatus: { notIn: [...terminalDeliveryFailureProviderStatuses] } }]
  };
}

export function outboundPendingMessageWhere(orgId: string): Prisma.MessageWhereInput {
  return {
    ...outboundMessageWhere(orgId),
    deliveredAt: null,
    failedAt: null,
    OR: [{ providerStatus: null }, { providerStatus: { notIn: [...terminalDeliveryFailureProviderStatuses] } }]
  };
}

export function outboundFailedMessageWhere(orgId: string): Prisma.MessageWhereInput {
  return {
    ...outboundMessageWhere(orgId),
    OR: [{ failedAt: { not: null } }, { providerStatus: { in: [...terminalDeliveryFailureProviderStatuses] } }]
  };
}
