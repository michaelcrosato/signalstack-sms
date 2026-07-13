import type { Prisma } from "@prisma/client";
import { MessageApplicationStatus } from "@prisma/client";

export function outboundMessageWhere(orgId: string): Prisma.MessageWhereInput {
  return {
    orgId,
    direction: "OUTBOUND"
  };
}

export function outboundDeliveredMessageWhere(orgId: string): Prisma.MessageWhereInput {
  return {
    ...outboundMessageWhere(orgId),
    applicationStatus: MessageApplicationStatus.DELIVERED
  };
}

export function outboundPendingMessageWhere(orgId: string): Prisma.MessageWhereInput {
  return {
    ...outboundMessageWhere(orgId),
    applicationStatus: {
      in: [
        MessageApplicationStatus.ACCEPTED,
        MessageApplicationStatus.SCHEDULED,
        MessageApplicationStatus.PROCESSING,
        MessageApplicationStatus.SENT
      ]
    }
  };
}

export function outboundFailedMessageWhere(orgId: string): Prisma.MessageWhereInput {
  return {
    ...outboundMessageWhere(orgId),
    applicationStatus: MessageApplicationStatus.FAILED
  };
}

export function outboundAmbiguousMessageWhere(orgId: string): Prisma.MessageWhereInput {
  return {
    ...outboundMessageWhere(orgId),
    applicationStatus: MessageApplicationStatus.AMBIGUOUS
  };
}
