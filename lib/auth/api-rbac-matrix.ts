import { MembershipRole } from "@prisma/client";
import type { ApiScope } from "@/lib/public-api/scopes";

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

export type ApiRoutePublicAuthEntry = Readonly<{
  auth: "public-auth";
  method: "POST";
  path:
    | `app/api/auth/${"setup" | "login" | "logout"}/route.ts`
    | "app/api/auth/password-resets/complete/route.ts"
    | "app/api/auth/team/invites/accept/route.ts";
  flow: "setup" | "login" | "logout" | "reset-complete" | "invite-accept";
  scope: string;
}>;

export type ApiRouteOperatorBoundaryEntry = Readonly<{
  auth: "operator-boundary";
  method: "POST";
  path: "app/api/auth/password-resets/route.ts";
  operatorCommand: "admin:reset-link";
  scope: string;
}>;

export type ApiRouteApiKeyEntry = Readonly<{
  auth: "api-key";
  method: ApiRbacMutatingMethod;
  path: `app/api/v1/${string}/route.ts`;
  requiredScopes: readonly ApiScope[];
  scope: string;
}>;

export type ApiRouteRbacMatrixEntry =
  | ApiRouteRoleGateEntry
  | ApiRouteSignedWebhookEntry
  | ApiRoutePublicAuthEntry
  | ApiRouteOperatorBoundaryEntry
  | ApiRouteApiKeyEntry;

const apiRouteRbacMatrixItems = [
  {
    auth: "public-auth",
    method: "POST",
    path: "app/api/auth/login/route.ts",
    flow: "login",
    scope: "authenticate a local credential and create a session"
  },
  {
    auth: "public-auth",
    method: "POST",
    path: "app/api/auth/logout/route.ts",
    flow: "logout",
    scope: "revoke a presented local session and clear session cookies"
  },
  {
    auth: "public-auth",
    method: "POST",
    path: "app/api/auth/password-resets/complete/route.ts",
    flow: "reset-complete",
    scope: "consume a one-time local password reset and revoke every session"
  },
  {
    auth: "public-auth",
    method: "POST",
    path: "app/api/auth/setup/route.ts",
    flow: "setup",
    scope: "perform first-owner bootstrap using the operator secret"
  },
  {
    auth: "public-auth",
    method: "POST",
    path: "app/api/auth/team/invites/accept/route.ts",
    flow: "invite-accept",
    scope: "accept one email-bound local invitation and establish or switch a session"
  },
  {
    auth: "operator-boundary",
    method: "POST",
    path: "app/api/auth/password-resets/route.ts",
    operatorCommand: "admin:reset-link",
    scope: "deny tenant reset issuance; user-global recovery is platform-operator-only"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/auth/sessions/revoke-all/route.ts",
    requiredRole: MembershipRole.MEMBER,
    scope: "revoke every opaque local session for the authenticated user"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/auth/organizations/route.ts",
    requiredRole: MembershipRole.OWNER,
    scope: "create a local organization from a current-owner trust boundary"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/auth/organizations/select/route.ts",
    requiredRole: MembershipRole.MEMBER,
    scope: "switch an opaque local session to another active organization membership"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/auth/team/invites/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "create an email-bound local team invitation"
  },
  {
    auth: "role",
    method: "DELETE",
    path: "app/api/auth/team/invites/[inviteId]/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "revoke a pending same-tenant team invitation"
  },
  {
    auth: "role",
    method: "PATCH",
    path: "app/api/auth/team/members/[userId]/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "change a same-tenant member role or suspension state"
  },
  {
    auth: "role",
    method: "DELETE",
    path: "app/api/auth/team/members/[userId]/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "revoke a same-tenant organization membership"
  },
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
    path: "app/api/inbox/conversations/[conversationId]/reply/route.ts",
    requiredRole: MembershipRole.MEMBER,
    scope: "send local outbound conversation reply"
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
    path: "app/api/settings/provider/accounts/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "verify and connect one encrypted provider account"
  },
  {
    auth: "role",
    method: "PATCH",
    path: "app/api/settings/provider/accounts/[accountId]/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "make one verified provider account the organization default"
  },
  {
    auth: "role",
    method: "DELETE",
    path: "app/api/settings/provider/accounts/[accountId]/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "revoke one provider account and its active local authority"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/settings/provider/accounts/[accountId]/rotate/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "verify and rotate one provider account credential"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/settings/provider/accounts/[accountId]/verify/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "reverify one provider account without sending"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/settings/provider/accounts/[accountId]/health/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "check one provider account through a bounded read-only provider call"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/settings/provider/accounts/[accountId]/discover/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "discover safe provider number and messaging-service candidates"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/settings/provider/accounts/[accountId]/import/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "import fresh verified provider resource candidates without provider mutation"
  },
  {
    auth: "role",
    method: "PATCH",
    path: "app/api/settings/provider/accounts/[accountId]/messaging-services/[serviceId]/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "default or disable one verified provider messaging service"
  },
  {
    auth: "role",
    method: "PATCH",
    path: "app/api/settings/numbers/[numberId]/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "default or disable one verified provider phone number"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/settings/api-keys/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "issue one tenant API credential and reveal its bearer secret once"
  },
  {
    auth: "role",
    method: "POST",
    path: "app/api/settings/api-keys/[credentialId]/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "rotate one tenant API credential without changing its authority"
  },
  {
    auth: "role",
    method: "DELETE",
    path: "app/api/settings/api-keys/[credentialId]/route.ts",
    requiredRole: MembershipRole.ADMIN,
    scope: "revoke one tenant API credential"
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
    method: "POST",
    path: "app/api/templates/preview/route.ts",
    requiredRole: MembershipRole.MEMBER,
    scope: "preview rendered message template"
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
  },
  {
    auth: "api-key",
    method: "POST",
    path: "app/api/v1/webhook-endpoints/route.ts",
    requiredScopes: ["webhooks:write"],
    scope: "create a signed customer webhook endpoint with an idempotent public write"
  },
  {
    auth: "api-key",
    method: "PATCH",
    path: "app/api/v1/webhook-endpoints/[endpointId]/route.ts",
    requiredScopes: ["webhooks:write"],
    scope: "update a same-tenant customer webhook endpoint"
  },
  {
    auth: "api-key",
    method: "DELETE",
    path: "app/api/v1/webhook-endpoints/[endpointId]/route.ts",
    requiredScopes: ["webhooks:write"],
    scope: "disable a same-tenant customer webhook endpoint"
  },
  {
    auth: "api-key",
    method: "POST",
    path: "app/api/v1/webhook-endpoints/[endpointId]/rotate-secret/route.ts",
    requiredScopes: ["webhooks:write"],
    scope: "rotate a customer webhook signing secret without rerouting queued deliveries"
  },
  {
    auth: "api-key",
    method: "POST",
    path: "app/api/v1/webhook-deliveries/[deliveryId]/replay/route.ts",
    requiredScopes: ["webhooks:replay"],
    scope: "replay one failed same-tenant customer webhook delivery"
  },
  {
    auth: "api-key",
    method: "POST",
    path: "app/api/v1/api-keys/current/rotate/route.ts",
    requiredScopes: ["credentials:write"],
    scope: "rotate the authenticated API credential without elevating its authority"
  },
  {
    auth: "api-key",
    method: "DELETE",
    path: "app/api/v1/api-keys/current/route.ts",
    requiredScopes: ["credentials:write"],
    scope: "revoke the authenticated API credential"
  },
  {
    auth: "api-key",
    method: "POST",
    path: "app/api/v1/contacts/route.ts",
    requiredScopes: ["contacts:write"],
    scope: "create a same-tenant contact through an idempotent public write"
  },
  {
    auth: "api-key",
    method: "PATCH",
    path: "app/api/v1/contacts/[contactId]/route.ts",
    requiredScopes: ["contacts:write"],
    scope: "update a same-tenant contact through an idempotent public write"
  },
  {
    auth: "api-key",
    method: "DELETE",
    path: "app/api/v1/contacts/[contactId]/route.ts",
    requiredScopes: ["contacts:write"],
    scope: "archive a same-tenant contact through an idempotent public write"
  },
  {
    auth: "api-key",
    method: "POST",
    path: "app/api/v1/messages/route.ts",
    requiredScopes: ["messages:send"],
    scope: "accept one consent-safe dummy message and its lifecycle event atomically"
  },
  {
    auth: "api-key",
    method: "POST",
    path: "app/api/v1/tags/route.ts",
    requiredScopes: ["tags:write"],
    scope: "create a same-tenant contact tag"
  },
  {
    auth: "api-key",
    method: "PATCH",
    path: "app/api/v1/tags/[tagId]/route.ts",
    requiredScopes: ["tags:write"],
    scope: "update a same-tenant contact tag"
  },
  {
    auth: "api-key",
    method: "DELETE",
    path: "app/api/v1/tags/[tagId]/route.ts",
    requiredScopes: ["tags:write"],
    scope: "delete a same-tenant contact tag"
  },
  {
    auth: "api-key",
    method: "POST",
    path: "app/api/v1/lists/route.ts",
    requiredScopes: ["lists:write"],
    scope: "create a same-tenant contact list"
  },
  {
    auth: "api-key",
    method: "PATCH",
    path: "app/api/v1/lists/[listId]/route.ts",
    requiredScopes: ["lists:write"],
    scope: "update a same-tenant contact list"
  },
  {
    auth: "api-key",
    method: "DELETE",
    path: "app/api/v1/lists/[listId]/route.ts",
    requiredScopes: ["lists:write"],
    scope: "delete a same-tenant contact list"
  },
  {
    auth: "api-key",
    method: "POST",
    path: "app/api/v1/lists/[listId]/contacts/route.ts",
    requiredScopes: ["lists:write"],
    scope: "add same-tenant contacts to one contact list"
  },
  {
    auth: "api-key",
    method: "DELETE",
    path: "app/api/v1/lists/[listId]/contacts/[contactId]/route.ts",
    requiredScopes: ["lists:write"],
    scope: "remove one same-tenant contact-list membership"
  },
  {
    auth: "api-key",
    method: "POST",
    path: "app/api/v1/segments/route.ts",
    requiredScopes: ["segments:write"],
    scope: "create a same-tenant saved segment"
  },
  {
    auth: "api-key",
    method: "PATCH",
    path: "app/api/v1/segments/[segmentId]/route.ts",
    requiredScopes: ["segments:write"],
    scope: "update a same-tenant saved segment"
  },
  {
    auth: "api-key",
    method: "DELETE",
    path: "app/api/v1/segments/[segmentId]/route.ts",
    requiredScopes: ["segments:write"],
    scope: "delete a same-tenant saved segment"
  },
  {
    auth: "api-key",
    method: "POST",
    path: "app/api/v1/templates/route.ts",
    requiredScopes: ["templates:write"],
    scope: "create a same-tenant message template"
  },
  {
    auth: "api-key",
    method: "PATCH",
    path: "app/api/v1/templates/[templateId]/route.ts",
    requiredScopes: ["templates:write"],
    scope: "update a same-tenant message template"
  },
  {
    auth: "api-key",
    method: "DELETE",
    path: "app/api/v1/templates/[templateId]/route.ts",
    requiredScopes: ["templates:write"],
    scope: "delete a same-tenant message template"
  },
  {
    auth: "api-key",
    method: "POST",
    path: "app/api/v1/campaigns/route.ts",
    requiredScopes: ["campaigns:write"],
    scope: "create a same-tenant draft campaign"
  },
  {
    auth: "api-key",
    method: "PATCH",
    path: "app/api/v1/campaigns/[campaignId]/route.ts",
    requiredScopes: ["campaigns:write"],
    scope: "update a same-tenant draft campaign"
  },
  {
    auth: "api-key",
    method: "POST",
    path: "app/api/v1/campaigns/[campaignId]/schedule/route.ts",
    requiredScopes: ["campaigns:send"],
    scope: "schedule one preflight-approved same-tenant campaign"
  },
  {
    auth: "api-key",
    method: "POST",
    path: "app/api/v1/campaigns/[campaignId]/cancel/route.ts",
    requiredScopes: ["campaigns:send"],
    scope: "cancel queued work for one same-tenant campaign"
  },
  {
    auth: "api-key",
    method: "POST",
    path: "app/api/v1/conversations/[conversationId]/messages/route.ts",
    requiredScopes: ["conversations:write", "messages:send"],
    scope: "accept one consent-safe dummy reply in a same-tenant conversation"
  }
] satisfies ApiRouteRbacMatrixEntry[];

export const apiRouteRbacMatrix: readonly ApiRouteRbacMatrixEntry[] = Object.freeze(
  apiRouteRbacMatrixItems.map((entry) => Object.freeze({ ...entry }))
);

function isRoleGateEntry(entry: ApiRouteRbacMatrixEntry): entry is ApiRouteRoleGateEntry {
  return entry.auth === "role";
}

function isSignedWebhookEntry(entry: ApiRouteRbacMatrixEntry): entry is ApiRouteSignedWebhookEntry {
  return entry.auth === "signed-webhook";
}

function isPublicAuthEntry(entry: ApiRouteRbacMatrixEntry): entry is ApiRoutePublicAuthEntry {
  return entry.auth === "public-auth";
}

function isOperatorBoundaryEntry(
  entry: ApiRouteRbacMatrixEntry
): entry is ApiRouteOperatorBoundaryEntry {
  return entry.auth === "operator-boundary";
}

function isApiKeyEntry(entry: ApiRouteRbacMatrixEntry): entry is ApiRouteApiKeyEntry {
  return entry.auth === "api-key";
}

export const apiRouteRbacRoleMatrix = Object.freeze(apiRouteRbacMatrix.filter(isRoleGateEntry));

export const apiRouteRbacSignedWebhookExceptions = Object.freeze(
  apiRouteRbacMatrix.filter(isSignedWebhookEntry)
);

export const apiRouteRbacPublicAuthExceptions = Object.freeze(
  apiRouteRbacMatrix.filter(isPublicAuthEntry)
);

export const apiRouteRbacOperatorBoundaryExceptions = Object.freeze(
  apiRouteRbacMatrix.filter(isOperatorBoundaryEntry)
);

export const apiRouteRbacApiKeyBoundaries = Object.freeze(
  apiRouteRbacMatrix.filter(isApiKeyEntry)
);
