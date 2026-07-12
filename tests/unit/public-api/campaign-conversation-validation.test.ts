import {
  CampaignStatus,
  ConsentStatus,
  ConversationStatus,
  QueueJobStatus
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  serializePublicCampaign,
  serializePublicCampaignQueueJob
} from "@/lib/public-api/campaigns";
import {
  publicConversationMessagesCursorResource,
  serializePublicConversation
} from "@/lib/public-api/conversations";
import { createPublicApiOpenApiDocument } from "@/lib/public-api/openapi";
import {
  publicCampaignCreateSchema,
  publicCampaignScheduleSchema,
  publicCampaignUpdateSchema,
  publicConversationReplySchema
} from "@/lib/validation/public-api-campaigns-conversations";

const createdAt = new Date("2026-07-10T01:02:03.000Z");
const updatedAt = new Date("2026-07-10T02:03:04.000Z");

describe("public campaign and conversation boundaries", () => {
  it("strictly validates bounded campaign and reply mutations", () => {
    expect(
      publicCampaignCreateSchema.parse({ name: "Launch", body: "Hello", contactIds: [] })
    ).toEqual({ name: "Launch", body: "Hello", contactIds: [] });
    expect(() => publicCampaignCreateSchema.parse({ name: "Launch", body: "Hi", orgId: "other" })).toThrow();
    expect(() => publicCampaignCreateSchema.parse({
      name: "Launch",
      body: "Hi",
      contactIds: ["contact_1", "contact_1"]
    })).toThrow("unique");
    expect(() => publicCampaignUpdateSchema.parse({})).toThrow();
    expect(() => publicCampaignScheduleSchema.parse({ scheduledAt: "tomorrow" })).toThrow();
    expect(() => publicConversationReplySchema.parse({ body: "", provider: "twilio" })).toThrow();
    expect(publicConversationReplySchema.parse({ body: " Local reply " })).toEqual({
      body: "Local reply"
    });
  });

  it("serializes campaign state without tenant, queue payload, or idempotency fields", () => {
    const campaign = serializePublicCampaign({
      id: "campaign_demo",
      templateId: "template_demo",
      name: "Launch",
      status: CampaignStatus.SCHEDULED,
      body: "Hello",
      scheduledAt: createdAt,
      createdAt,
      updatedAt,
      template: { id: "template_demo", name: "Greeting" },
      _count: { recipients: 1, messages: 2 }
    });
    const internalQueueJob = {
      id: "job_demo",
      status: QueueJobStatus.QUEUED,
      runAt: createdAt,
      generation: 2,
      createdAt,
      updatedAt,
      payload: { secret: true },
      idempotencyKey: "must-not-leak"
    };
    const queueJob = serializePublicCampaignQueueJob(internalQueueJob);

    expect(campaign).toMatchObject({
      id: "campaign_demo",
      recipientCount: 1,
      messageCount: 2,
      scheduledAt: createdAt.toISOString()
    });
    expect(campaign).not.toHaveProperty("orgId");
    expect(campaign).not.toHaveProperty("recipients");
    const schemas = (createPublicApiOpenApiDocument().components as {
      schemas: Record<string, unknown>;
    }).schemas;
    const campaignSchema = schemas.Campaign as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(Object.keys(campaign).sort()).toEqual([...campaignSchema.required].sort());
    expect(Object.keys(campaign).sort()).toEqual(Object.keys(campaignSchema.properties).sort());
    expect(queueJob).toMatchObject({ id: "job_demo", generation: 2 });
    expect(queueJob).not.toHaveProperty("payload");
    expect(queueJob).not.toHaveProperty("idempotencyKey");
  });

  it("allowlists conversation contact and assignee metadata", () => {
    const internalConversation = {
      id: "conversation_demo",
      contactId: "contact_demo",
      assignedToUserId: "user_demo",
      status: ConversationStatus.OPEN,
      lastMessageAt: updatedAt,
      resolvedAt: null,
      sentiment: "positive",
      category: "sales",
      createdAt,
      updatedAt,
      contact: {
        id: "contact_demo",
        phone: "+15555550100",
        displayName: "Ada",
        consentStatus: ConsentStatus.OPTED_IN,
        archivedAt: null
      },
      assignedTo: { id: "user_demo", displayName: "Agent" },
      _count: { messages: 3 },
      orgId: "must-not-leak",
      email: "must-not-leak@example.com"
    };
    const conversation = serializePublicConversation(internalConversation);

    expect(conversation).toMatchObject({
      id: "conversation_demo",
      contact: { id: "contact_demo", consentStatus: ConsentStatus.OPTED_IN },
      assignedTo: { id: "user_demo", displayName: "Agent" },
      messageCount: 3
    });
    expect(conversation).not.toHaveProperty("orgId");
    expect(conversation).not.toHaveProperty("email");
  });

  it("binds thread cursors to one conversation with a valid opaque resource name", () => {
    const first = publicConversationMessagesCursorResource("conversation_a");
    const second = publicConversationMessagesCursorResource("conversation_b");

    expect(first).toMatch(/^conversation-messages-[a-f0-9]{24}$/);
    expect(first).not.toBe(second);
    expect(first.length).toBeLessThanOrEqual(64);
  });
});
