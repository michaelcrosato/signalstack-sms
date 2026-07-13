import { CUSTOMER_WEBHOOK_EVENT_TYPES } from "@/lib/integrations/customer-webhooks/catalog";
import { PUBLIC_API_ERROR_CODES } from "@/lib/public-api/errors";
import {
  PUBLIC_API_OPERATIONS,
  type PublicApiOperationRegistration
} from "@/lib/public-api/openapi-registry";
import { API_SCOPES } from "@/lib/public-api/scopes";

type OpenApiObject = Record<string, unknown>;

const identifierSchema = {
  type: "string",
  minLength: 1,
  maxLength: 191,
  pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$",
  example: "resource_01J2A3B4C5D6E7F8G9H0"
};
const dateTimeSchema = { type: "string", format: "date-time", example: "2026-07-12T18:30:00.000Z" };
const nullableDateTimeSchema = {
  type: ["string", "null"],
  format: "date-time",
  example: null
};
const nullableStringSchema = { type: ["string", "null"] };
const eventTypeSchema = {
  type: "string",
  enum: [...CUSTOMER_WEBHOOK_EVENT_TYPES],
  example: "message.delivered"
};

const contactSchema: OpenApiObject = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "phone",
    "email",
    "firstName",
    "lastName",
    "displayName",
    "consentStatus",
    "consentEvidence",
    "archivedAt",
    "tags",
    "lists",
    "createdAt",
    "updatedAt"
  ],
  properties: {
    id: identifierSchema,
    phone: { type: "string", minLength: 7, maxLength: 32, example: "+15555550123" },
    email: { type: ["string", "null"], format: "email", example: "ada@example.test" },
    firstName: { type: ["string", "null"], example: "Ada" },
    lastName: { type: ["string", "null"], example: "Lovelace" },
    displayName: { type: ["string", "null"], example: "Ada Lovelace" },
    consentStatus: {
      type: "string",
      enum: ["UNKNOWN", "OPTED_IN", "OPTED_OUT", "PENDING_DOUBLE_OPT_IN"],
      example: "OPTED_IN"
    },
    optInSource: nullableStringSchema,
    optInAt: nullableDateTimeSchema,
    optedOutAt: nullableDateTimeSchema,
    consentEvidence: {
      type: "object",
      additionalProperties: false,
      required: ["capturedAt", "method", "disclosure"],
      properties: {
        capturedAt: nullableDateTimeSchema,
        method: nullableStringSchema,
        disclosure: nullableStringSchema
      }
    },
    source: nullableStringSchema,
    notes: nullableStringSchema,
    leadScore: { type: ["integer", "null"], minimum: 0, maximum: 100 },
    leadStage: nullableStringSchema,
    leadQualifiedAt: nullableDateTimeSchema,
    archivedAt: nullableDateTimeSchema,
    tags: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "name", "color"],
        properties: {
          id: identifierSchema,
          name: { type: "string", example: "customers" },
          color: { type: ["string", "null"], pattern: "^#[0-9A-Fa-f]{6}$" }
        }
      }
    },
    lists: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "name"],
        properties: { id: identifierSchema, name: { type: "string", example: "Launch list" } }
      }
    },
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema
  }
};

const resourceSchemas: Record<string, OpenApiObject> = {
  OpenApiDocument: {
    type: "object",
    description: "The raw OpenAPI 3.1 document; this metadata route is not wrapped in an API envelope.",
    required: ["openapi", "info", "paths"],
    additionalProperties: true
  },
  Organization: {
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "slug", "timezone", "createdAt", "updatedAt"],
    properties: {
      id: identifierSchema,
      name: { type: "string", example: "Example Company" },
      slug: { type: "string", example: "example-company" },
      timezone: { type: "string", example: "America/Vancouver" },
      createdAt: dateTimeSchema,
      updatedAt: dateTimeSchema
    }
  },
  Contact: contactSchema,
  ContactCollection: collectionSchema("contacts", "Contact"),
  ContactCreate: {
    type: "object",
    additionalProperties: false,
    required: ["phone"],
    properties: {
      phone: { type: "string", minLength: 7, maxLength: 32, example: "+15555550123" },
      email: { type: ["string", "null"], format: "email", maxLength: 254, example: "ada@example.test" },
      firstName: { type: ["string", "null"], minLength: 1, maxLength: 120, example: "Ada" },
      lastName: { type: ["string", "null"], minLength: 1, maxLength: 120, example: "Lovelace" },
      displayName: { type: ["string", "null"], minLength: 1, maxLength: 120, example: "Ada Lovelace" },
      consentStatus: {
        type: "string",
        enum: ["UNKNOWN", "OPTED_IN", "OPTED_OUT", "PENDING_DOUBLE_OPT_IN"]
      },
      optInSource: { type: ["string", "null"], minLength: 1, maxLength: 120 },
      consentCapturedAt: nullableDateTimeSchema,
      consentMethod: { type: ["string", "null"], minLength: 1, maxLength: 120 },
      consentDisclosure: { type: ["string", "null"], minLength: 1, maxLength: 500 },
      source: { type: ["string", "null"], minLength: 1, maxLength: 120 },
      notes: { type: ["string", "null"], minLength: 1, maxLength: 500 },
      tagNames: { type: "array", maxItems: 100, items: { type: "string", maxLength: 120 } },
      listNames: { type: "array", maxItems: 100, items: { type: "string", maxLength: 120 } }
    },
    example: {
      phone: "+15555550123",
      displayName: "Ada Lovelace",
      consentStatus: "OPTED_IN",
      optInSource: "checkout",
      consentCapturedAt: "2026-07-12T18:30:00.000Z",
      consentMethod: "web_form",
      consentDisclosure: "Agreed to receive account notifications.",
      tagNames: ["customers"],
      listNames: ["Launch list"]
    }
  },
  ContactUpdate: {
    type: "object",
    additionalProperties: false,
    minProperties: 1,
    properties: {
      phone: { type: "string", minLength: 7, maxLength: 32 },
      email: { type: ["string", "null"], format: "email", maxLength: 254 },
      firstName: { type: ["string", "null"], minLength: 1, maxLength: 120 },
      lastName: { type: ["string", "null"], minLength: 1, maxLength: 120 },
      displayName: { type: ["string", "null"], minLength: 1, maxLength: 120 },
      consentStatus: {
        type: "string",
        enum: ["UNKNOWN", "OPTED_IN", "OPTED_OUT", "PENDING_DOUBLE_OPT_IN"]
      },
      optInSource: { type: ["string", "null"], minLength: 1, maxLength: 120 },
      consentCapturedAt: nullableDateTimeSchema,
      consentMethod: { type: ["string", "null"], minLength: 1, maxLength: 120 },
      consentDisclosure: { type: ["string", "null"], minLength: 1, maxLength: 500 },
      source: { type: ["string", "null"], minLength: 1, maxLength: 120 },
      notes: { type: ["string", "null"], minLength: 1, maxLength: 500 },
      archived: { type: "boolean" },
      tagNames: { type: "array", maxItems: 100, items: { type: "string", maxLength: 120 } },
      listNames: { type: "array", maxItems: 100, items: { type: "string", maxLength: 120 } }
    },
    example: { displayName: "Ada Byron", tagNames: ["customers", "priority"] }
  },
  Tag: {
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "color", "contactCount", "createdAt", "updatedAt"],
    properties: {
      id: identifierSchema,
      name: { type: "string", example: "priority" },
      color: { type: ["string", "null"], pattern: "^#[0-9A-Fa-f]{6}$", example: "#7C3AED" },
      contactCount: { type: "integer", minimum: 0, example: 24 },
      createdAt: dateTimeSchema,
      updatedAt: dateTimeSchema
    }
  },
  TagCollection: collectionSchema("tags", "Tag"),
  TagCreate: {
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      color: { type: ["string", "null"], pattern: "^#[0-9A-Fa-f]{6}$" }
    },
    example: { name: "priority", color: "#7C3AED" }
  },
  TagUpdate: {
    type: "object",
    additionalProperties: false,
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      color: { type: ["string", "null"], pattern: "^#[0-9A-Fa-f]{6}$" }
    },
    example: { name: "high-priority" }
  },
  ContactList: {
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "description", "memberCount", "createdAt", "updatedAt"],
    properties: {
      id: identifierSchema,
      name: { type: "string", example: "Launch list" },
      description: { type: ["string", "null"], example: "Contacts for the product launch." },
      memberCount: { type: "integer", minimum: 0, example: 120 },
      createdAt: dateTimeSchema,
      updatedAt: dateTimeSchema
    }
  },
  ContactListCollection: collectionSchema("lists", "ContactList"),
  ContactListCreate: {
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      description: { type: ["string", "null"], minLength: 1, maxLength: 500 }
    },
    example: { name: "Launch list", description: "Contacts for the product launch." }
  },
  ContactListUpdate: {
    type: "object",
    additionalProperties: false,
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      description: { type: ["string", "null"], minLength: 1, maxLength: 500 }
    },
    example: { description: "Customers eligible for the July launch." }
  },
  ContactListMembershipWrite: {
    type: "object",
    additionalProperties: false,
    required: ["contactIds"],
    properties: {
      contactIds: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        uniqueItems: true,
        items: identifierSchema
      }
    },
    example: { contactIds: ["contact_01J2A3B4C5D6E7F8G9H0"] }
  },
  ContactListMembershipAddResult: {
    type: "object",
    additionalProperties: false,
    required: ["membership"],
    properties: {
      membership: {
        type: "object",
        additionalProperties: false,
        required: ["listId", "contactIds", "addedCount"],
        properties: {
          listId: identifierSchema,
          contactIds: { type: "array", items: identifierSchema },
          addedCount: { type: "integer", minimum: 0 }
        }
      }
    }
  },
  ContactListMembershipRemoveResult: {
    type: "object",
    additionalProperties: false,
    required: ["membership"],
    properties: {
      membership: {
        type: "object",
        additionalProperties: false,
        required: ["listId", "contactId", "removed"],
        properties: {
          listId: identifierSchema,
          contactId: identifierSchema,
          removed: { type: "boolean", const: true }
        }
      }
    }
  },
  SegmentDefinition: {
    type: "object",
    additionalProperties: false,
    required: ["tagNames", "consentStatuses"],
    properties: {
      tagNames: { type: "array", maxItems: 100, items: { type: "string", maxLength: 120 } },
      consentStatuses: {
        type: "array",
        maxItems: 10,
        items: {
          type: "string",
          enum: ["UNKNOWN", "OPTED_IN", "OPTED_OUT", "PENDING_DOUBLE_OPT_IN"]
        }
      },
      minLeadScore: { type: "integer", minimum: 0, maximum: 100 },
      maxLeadScore: { type: "integer", minimum: 0, maximum: 100 }
    },
    example: { tagNames: ["customers"], consentStatuses: ["OPTED_IN"], minLeadScore: 60 }
  },
  Segment: {
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "description", "definition", "createdAt", "updatedAt"],
    properties: {
      id: identifierSchema,
      name: { type: "string", example: "Engaged customers" },
      description: { type: ["string", "null"] },
      definition: componentRef("SegmentDefinition"),
      createdAt: dateTimeSchema,
      updatedAt: dateTimeSchema
    }
  },
  SegmentCollection: collectionSchema("segments", "Segment"),
  SegmentCreate: {
    type: "object",
    additionalProperties: false,
    required: ["name", "definition"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      description: { type: ["string", "null"], minLength: 1, maxLength: 500 },
      definition: componentRef("SegmentDefinition")
    },
    example: {
      name: "Engaged customers",
      description: "Opted-in customers with a lead score of at least 60.",
      definition: { tagNames: ["customers"], consentStatuses: ["OPTED_IN"], minLeadScore: 60 }
    }
  },
  SegmentUpdate: {
    type: "object",
    additionalProperties: false,
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      description: { type: ["string", "null"], minLength: 1, maxLength: 500 },
      definition: componentRef("SegmentDefinition")
    },
    example: { definition: { tagNames: ["priority"], consentStatuses: ["OPTED_IN"] } }
  },
  Template: {
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "body", "variables", "campaignCount", "createdAt", "updatedAt"],
    properties: {
      id: identifierSchema,
      name: { type: "string", example: "Order ready" },
      body: { type: "string", example: "Hi {{firstName}}, your order is ready." },
      variables: { type: "array", items: { type: "string" }, example: ["firstName"] },
      campaignCount: { type: "integer", minimum: 0 },
      createdAt: dateTimeSchema,
      updatedAt: dateTimeSchema
    }
  },
  TemplateCollection: collectionSchema("templates", "Template"),
  TemplateCreate: {
    type: "object",
    additionalProperties: false,
    required: ["name", "body"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      body: { type: "string", minLength: 1, maxLength: 1_600 },
      variables: { type: "array", maxItems: 100, items: { type: "string", maxLength: 80 } }
    },
    example: { name: "Order ready", body: "Hi {{firstName}}, your order is ready.", variables: ["firstName"] }
  },
  TemplateUpdate: {
    type: "object",
    additionalProperties: false,
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      body: { type: "string", minLength: 1, maxLength: 1_600 },
      variables: { type: "array", maxItems: 100, items: { type: "string", maxLength: 80 } }
    },
    example: { body: "Hi {{firstName}}, your order can now be collected." }
  },
  Message: messageSchema(),
  MessageCollection: collectionSchema("messages", "Message"),
  MessageCreate: {
    type: "object",
    additionalProperties: false,
    required: ["contactId", "body"],
    properties: {
      contactId: identifierSchema,
      conversationId: identifierSchema,
      body: { type: "string", minLength: 1, maxLength: 1_600 },
      mediaUrls: {
        type: "array",
        maxItems: 10,
        uniqueItems: true,
        items: { type: "string", format: "uri", pattern: "^https://", maxLength: 2048 }
      }
    },
    example: {
      contactId: "contact_01J2A3B4C5D6E7F8G9H0",
      body: "Your order is ready for pickup."
    }
  },
  MessageSubmission: {
    type: "object",
    additionalProperties: false,
    required: ["message"],
    properties: { message: componentRef("Message") }
  },
  MessageStatus: {
    type: "object",
    additionalProperties: false,
    required: [
      "messageId",
      "status",
      "applicationStatus",
      "transport",
      "attemptCount",
      "latestAttemptStatus",
      "latestAttemptNumber",
      "requiresReview",
      "providerStatus",
      "providerErrorCode",
      "deliveredAt",
      "failedAt",
      "mode"
    ],
    properties: {
      messageId: identifierSchema,
      status: { type: "string", example: "sent" },
      applicationStatus: {
        type: "string",
        enum: ["ACCEPTED", "SCHEDULED", "PROCESSING", "SENT", "DELIVERED", "FAILED", "CANCELLED", "AMBIGUOUS"]
      },
      transport: { type: "string", enum: ["dummy", "twilio"] },
      attemptCount: { type: "integer", minimum: 0, maximum: 3 },
      latestAttemptStatus: {
        type: ["string", "null"],
        enum: ["QUEUED", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED", "AMBIGUOUS", "RESOLVED_NOT_SENT", null]
      },
      latestAttemptNumber: { type: ["integer", "null"], minimum: 1, maximum: 3 },
      requiresReview: { type: "boolean" },
      providerStatus: nullableStringSchema,
      providerErrorCode: nullableStringSchema,
      deliveredAt: nullableDateTimeSchema,
      failedAt: nullableDateTimeSchema,
      mode: { type: "string", enum: ["dummy", "provider"], example: "dummy" }
    }
  },
  MessageStatusResult: {
    type: "object",
    additionalProperties: false,
    required: ["deliveryStatus"],
    properties: { deliveryStatus: componentRef("MessageStatus") }
  },
  Campaign: campaignSchema(),
  CampaignCollection: collectionSchema("campaigns", "Campaign"),
  CampaignResult: {
    type: "object",
    additionalProperties: false,
    required: ["campaign"],
    properties: { campaign: componentRef("Campaign") }
  },
  CampaignCreate: campaignWriteSchema(true),
  CampaignUpdate: campaignWriteSchema(false),
  CampaignSchedule: {
    type: "object",
    additionalProperties: false,
    required: ["scheduledAt"],
    properties: { scheduledAt: dateTimeSchema },
    example: { scheduledAt: "2026-07-13T18:30:00.000Z" }
  },
  CampaignScheduleResult: {
    type: "object",
    additionalProperties: false,
    required: ["campaign", "queueJob"],
    properties: {
      campaign: componentRef("Campaign"),
      queueJob: {
        type: "object",
        required: ["id", "status", "runAt", "generation", "createdAt", "updatedAt"],
        properties: {
          id: identifierSchema,
          status: { type: "string", example: "QUEUED" },
          runAt: dateTimeSchema,
          generation: { type: "integer", minimum: 1 },
          createdAt: dateTimeSchema,
          updatedAt: dateTimeSchema
        }
      }
    }
  },
  Conversation: conversationSchema(),
  ConversationCollection: collectionSchema("conversations", "Conversation"),
  ConversationResult: {
    type: "object",
    additionalProperties: false,
    required: ["conversation"],
    properties: { conversation: componentRef("Conversation") }
  },
  ConversationReply: {
    type: "object",
    additionalProperties: false,
    required: ["body"],
    properties: {
      body: { type: "string", minLength: 1, maxLength: 1_600 },
      mediaUrls: {
        type: "array",
        maxItems: 10,
        uniqueItems: true,
        items: { type: "string", format: "uri", pattern: "^https://" }
      }
    },
    example: { body: "Thanks — we will have that ready for you." }
  },
  ApiCredential: apiCredentialSchema(),
  CurrentApiCredential: {
    type: "object",
    additionalProperties: false,
    required: ["credential"],
    properties: { credential: componentRef("ApiCredential") }
  },
  RevealedApiCredential: {
    type: "object",
    additionalProperties: false,
    required: ["credential", "token"],
    properties: {
      credential: componentRef("ApiCredential"),
      token: {
        type: "string",
        writeOnly: true,
        pattern: "^ss_api_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$",
        example: "ss_api_AbCdEfGhIjKl_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      }
    }
  },
  WebhookEventTypeCollection: {
    type: "object",
    additionalProperties: false,
    required: ["eventTypes"],
    properties: { eventTypes: { type: "array", items: eventTypeSchema } }
  },
  WebhookEndpoint: webhookEndpointSchema(),
  WebhookEndpointCollection: collectionSchema("endpoints", "WebhookEndpoint"),
  WebhookEndpointResult: {
    type: "object",
    additionalProperties: false,
    required: ["endpoint"],
    properties: { endpoint: componentRef("WebhookEndpoint") }
  },
  WebhookEndpointCreate: {
    type: "object",
    additionalProperties: false,
    required: ["name", "url", "eventTypes"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      url: { type: "string", format: "uri", maxLength: 2_048 },
      eventTypes: { type: "array", minItems: 1, uniqueItems: true, items: eventTypeSchema }
    },
    example: {
      name: "Order service",
      url: "https://webhooks.acme.com/signalstack",
      eventTypes: ["contact.created", "message.delivered", "message.failed"]
    }
  },
  WebhookEndpointUpdate: {
    type: "object",
    additionalProperties: false,
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      eventTypes: { type: "array", minItems: 1, uniqueItems: true, items: eventTypeSchema },
      enabled: { type: "boolean" }
    },
    example: { eventTypes: ["message.delivered", "message.failed"], enabled: true }
  },
  RevealedWebhookEndpoint: {
    type: "object",
    additionalProperties: false,
    required: ["endpoint", "signingSecret"],
    properties: {
      endpoint: componentRef("WebhookEndpoint"),
      signingSecret: {
        type: "string",
        writeOnly: true,
        pattern: "^whsec_[A-Za-z0-9_-]{43}$",
        example: "whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      }
    }
  },
  WebhookDelivery: webhookDeliverySchema(),
  WebhookDeliveryAttempt: webhookDeliveryAttemptSchema(),
  WebhookDeliveryCollection: collectionSchema("deliveries", "WebhookDelivery"),
  WebhookDeliveryReplay: {
    type: "object",
    additionalProperties: false,
    required: ["delivery"],
    properties: { delivery: componentRef("WebhookDelivery") }
  },
  CustomerWebhookEvent: {
    type: "object",
    additionalProperties: false,
    required: ["apiVersion", "id", "type", "occurredAt", "data"],
    properties: {
      apiVersion: { type: "string", const: "2026-07-10", example: "2026-07-10" },
      id: identifierSchema,
      type: eventTypeSchema,
      occurredAt: dateTimeSchema,
      data: { type: "object", additionalProperties: true }
    },
    example: {
      apiVersion: "2026-07-10",
      id: "event_01J2A3B4C5D6E7F8G9H0",
      type: "message.delivered",
      occurredAt: "2026-07-12T18:30:00.000Z",
      data: { messageId: "message_01J2A3B4C5D6E7F8G9H0", status: "delivered" }
    }
  },
  ResponseMeta: {
    type: "object",
    additionalProperties: false,
    required: ["requestId"],
    properties: { requestId: { type: "string", format: "uuid" } }
  },
  PaginationMeta: {
    type: "object",
    additionalProperties: false,
    required: ["requestId", "nextCursor", "hasMore"],
    properties: {
      requestId: { type: "string", format: "uuid" },
      nextCursor: { type: ["string", "null"], maxLength: 1_024 },
      hasMore: { type: "boolean" }
    }
  },
  ErrorEnvelope: {
    type: "object",
    additionalProperties: false,
    required: ["ok", "error", "meta"],
    properties: {
      ok: { type: "boolean", const: false },
      error: {
        type: "object",
        additionalProperties: false,
        required: ["code", "message"],
        properties: {
          code: { type: "string", enum: [...PUBLIC_API_ERROR_CODES], example: "VALIDATION_ERROR" },
          message: { type: "string", example: "The request failed validation." },
          details: { type: ["array", "object", "string", "number", "boolean", "null"] }
        }
      },
      meta: componentRef("ResponseMeta")
    }
  }
};

export type PublicApiOpenApiDocument = Readonly<{
  openapi: "3.1.0";
  info: OpenApiObject;
  paths: Record<string, OpenApiObject>;
  components: OpenApiObject;
  webhooks: OpenApiObject;
  [key: string]: unknown;
}>;

export function createPublicApiOpenApiDocument(): PublicApiOpenApiDocument {
  const paths: Record<string, OpenApiObject> = {};
  for (const registration of PUBLIC_API_OPERATIONS) {
    const pathItem = paths[registration.path] ?? {};
    pathItem[registration.method] = createOperation(registration);
    paths[registration.path] = pathItem;
  }

  return Object.freeze({
    openapi: "3.1.0",
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    info: {
      title: "SignalStack SMS Public API",
      version: "1.0.0",
      description:
        "Tenant-scoped API for contacts, audiences, dummy-safe messaging, campaigns, conversations, API-key self-management, and signed customer webhooks. Live SMS remains disabled until later standalone milestones."
    },
    servers: [{ url: "/", description: "Current SignalStack installation" }],
    tags: [...new Set(PUBLIC_API_OPERATIONS.map((registration) => registration.tag))].map((name) => ({ name })),
    paths,
    webhooks: createCustomerWebhookDefinition(),
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "ss_api_<prefix>_<secret>",
          description: "A tenant API key returned only at creation or rotation."
        },
        CustomerWebhookSignature: {
          type: "apiKey",
          in: "header",
          name: "X-SignalStack-Signature",
          description: "v1 HMAC-SHA-256 signature over the exact timestamp and raw request bytes."
        }
      },
      parameters: {
        RequestId: {
          name: "X-Request-Id",
          in: "header",
          required: false,
          description: "One valid UUID may be retained for correlation.",
          schema: { type: "string", format: "uuid" }
        },
        IdempotencyKey: {
          name: "Idempotency-Key",
          in: "header",
          required: true,
          description: "Credential-scoped mutation key retained for 24 hours.",
          schema: { type: "string", minLength: 8, maxLength: 128, pattern: "^[A-Za-z0-9._:-]{8,128}$" },
          example: "order-43891-create"
        },
        Limit: {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 100, default: 50 }
        },
        Cursor: {
          name: "cursor",
          in: "query",
          required: false,
          description: "Opaque, tenant- and resource-bound HMAC cursor.",
          schema: { type: "string", minLength: 1, maxLength: 1_024 }
        }
      },
      headers: responseHeaderComponents(),
      responses: errorResponseComponents(),
      schemas: resourceSchemas
    },
    "x-signalstack-scope-catalog": [...API_SCOPES],
    "x-signalstack-error-codes": [...PUBLIC_API_ERROR_CODES]
  });
}

export function serializePublicApiOpenApiDocument(): string {
  return `${JSON.stringify(createPublicApiOpenApiDocument(), null, 2)}\n`;
}

function createOperation(registration: PublicApiOperationRegistration): OpenApiObject {
  const isMutation = registration.method !== "get";
  const parameters: OpenApiObject[] = [{ $ref: "#/components/parameters/RequestId" }];
  for (const parameterName of pathParameterNames(registration.path)) {
    parameters.push({
      name: parameterName,
      in: "path",
      required: true,
      schema: identifierSchema
    });
  }
  if (registration.paginated) {
    parameters.push(
      { $ref: "#/components/parameters/Limit" },
      { $ref: "#/components/parameters/Cursor" }
    );
  }
  if (isMutation) {
    parameters.push({ $ref: "#/components/parameters/IdempotencyKey" });
  }

  const operationObject: OpenApiObject = {
    operationId: registration.operationId,
    summary: registration.summary,
    tags: [registration.tag],
    parameters,
    responses: createResponses(registration)
  };
  if (registration.public) {
    operationObject.security = [];
    operationObject.description =
      "The one unauthenticated /api/v1 exception. It returns the raw OpenAPI document rather than a success envelope.";
  } else {
    operationObject.security = [{ BearerAuth: [] }];
    operationObject["x-required-scopes"] = [...registration.scopes];
  }
  if (registration.requestSchema) {
    operationObject.requestBody = {
      required: true,
      content: {
        "application/json": { schema: componentRef(registration.requestSchema) }
      }
    };
  }
  return operationObject;
}

function createResponses(registration: PublicApiOperationRegistration): OpenApiObject {
  const successStatus = String(registration.successStatus ?? 200);
  const isMutation = registration.method !== "get";
  const headers = operationResponseHeaders(!registration.public, isMutation);
  const successSchema = registration.public
    ? componentRef(registration.responseSchema)
    : successEnvelopeSchema(registration.responseSchema, Boolean(registration.paginated));
  const responses: OpenApiObject = {
    [successStatus]: {
      description:
        registration.successStatus === 202
          ? "Accepted into the explicit dummy/local message lifecycle."
          : "Successful operation.",
      headers,
      content: { "application/json": { schema: successSchema } }
    }
  };
  if (registration.public) return responses;

  for (const status of Object.keys(ERROR_STATUS_DESCRIPTIONS)) {
    responses[status] = { $ref: `#/components/responses/Error${status}` };
  }
  return responses;
}

function successEnvelopeSchema(dataSchema: string, paginated: boolean): OpenApiObject {
  return {
    type: "object",
    additionalProperties: false,
    required: ["ok", "data", "meta"],
    properties: {
      ok: { type: "boolean", const: true },
      data: componentRef(dataSchema),
      meta: componentRef(paginated ? "PaginationMeta" : "ResponseMeta")
    }
  };
}

function operationResponseHeaders(authenticated: boolean, mutation: boolean): OpenApiObject {
  const headers: OpenApiObject = {
    "X-Request-Id": { $ref: "#/components/headers/XRequestId" },
    "Cache-Control": { $ref: "#/components/headers/CacheControl" }
  };
  if (authenticated) {
    headers["RateLimit-Limit"] = { $ref: "#/components/headers/RateLimitLimit" };
    headers["RateLimit-Remaining"] = { $ref: "#/components/headers/RateLimitRemaining" };
    headers["RateLimit-Reset"] = { $ref: "#/components/headers/RateLimitReset" };
  }
  if (mutation) {
    headers["Idempotency-Replayed"] = { $ref: "#/components/headers/IdempotencyReplayed" };
  }
  return headers;
}

function responseHeaderComponents(): OpenApiObject {
  return {
    XRequestId: {
      description: "The request correlation UUID, matching meta.requestId for enveloped responses.",
      schema: { type: "string", format: "uuid" }
    },
    CacheControl: {
      description: "Public API responses are not cacheable.",
      schema: { type: "string", const: "no-store" }
    },
    RateLimitLimit: {
      description: "The calling key's configured requests per minute.",
      schema: { type: "integer", minimum: 1, maximum: 10_000 }
    },
    RateLimitRemaining: {
      description: "Non-negative requests remaining in the current database window.",
      schema: { type: "integer", minimum: 0 }
    },
    RateLimitReset: {
      description: "Current database window reset time as Unix seconds.",
      schema: { type: "integer", format: "int64" }
    },
    RetryAfter: {
      description: "Positive seconds until an exhausted key may retry.",
      schema: { type: "integer", minimum: 1 }
    },
    Allow: {
      description: "Comma-separated methods implemented by the requested route.",
      schema: { type: "string", minLength: 3 }
    },
    IdempotencyReplayed: {
      description: "True only when the stored response was replayed.",
      schema: { type: "string", enum: ["true"] }
    }
  };
}

function errorResponseComponents(): OpenApiObject {
  return Object.fromEntries(
    Object.entries(ERROR_STATUS_DESCRIPTIONS).map(([status, description]) => {
      const headers = operationResponseHeaders(true, false);
      if (status === "429") {
        headers["Retry-After"] = { $ref: "#/components/headers/RetryAfter" };
      }
      if (status === "405") {
        headers.Allow = { $ref: "#/components/headers/Allow" };
      }
      return [
        `Error${status}`,
        {
          description,
          headers,
          content: { "application/json": { schema: componentRef("ErrorEnvelope") } }
        }
      ];
    })
  );
}

function createCustomerWebhookDefinition(): OpenApiObject {
  return {
    customerLifecycleEvent: {
      post: {
        operationId: "receiveCustomerLifecycleEvent",
        summary: "Receive a signed SignalStack lifecycle event",
        description:
          "SignalStack signs the exact raw body with the endpoint's one-time whsec_ secret. Receivers must verify before parsing and deduplicate by event id. Any 2xx acknowledges delivery.",
        tags: ["Customer webhooks"],
        security: [{ CustomerWebhookSignature: [] }],
        parameters: [
          webhookHeader("X-SignalStack-Event-Id", "Durable event deduplication identifier."),
          webhookHeader("X-SignalStack-Event-Type", "Exact event catalog member."),
          webhookHeader("X-SignalStack-Delivery-Id", "Delivery attempt stream identifier."),
          webhookHeader("X-SignalStack-Timestamp", "Unix seconds used in the signature input."),
          webhookHeader("X-SignalStack-Secret-Version", "Pinned positive integer signing-secret version."),
          webhookHeader(
            "X-SignalStack-Signature",
            "v1=<lowercase hex HMAC-SHA-256(timestamp + '.' + exact raw body)>"
          )
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: componentRef("CustomerWebhookEvent") } }
        },
        responses: {
          "200": { description: "Any 2xx acknowledges the event." },
          "410": { description: "Disables the endpoint immediately." },
          "429": { description: "Retries with bounded backoff and Retry-After handling." },
          "500": { description: "Retries with bounded backoff." }
        },
        "x-signature-input":
          "signalstack/customer-webhook-signature/v1\\0<timestamp>.<exact raw request body>"
      }
    }
  };
}

function webhookHeader(name: string, description: string): OpenApiObject {
  return {
    name,
    in: "header",
    required: true,
    description,
    schema: { type: "string", minLength: 1 }
  };
}

function collectionSchema(property: string, itemSchema: string): OpenApiObject {
  return {
    type: "object",
    additionalProperties: false,
    required: [property],
    properties: {
      [property]: { type: "array", items: componentRef(itemSchema) }
    }
  };
}

function messageSchema(): OpenApiObject {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "contactId",
      "conversationId",
      "campaignId",
      "direction",
      "body",
      "status",
      "applicationStatus",
      "transport",
      "attemptCount",
      "latestAttemptStatus",
      "latestAttemptNumber",
      "requiresReview",
      "providerStatus",
      "providerErrorCode",
      "providerMessageId",
      "mode",
      "mediaUrls",
      "contact",
      "conversation",
      "deliveredAt",
      "failedAt",
      "createdAt",
      "updatedAt"
    ],
    properties: {
      id: identifierSchema,
      contactId: { ...identifierSchema, type: ["string", "null"] },
      conversationId: { ...identifierSchema, type: ["string", "null"] },
      campaignId: { ...identifierSchema, type: ["string", "null"] },
      direction: { type: "string", enum: ["INBOUND", "OUTBOUND"], example: "OUTBOUND" },
      body: { type: "string", example: "Your order is ready for pickup." },
      status: { type: "string", example: "sent" },
      applicationStatus: {
        type: "string",
        enum: ["ACCEPTED", "SCHEDULED", "PROCESSING", "SENT", "DELIVERED", "FAILED", "CANCELLED", "AMBIGUOUS"]
      },
      transport: { type: "string", enum: ["dummy", "twilio"] },
      attemptCount: { type: "integer", minimum: 0, maximum: 3 },
      latestAttemptStatus: {
        type: ["string", "null"],
        enum: ["QUEUED", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED", "AMBIGUOUS", "RESOLVED_NOT_SENT", null]
      },
      latestAttemptNumber: { type: ["integer", "null"], minimum: 1, maximum: 3 },
      requiresReview: { type: "boolean" },
      providerStatus: nullableStringSchema,
      providerErrorCode: nullableStringSchema,
      providerMessageId: nullableStringSchema,
      mode: { type: "string", enum: ["dummy", "provider"], example: "dummy" },
      mediaUrls: {
        type: "array",
        maxItems: 10,
        uniqueItems: true,
        items: { type: "string", format: "uri", pattern: "^https://" }
      },
      contact: {
        type: ["object", "null"],
        properties: { phone: { type: "string" }, displayName: nullableStringSchema }
      },
      conversation: {
        type: ["object", "null"],
        properties: { status: { type: "string" } }
      },
      deliveredAt: nullableDateTimeSchema,
      failedAt: nullableDateTimeSchema,
      createdAt: dateTimeSchema,
      updatedAt: dateTimeSchema
    }
  };
}

function campaignSchema(): OpenApiObject {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "name",
      "body",
      "status",
      "template",
      "recipientCount",
      "messageCount",
      "scheduledAt",
      "createdAt",
      "updatedAt"
    ],
    properties: {
      id: identifierSchema,
      name: { type: "string", example: "July launch" },
      body: { type: "string", example: "Our July launch is live." },
      status: { type: "string", example: "DRAFT" },
      template: {
        type: ["object", "null"],
        properties: { id: identifierSchema, name: { type: "string" } }
      },
      recipientCount: { type: "integer", minimum: 0 },
      messageCount: { type: "integer", minimum: 0 },
      scheduledAt: nullableDateTimeSchema,
      createdAt: dateTimeSchema,
      updatedAt: dateTimeSchema
    }
  };
}

function campaignWriteSchema(create: boolean): OpenApiObject {
  return {
    type: "object",
    additionalProperties: false,
    ...(create ? { required: ["name", "body"] } : { minProperties: 1 }),
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      body: { type: "string", minLength: 1, maxLength: 1_600 },
      templateId: identifierSchema,
      contactIds: { type: "array", maxItems: 10_000, uniqueItems: true, items: identifierSchema }
    },
    example: {
      name: "July launch",
      body: "Our July launch is live.",
      contactIds: ["contact_01J2A3B4C5D6E7F8G9H0"]
    }
  };
}

function conversationSchema(): OpenApiObject {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "status",
      "contact",
      "assignedTo",
      "messageCount",
      "lastMessageAt",
      "resolvedAt",
      "sentiment",
      "category",
      "createdAt",
      "updatedAt"
    ],
    properties: {
      id: identifierSchema,
      status: { type: "string", example: "OPEN" },
      contact: {
        type: ["object", "null"],
        properties: {
          id: identifierSchema,
          phone: { type: "string" },
          displayName: nullableStringSchema,
          consentStatus: { type: "string" },
          archivedAt: nullableDateTimeSchema
        }
      },
      assignedTo: {
        type: ["object", "null"],
        properties: { id: identifierSchema, displayName: nullableStringSchema }
      },
      messageCount: { type: "integer", minimum: 0 },
      lastMessageAt: nullableDateTimeSchema,
      resolvedAt: nullableDateTimeSchema,
      sentiment: nullableStringSchema,
      category: nullableStringSchema,
      createdAt: dateTimeSchema,
      updatedAt: dateTimeSchema
    }
  };
}

function apiCredentialSchema(): OpenApiObject {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "name",
      "prefix",
      "scopes",
      "rateLimitPerMinute",
      "expiresAt",
      "lastUsedAt",
      "revokedAt",
      "createdAt",
      "updatedAt"
    ],
    properties: {
      id: identifierSchema,
      name: { type: "string", example: "Order service" },
      prefix: {
        type: "string",
        minLength: 19,
        maxLength: 19,
        pattern: "^ss_api_[A-Za-z0-9_-]{12}$",
        example: "ss_api_AbCdEfGhIjKl"
      },
      scopes: { type: "array", uniqueItems: true, items: { type: "string", enum: [...API_SCOPES] } },
      rateLimitPerMinute: { type: "integer", minimum: 1, maximum: 10_000, example: 120 },
      expiresAt: nullableDateTimeSchema,
      lastUsedAt: nullableDateTimeSchema,
      revokedAt: nullableDateTimeSchema,
      createdAt: dateTimeSchema,
      updatedAt: dateTimeSchema
    }
  };
}

function webhookEndpointSchema(): OpenApiObject {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "name",
      "url",
      "status",
      "eventTypes",
      "signingSecret",
      "consecutiveFailures",
      "lastFailureAt",
      "lastSuccessAt",
      "disabledAt",
      "createdAt",
      "updatedAt"
    ],
    properties: {
      id: identifierSchema,
      name: { type: "string", example: "Order service" },
      url: { type: "string", format: "uri", example: "https://webhooks.acme.com/signalstack" },
      status: { type: "string", enum: ["ACTIVE", "DISABLED"] },
      eventTypes: { type: "array", uniqueItems: true, items: eventTypeSchema },
      signingSecret: {
        type: "object",
        required: ["version", "fingerprint"],
        properties: {
          version: { type: "integer", minimum: 1 },
          fingerprint: { type: "string", example: "sha256:12ab34cd" }
        }
      },
      consecutiveFailures: { type: "integer", minimum: 0 },
      lastFailureAt: nullableDateTimeSchema,
      lastSuccessAt: nullableDateTimeSchema,
      disabledAt: nullableDateTimeSchema,
      createdAt: dateTimeSchema,
      updatedAt: dateTimeSchema
    }
  };
}

function webhookDeliverySchema(): OpenApiObject {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "endpointId",
      "eventId",
      "eventType",
      "status",
      "generation",
      "replayOfDeliveryId",
      "attemptCount",
      "maxAttempts",
      "nextAttemptAt",
      "deliveredAt",
      "failedAt",
      "lastStatusCode",
      "lastErrorCode",
      "attempts",
      "createdAt",
      "updatedAt"
    ],
    properties: {
      id: identifierSchema,
      endpointId: identifierSchema,
      eventId: identifierSchema,
      eventType: eventTypeSchema,
      status: { type: "string", enum: ["PENDING", "PROCESSING", "DELIVERED", "FAILED", "CANCELED"] },
      generation: { type: "integer", minimum: 1 },
      replayOfDeliveryId: { ...identifierSchema, type: ["string", "null"] },
      attemptCount: { type: "integer", minimum: 0 },
      maxAttempts: { type: "integer", minimum: 1, maximum: 12 },
      nextAttemptAt: dateTimeSchema,
      deliveredAt: nullableDateTimeSchema,
      failedAt: nullableDateTimeSchema,
      lastStatusCode: { type: ["integer", "null"], minimum: 100, maximum: 599 },
      lastErrorCode: nullableStringSchema,
      attempts: { type: "array", maxItems: 12, items: componentRef("WebhookDeliveryAttempt") },
      createdAt: dateTimeSchema,
      updatedAt: dateTimeSchema
    },
    example: {
      id: "delivery_01J2A3B4C5D6E7F8G9H0",
      endpointId: "endpoint_01J2A3B4C5D6E7F8G9H0",
      eventId: "event_01J2A3B4C5D6E7F8G9H0",
      eventType: "message.delivered",
      status: "DELIVERED",
      generation: 1,
      replayOfDeliveryId: null,
      attemptCount: 1,
      maxAttempts: 8,
      nextAttemptAt: "2026-07-12T18:30:00.000Z",
      deliveredAt: "2026-07-12T18:30:01.000Z",
      failedAt: null,
      lastStatusCode: 204,
      lastErrorCode: null,
      attempts: [
        {
          id: "attempt_01J2A3B4C5D6E7F8G9H0",
          generation: 1,
          attemptNumber: 1,
          requestTimestamp: "2026-07-12T18:30:00.000Z",
          statusCode: 204,
          outcome: "delivered",
          errorCode: null,
          startedAt: "2026-07-12T18:30:00.000Z",
          finishedAt: "2026-07-12T18:30:01.000Z",
          createdAt: "2026-07-12T18:30:01.000Z"
        }
      ],
      createdAt: "2026-07-12T18:30:00.000Z",
      updatedAt: "2026-07-12T18:30:01.000Z"
    }
  };
}

function webhookDeliveryAttemptSchema(): OpenApiObject {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "generation",
      "attemptNumber",
      "requestTimestamp",
      "statusCode",
      "outcome",
      "errorCode",
      "startedAt",
      "finishedAt",
      "createdAt"
    ],
    properties: {
      id: identifierSchema,
      generation: { type: "integer", minimum: 1 },
      attemptNumber: { type: "integer", minimum: 1, maximum: 12 },
      requestTimestamp: dateTimeSchema,
      statusCode: { type: ["integer", "null"], minimum: 100, maximum: 599 },
      outcome: {
        type: "string",
        enum: ["started", "delivered", "retry", "failed", "disable", "ambiguous"]
      },
      errorCode: nullableStringSchema,
      startedAt: dateTimeSchema,
      finishedAt: nullableDateTimeSchema,
      createdAt: dateTimeSchema
    }
  };
}

function componentRef(name: string): OpenApiObject {
  return { $ref: `#/components/schemas/${name}` };
}

function pathParameterNames(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).filter((value): value is string => Boolean(value));
}

const ERROR_STATUS_DESCRIPTIONS = Object.freeze({
  "400": "Invalid request, JSON, cursor, or idempotency evidence.",
  "401": "Bearer credential missing or unusable.",
  "403": "The API key lacks an exact required scope.",
  "404": "The tenant-scoped resource was not found.",
  "405": "Method not allowed.",
  "409": "Resource or idempotency conflict.",
  "413": "Request payload exceeds the public API limit.",
  "415": "Only application/json is accepted for JSON bodies.",
  "422": "Validation failed or the operation is not allowed.",
  "429": "The PostgreSQL-authoritative API-key rate window is exhausted.",
  "500": "Sanitized internal error.",
  "502": "Sanitized upstream error.",
  "503": "Authentication, rate-limit, tenant, or storage boundary unavailable."
});
