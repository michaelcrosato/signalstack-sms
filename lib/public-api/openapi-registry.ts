import type { ApiScope } from "@/lib/public-api/scopes";

export const PUBLIC_API_HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options"
] as const;

export type PublicApiHttpMethod = (typeof PUBLIC_API_HTTP_METHODS)[number];

export type PublicApiOperationRegistration = Readonly<{
  method: PublicApiHttpMethod;
  path: `/api/v1/${string}`;
  operationId: string;
  summary: string;
  tag: string;
  scopes: readonly ApiScope[];
  responseSchema: string;
  successStatus?: 200 | 201 | 202;
  requestSchema?: string;
  paginated?: boolean;
  public?: boolean;
}>;

function operation(
  registration: PublicApiOperationRegistration
): PublicApiOperationRegistration {
  return Object.freeze(registration);
}

/**
 * The executable registry for the frozen M3 surface. The OpenAPI drift gate compares this
 * inventory bidirectionally with App Router handlers, so a route cannot silently ship without
 * documentation and a documented operation cannot survive without an implementation.
 */
export const PUBLIC_API_OPERATIONS = Object.freeze([
  operation({
    method: "get",
    path: "/api/v1/openapi.json",
    operationId: "getOpenApiV1",
    summary: "Download the OpenAPI 3.1 document",
    tag: "Metadata",
    scopes: [],
    responseSchema: "OpenApiDocument",
    public: true
  }),
  operation({
    method: "get",
    path: "/api/v1/organization",
    operationId: "getOrganization",
    summary: "Read the current organization",
    tag: "Organization",
    scopes: ["organization:read"],
    responseSchema: "Organization"
  }),
  operation({
    method: "get",
    path: "/api/v1/contacts",
    operationId: "listContacts",
    summary: "List contacts",
    tag: "Contacts",
    scopes: ["contacts:read"],
    responseSchema: "ContactCollection",
    paginated: true
  }),
  operation({
    method: "post",
    path: "/api/v1/contacts",
    operationId: "createContact",
    summary: "Create a contact",
    tag: "Contacts",
    scopes: ["contacts:write"],
    requestSchema: "ContactCreate",
    responseSchema: "Contact",
    successStatus: 201
  }),
  operation({
    method: "get",
    path: "/api/v1/contacts/{contactId}",
    operationId: "getContact",
    summary: "Read a contact",
    tag: "Contacts",
    scopes: ["contacts:read"],
    responseSchema: "Contact"
  }),
  operation({
    method: "patch",
    path: "/api/v1/contacts/{contactId}",
    operationId: "updateContact",
    summary: "Update or restore a contact",
    tag: "Contacts",
    scopes: ["contacts:write"],
    requestSchema: "ContactUpdate",
    responseSchema: "Contact"
  }),
  operation({
    method: "delete",
    path: "/api/v1/contacts/{contactId}",
    operationId: "archiveContact",
    summary: "Soft-archive a contact",
    tag: "Contacts",
    scopes: ["contacts:write"],
    responseSchema: "Contact"
  }),
  operation({
    method: "get",
    path: "/api/v1/tags",
    operationId: "listTags",
    summary: "List contact tags",
    tag: "Tags",
    scopes: ["tags:read"],
    responseSchema: "TagCollection",
    paginated: true
  }),
  operation({
    method: "post",
    path: "/api/v1/tags",
    operationId: "createTag",
    summary: "Create a contact tag",
    tag: "Tags",
    scopes: ["tags:write"],
    requestSchema: "TagCreate",
    responseSchema: "Tag",
    successStatus: 201
  }),
  operation({
    method: "get",
    path: "/api/v1/tags/{tagId}",
    operationId: "getTag",
    summary: "Read a contact tag",
    tag: "Tags",
    scopes: ["tags:read"],
    responseSchema: "Tag"
  }),
  operation({
    method: "patch",
    path: "/api/v1/tags/{tagId}",
    operationId: "updateTag",
    summary: "Update a contact tag",
    tag: "Tags",
    scopes: ["tags:write"],
    requestSchema: "TagUpdate",
    responseSchema: "Tag"
  }),
  operation({
    method: "delete",
    path: "/api/v1/tags/{tagId}",
    operationId: "deleteTag",
    summary: "Delete an unreferenced contact tag",
    tag: "Tags",
    scopes: ["tags:write"],
    responseSchema: "Tag"
  }),
  operation({
    method: "get",
    path: "/api/v1/lists",
    operationId: "listContactLists",
    summary: "List contact lists",
    tag: "Lists",
    scopes: ["lists:read"],
    responseSchema: "ContactListCollection",
    paginated: true
  }),
  operation({
    method: "post",
    path: "/api/v1/lists",
    operationId: "createContactList",
    summary: "Create a contact list",
    tag: "Lists",
    scopes: ["lists:write"],
    requestSchema: "ContactListCreate",
    responseSchema: "ContactList",
    successStatus: 201
  }),
  operation({
    method: "get",
    path: "/api/v1/lists/{listId}",
    operationId: "getContactList",
    summary: "Read a contact list",
    tag: "Lists",
    scopes: ["lists:read"],
    responseSchema: "ContactList"
  }),
  operation({
    method: "patch",
    path: "/api/v1/lists/{listId}",
    operationId: "updateContactList",
    summary: "Update a contact list",
    tag: "Lists",
    scopes: ["lists:write"],
    requestSchema: "ContactListUpdate",
    responseSchema: "ContactList"
  }),
  operation({
    method: "delete",
    path: "/api/v1/lists/{listId}",
    operationId: "deleteContactList",
    summary: "Delete a contact list and its memberships",
    tag: "Lists",
    scopes: ["lists:write"],
    responseSchema: "ContactList"
  }),
  operation({
    method: "get",
    path: "/api/v1/lists/{listId}/contacts",
    operationId: "listContactListMembers",
    summary: "List contacts in a contact list",
    tag: "Lists",
    scopes: ["lists:read", "contacts:read"],
    responseSchema: "ContactCollection",
    paginated: true
  }),
  operation({
    method: "post",
    path: "/api/v1/lists/{listId}/contacts",
    operationId: "addContactListMembers",
    summary: "Add contacts to a contact list",
    tag: "Lists",
    scopes: ["lists:write"],
    requestSchema: "ContactListMembershipWrite",
    responseSchema: "ContactListMembershipAddResult"
  }),
  operation({
    method: "delete",
    path: "/api/v1/lists/{listId}/contacts/{contactId}",
    operationId: "removeContactListMember",
    summary: "Remove a contact from a contact list",
    tag: "Lists",
    scopes: ["lists:write"],
    responseSchema: "ContactListMembershipRemoveResult"
  }),
  operation({
    method: "get",
    path: "/api/v1/segments",
    operationId: "listSegments",
    summary: "List saved segments",
    tag: "Segments",
    scopes: ["segments:read"],
    responseSchema: "SegmentCollection",
    paginated: true
  }),
  operation({
    method: "post",
    path: "/api/v1/segments",
    operationId: "createSegment",
    summary: "Create a saved segment",
    tag: "Segments",
    scopes: ["segments:write"],
    requestSchema: "SegmentCreate",
    responseSchema: "Segment",
    successStatus: 201
  }),
  operation({
    method: "get",
    path: "/api/v1/segments/{segmentId}",
    operationId: "getSegment",
    summary: "Read a saved segment",
    tag: "Segments",
    scopes: ["segments:read"],
    responseSchema: "Segment"
  }),
  operation({
    method: "patch",
    path: "/api/v1/segments/{segmentId}",
    operationId: "updateSegment",
    summary: "Update a saved segment",
    tag: "Segments",
    scopes: ["segments:write"],
    requestSchema: "SegmentUpdate",
    responseSchema: "Segment"
  }),
  operation({
    method: "delete",
    path: "/api/v1/segments/{segmentId}",
    operationId: "deleteSegment",
    summary: "Delete a saved segment",
    tag: "Segments",
    scopes: ["segments:write"],
    responseSchema: "Segment"
  }),
  operation({
    method: "get",
    path: "/api/v1/segments/{segmentId}/contacts",
    operationId: "evaluateSegment",
    summary: "Evaluate a saved segment",
    tag: "Segments",
    scopes: ["segments:read", "contacts:read"],
    responseSchema: "ContactCollection",
    paginated: true
  }),
  operation({
    method: "get",
    path: "/api/v1/templates",
    operationId: "listTemplates",
    summary: "List message templates",
    tag: "Templates",
    scopes: ["templates:read"],
    responseSchema: "TemplateCollection",
    paginated: true
  }),
  operation({
    method: "post",
    path: "/api/v1/templates",
    operationId: "createTemplate",
    summary: "Create a message template",
    tag: "Templates",
    scopes: ["templates:write"],
    requestSchema: "TemplateCreate",
    responseSchema: "Template",
    successStatus: 201
  }),
  operation({
    method: "get",
    path: "/api/v1/templates/{templateId}",
    operationId: "getTemplate",
    summary: "Read a message template",
    tag: "Templates",
    scopes: ["templates:read"],
    responseSchema: "Template"
  }),
  operation({
    method: "patch",
    path: "/api/v1/templates/{templateId}",
    operationId: "updateTemplate",
    summary: "Update a message template",
    tag: "Templates",
    scopes: ["templates:write"],
    requestSchema: "TemplateUpdate",
    responseSchema: "Template"
  }),
  operation({
    method: "delete",
    path: "/api/v1/templates/{templateId}",
    operationId: "deleteTemplate",
    summary: "Delete an unreferenced message template",
    tag: "Templates",
    scopes: ["templates:write"],
    responseSchema: "Template"
  }),
  operation({
    method: "get",
    path: "/api/v1/messages",
    operationId: "listMessages",
    summary: "List messages",
    tag: "Messages",
    scopes: ["messages:read"],
    responseSchema: "MessageCollection",
    paginated: true
  }),
  operation({
    method: "post",
    path: "/api/v1/messages",
    operationId: "submitMessage",
    summary: "Submit a dummy message",
    tag: "Messages",
    scopes: ["messages:send"],
    requestSchema: "MessageCreate",
    responseSchema: "MessageSubmission",
    successStatus: 202
  }),
  operation({
    method: "get",
    path: "/api/v1/messages/{messageId}",
    operationId: "getMessage",
    summary: "Read a message",
    tag: "Messages",
    scopes: ["messages:read"],
    responseSchema: "MessageSubmission"
  }),
  operation({
    method: "get",
    path: "/api/v1/messages/{messageId}/status",
    operationId: "getMessageStatus",
    summary: "Read normalized message delivery status",
    tag: "Messages",
    scopes: ["deliveries:read"],
    responseSchema: "MessageStatusResult"
  }),
  operation({
    method: "get",
    path: "/api/v1/campaigns",
    operationId: "listCampaigns",
    summary: "List campaigns",
    tag: "Campaigns",
    scopes: ["campaigns:read"],
    responseSchema: "CampaignCollection",
    paginated: true
  }),
  operation({
    method: "post",
    path: "/api/v1/campaigns",
    operationId: "createCampaign",
    summary: "Create a draft campaign",
    tag: "Campaigns",
    scopes: ["campaigns:write"],
    requestSchema: "CampaignCreate",
    responseSchema: "CampaignResult",
    successStatus: 201
  }),
  operation({
    method: "get",
    path: "/api/v1/campaigns/{campaignId}",
    operationId: "getCampaign",
    summary: "Read a campaign",
    tag: "Campaigns",
    scopes: ["campaigns:read"],
    responseSchema: "CampaignResult"
  }),
  operation({
    method: "patch",
    path: "/api/v1/campaigns/{campaignId}",
    operationId: "updateCampaign",
    summary: "Update a draft campaign",
    tag: "Campaigns",
    scopes: ["campaigns:write"],
    requestSchema: "CampaignUpdate",
    responseSchema: "CampaignResult"
  }),
  operation({
    method: "post",
    path: "/api/v1/campaigns/{campaignId}/schedule",
    operationId: "scheduleCampaign",
    summary: "Schedule a campaign after final gates",
    tag: "Campaigns",
    scopes: ["campaigns:send"],
    requestSchema: "CampaignSchedule",
    responseSchema: "CampaignScheduleResult",
    successStatus: 201
  }),
  operation({
    method: "post",
    path: "/api/v1/campaigns/{campaignId}/cancel",
    operationId: "cancelCampaign",
    summary: "Cancel scheduled campaign work",
    tag: "Campaigns",
    scopes: ["campaigns:send"],
    responseSchema: "CampaignResult"
  }),
  operation({
    method: "get",
    path: "/api/v1/conversations",
    operationId: "listConversations",
    summary: "List conversations",
    tag: "Conversations",
    scopes: ["conversations:read"],
    responseSchema: "ConversationCollection",
    paginated: true
  }),
  operation({
    method: "get",
    path: "/api/v1/conversations/{conversationId}",
    operationId: "getConversation",
    summary: "Read a conversation",
    tag: "Conversations",
    scopes: ["conversations:read"],
    responseSchema: "ConversationResult"
  }),
  operation({
    method: "get",
    path: "/api/v1/conversations/{conversationId}/messages",
    operationId: "listConversationMessages",
    summary: "List messages in a conversation",
    tag: "Conversations",
    scopes: ["conversations:read", "messages:read"],
    responseSchema: "MessageCollection",
    paginated: true
  }),
  operation({
    method: "post",
    path: "/api/v1/conversations/{conversationId}/messages",
    operationId: "replyToConversation",
    summary: "Submit a dummy conversation reply",
    tag: "Conversations",
    scopes: ["conversations:write", "messages:send"],
    requestSchema: "ConversationReply",
    responseSchema: "MessageSubmission",
    successStatus: 202
  }),
  operation({
    method: "get",
    path: "/api/v1/api-keys/current",
    operationId: "getCurrentApiKey",
    summary: "Read the calling API key metadata",
    tag: "API keys",
    scopes: ["credentials:read"],
    responseSchema: "CurrentApiCredential"
  }),
  operation({
    method: "delete",
    path: "/api/v1/api-keys/current",
    operationId: "revokeCurrentApiKey",
    summary: "Revoke the calling API key",
    tag: "API keys",
    scopes: ["credentials:write"],
    responseSchema: "CurrentApiCredential"
  }),
  operation({
    method: "post",
    path: "/api/v1/api-keys/current/rotate",
    operationId: "rotateCurrentApiKey",
    summary: "Rotate the calling API key and reveal it once",
    tag: "API keys",
    scopes: ["credentials:write"],
    responseSchema: "RevealedApiCredential"
  }),
  operation({
    method: "get",
    path: "/api/v1/webhook-event-types",
    operationId: "listWebhookEventTypes",
    summary: "List customer webhook event types",
    tag: "Customer webhooks",
    scopes: ["webhooks:read"],
    responseSchema: "WebhookEventTypeCollection"
  }),
  operation({
    method: "get",
    path: "/api/v1/webhook-endpoints",
    operationId: "listWebhookEndpoints",
    summary: "List customer webhook endpoints",
    tag: "Customer webhooks",
    scopes: ["webhooks:read"],
    responseSchema: "WebhookEndpointCollection",
    paginated: true
  }),
  operation({
    method: "post",
    path: "/api/v1/webhook-endpoints",
    operationId: "createWebhookEndpoint",
    summary: "Create an endpoint and reveal its secret once",
    tag: "Customer webhooks",
    scopes: ["webhooks:write"],
    requestSchema: "WebhookEndpointCreate",
    responseSchema: "RevealedWebhookEndpoint",
    successStatus: 201
  }),
  operation({
    method: "get",
    path: "/api/v1/webhook-endpoints/{endpointId}",
    operationId: "getWebhookEndpoint",
    summary: "Read a customer webhook endpoint",
    tag: "Customer webhooks",
    scopes: ["webhooks:read"],
    responseSchema: "WebhookEndpointResult"
  }),
  operation({
    method: "patch",
    path: "/api/v1/webhook-endpoints/{endpointId}",
    operationId: "updateWebhookEndpoint",
    summary: "Update, enable, or disable an endpoint",
    tag: "Customer webhooks",
    scopes: ["webhooks:write"],
    requestSchema: "WebhookEndpointUpdate",
    responseSchema: "WebhookEndpointResult"
  }),
  operation({
    method: "delete",
    path: "/api/v1/webhook-endpoints/{endpointId}",
    operationId: "disableWebhookEndpoint",
    summary: "Disable an endpoint without deleting history",
    tag: "Customer webhooks",
    scopes: ["webhooks:write"],
    responseSchema: "WebhookEndpointResult"
  }),
  operation({
    method: "post",
    path: "/api/v1/webhook-endpoints/{endpointId}/rotate-secret",
    operationId: "rotateWebhookEndpointSecret",
    summary: "Rotate and reveal an endpoint secret once",
    tag: "Customer webhooks",
    scopes: ["webhooks:write"],
    responseSchema: "RevealedWebhookEndpoint"
  }),
  operation({
    method: "get",
    path: "/api/v1/webhook-endpoints/{endpointId}/deliveries",
    operationId: "listWebhookDeliveries",
    summary: "List webhook delivery and attempt state",
    tag: "Customer webhooks",
    scopes: ["deliveries:read"],
    responseSchema: "WebhookDeliveryCollection",
    paginated: true
  }),
  operation({
    method: "post",
    path: "/api/v1/webhook-deliveries/{deliveryId}/replay",
    operationId: "replayWebhookDelivery",
    summary: "Replay a terminal failed webhook delivery",
    tag: "Customer webhooks",
    scopes: ["webhooks:replay"],
    responseSchema: "WebhookDeliveryReplay",
    successStatus: 201
  })
] satisfies readonly PublicApiOperationRegistration[]);

export function publicApiOperationKey(
  operationRegistration: Pick<PublicApiOperationRegistration, "method" | "path">
): string {
  return `${operationRegistration.method.toUpperCase()} ${operationRegistration.path}`;
}
