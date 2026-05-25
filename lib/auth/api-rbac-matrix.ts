import { MembershipRole } from "@prisma/client";

export const apiRbacMutatingMethods = Object.freeze(["POST", "PATCH", "PUT", "DELETE"] as const);

export type ApiRbacMutatingMethod = (typeof apiRbacMutatingMethods)[number];

export type ApiRouteRoleGateEntry = Readonly<{
  auth: "role";
  method: ApiRbacMutatingMethod;
  path: string;
  requiredRole: MembershipRole;
  scope: string;
}>;

export type ApiRouteSignedWebhookEntry = Readonly<{
  auth: "signed-webhook";
  method: ApiRbacMutatingMethod;
  path: string;
  provider: "twilio";
  scope: string;
}>;

export type ApiRouteRbacMatrixEntry = ApiRouteRoleGateEntry | ApiRouteSignedWebhookEntry;

const apiRouteRbacMatrixItems = [
  {
    auth: "role",
    method: "POST",
    path: "app/api/ai/campaign-copy/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "generate local fake-AI campaign copy"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/ai/conversation-summary/route.ts",
    requiredRole: MembershipRole.MEMBER,
    scope: "generate local fake-AI conversation summary"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/ai/lead-qualification/route.ts",
    requiredRole: MembershipRole.MEMBER,
    scope: "generate local fake-AI lead qualification"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/ai/reply-suggestion/route.ts",
    requiredRole: MembershipRole.MEMBER,
    scope: "generate local fake-AI reply suggestion"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/billing/usage/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "record local usage metadata"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/campaigns/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "create local draft campaign"
  },
  {
    auth: "role",
    method: "PATCH",
    path: "app/api/campaigns/[campaignId]/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "update local draft campaign"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/campaigns/[campaignId]/preflight/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "run local campaign preflight"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/campaigns/[campaignId]/schedule/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "schedule local queue job"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/campaigns/[campaignId]/cancel/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "cancel local queued campaign"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/contacts/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "create or update local contact"
  },
  {
    auth: "role",
    method: "PATCH",
    path: "app/api/contacts/[contactId]/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "update local contact"
  },
  {
    auth: "role",
    method: "DELETE",
    path: "app/api/contacts/[contactId]/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "soft archive local contact"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/contacts/[contactId]/merge/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "merge local duplicate contacts"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/contacts/imports/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "import local contacts"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/demo/inbound/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "create local demo inbound message"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/demo/live-test-sms/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "attempt explicitly gated live test SMS"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/inbox/conversations/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "create local inbound conversation"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/inbox/conversations/[conversationId]/assign/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "assign local conversation"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/inbox/conversations/[conversationId]/messages/route.ts",
    requiredRole: MembershipRole.MEMBER,
    scope: "append local conversation message"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/inbox/conversations/[conversationId]/notes/route.ts",
    requiredRole: MembershipRole.MEMBER,
    scope: "append local internal note"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/inbox/conversations/[conversationId]/resolve/route.ts",
    requiredRole: MembershipRole.MEMBER,
    scope: "resolve or reopen local conversation"
  },
  {
    auth: "role",
    method: "PATCH",
    path: "app/api/settings/compliance/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "update local compliance profile"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/settings/numbers/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "upsert local provider number metadata"
  },
  {
    auth: "role",
    method: "PATCH",
    path: "app/api/settings/provider/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "upsert local provider credential metadata"
  },
  {
    auth: "role",
    method: "DELETE",
    path: "app/api/settings/provider/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "delete local provider credential metadata"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/templates/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "create local message template"
  },
  {
    auth: "role",
    method: "PATCH",
    path: "app/api/templates/[templateId]/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "update local message template"
  },
  {
    auth: "signed-webhook",
    method: "POST",
    path: "app/api/webhooks/twilio/inbound/route.ts",
    provider: "twilio",
    scope: "ingest signed Twilio inbound webhook"
  },
  {
    auth: "signed-webhook",
    method: "POST",
    path: "app/api/webhooks/twilio/status/route.ts",
    provider: "twilio",
    scope: "ingest signed Twilio status webhook"
  }
] satisfies ApiRouteRbacMatrixEntry[];

export const apiRouteRbacMatrix = Object.freeze(
  apiRouteRbacMatrixItems.map((entry) => Object.freeze({ ...entry }))
);

function isRoleGateEntry(entry: ApiRouteRbacMatrixEntry): entry is ApiRouteRoleGateEntry {
  return entry.auth === "role";
}

function isSignedWebhookEntry(entry: ApiRouteRbacMatrixEntry): entry is ApiRouteSignedWebhookEntry {
  return entry.auth === "signed-webhook";
}

export const apiRouteRbacRoleMatrix = Object.freeze(apiRouteRbacMatrix.filter(isRoleGateEntry));

export const apiRouteRbacSignedWebhookExceptions = Object.freeze(
  apiRouteRbacMatrix.filter(isSignedWebhookEntry)
);
