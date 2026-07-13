import {
  MessageApplicationStatus,
  MessageAttemptStatus,
  MessageTransport
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  serializePublicDeliveryStatus,
  serializePublicMessage
} from "@/lib/public-api/dummy-messages";

function row(
  applicationStatus: MessageApplicationStatus,
  attemptStatus: MessageAttemptStatus | null,
  transport: MessageTransport = MessageTransport.TWILIO
) {
  return {
    id: "message_1",
    contactId: "contact_1",
    conversationId: "conversation_1",
    campaignId: null,
    direction: "OUTBOUND",
    body: "hello",
    applicationStatus,
    transport,
    mediaUrls: [],
    attemptCount: attemptStatus ? 1 : 0,
    providerMessageId: null,
    providerStatus: null,
    providerErrorCode: null,
    deliveredAt:
      applicationStatus === MessageApplicationStatus.DELIVERED
        ? new Date("2026-07-12T12:05:00.000Z")
        : null,
    failedAt:
      applicationStatus === MessageApplicationStatus.FAILED
        ? new Date("2026-07-12T12:05:00.000Z")
        : null,
    createdAt: new Date("2026-07-12T12:00:00.000Z"),
    updatedAt: new Date("2026-07-12T12:01:00.000Z"),
    attempts: attemptStatus
      ? [{
          status: attemptStatus,
          attemptNumber: 1,
          errorCode: null,
          disposition: null,
          completedAt: null
        }]
      : [],
    contact: { phone: "+15555550100", displayName: "Ada" },
    conversation: { status: "OPEN" }
  } as never;
}

describe("public message lifecycle serialization", () => {
  it.each(Object.values(MessageApplicationStatus))(
    "exposes application state %s independently from provider state",
    (applicationStatus) => {
      const serialized = serializePublicDeliveryStatus(
        row(applicationStatus, MessageAttemptStatus.QUEUED)
      );
      expect(serialized.applicationStatus).toBe(applicationStatus);
      expect(serialized.status).toBe(applicationStatus.toLowerCase());
      expect(serialized.providerStatus).toBeNull();
    }
  );

  it("makes ambiguity first-class and reviewable", () => {
    expect(
      serializePublicDeliveryStatus(
        row(MessageApplicationStatus.AMBIGUOUS, MessageAttemptStatus.AMBIGUOUS)
      )
    ).toMatchObject({
      status: "ambiguous",
      applicationStatus: "AMBIGUOUS",
      latestAttemptStatus: "AMBIGUOUS",
      requiresReview: true
    });
  });

  it("derives compatibility mode from explicit transport", () => {
    expect(
      serializePublicMessage(
        row(MessageApplicationStatus.SENT, MessageAttemptStatus.SUCCEEDED, MessageTransport.DUMMY)
      )
    ).toMatchObject({ transport: "dummy", mode: "dummy", applicationStatus: "SENT" });
    expect(
      serializePublicMessage(
        row(MessageApplicationStatus.SENT, MessageAttemptStatus.SUCCEEDED, MessageTransport.TWILIO)
      )
    ).toMatchObject({ transport: "twilio", mode: "provider", applicationStatus: "SENT" });
  });
});
