# Database Contract

Owner: backend-data.

## Tenant Rule

Every tenant-scoped model must include `orgId` unless explicitly documented here. Repositories and route handlers must resolve the current organization before reading or writing tenant data.

## Milestone 1 Foundation

Canonical organization/auth models:

- `Organization`: `id`, unique `slug`, optional unique `clerkOrgId`, `name`, `demoMode`, `timezone`.
- `AppUser`: `id`, unique `clerkUserId`, unique `email`, optional `displayName`.
- `Membership`: unique `(orgId, userId)`, `role`, `status`.

Canonical roles:

- `OWNER`
- `ADMIN`
- `MEMBER`

Canonical membership statuses:

- `ACTIVE`
- `INVITED`
- `SUSPENDED`

Demo auth uses a deterministic local owner and organization until Clerk is wired behind the same contract.

Baseline tenant-scoped product models remain: `Contact`, `Campaign`, `Conversation`, `Message`.

## Milestone 2 Contacts Foundation

Canonical contact fields:

- `Contact`: tenant-scoped by `orgId`, unique `(orgId, phone)`, optional `email`, `firstName`, `lastName`, `displayName`, `source`, `notes`, and soft-delete `archivedAt`.
- Consent fields: `consentStatus`, `optInSource`, `optInAt`, `optedOutAt`.
- `Tag` and `ContactTag`: org-scoped reusable labels with unique `(orgId, name)`.
- `ContactList` and `ContactListMember`: org-scoped static lists with unique `(orgId, name)`.
- `Segment`: org-scoped saved segment definition stored as JSON.
- `ContactImport`: org-scoped CSV import audit record with status, row counts, and row-scoped errors.

Contacts are never hard-deleted by the API in Milestone 2. `DELETE /api/contacts/:contactId` sets `archivedAt`.

## Milestone 3 Campaign Draft Foundation

- `MessageTemplate`: tenant-scoped reusable SMS body with JSON `variables`, unique `(orgId, name)`.
- `Campaign`: tenant-scoped draft campaign with optional `templateId`; Milestone 3 supports draft create/update only.
- `CampaignRecipient`: tenant-scoped join between draft campaign and contact, unique `(campaignId, contactId)`.

Campaign recipients are selected only from contacts in the current organization.

## Milestone 4 Queue Foundation

- `QueueJob`: tenant-scoped durable job record with unique `idempotencyKey`, JSON `payload`, `runAt`, and status.
- Scheduled campaign jobs link to `Campaign` when applicable.

## Milestone 5 Shared Inbox Foundation

- `Conversation`: tenant-scoped inbox thread with optional `contactId`, optional `assignedToUserId`, `status`, `lastMessageAt`, `assignedAt`, and `resolvedAt`.
- `Message`: tenant-scoped message rows linked to a conversation/contact when available. Milestone 5 demo inbound rows use `direction: "INBOUND"` and never call a provider.
- `InternalNote`: tenant-scoped note linked to a conversation and author user.

Conversation assignment is limited to active members of the current organization. Resolve/reopen changes only local conversation state.

## Milestone 6 Compliance Profile Foundation

- `ComplianceProfile`: one org-scoped record with business identity, messaging use case, opt-in description, policy URLs, and `a2pRegistrationStatus`.
- `A2pRegistrationStatus`: `NOT_STARTED`, `PENDING`, `APPROVED`, `REJECTED`.

Compliance profile completion is required by the centralized messaging hard gate but does not enable live messaging by itself.

## Milestone 8 Usage and Billing Foundation

- `UsageEvent`: tenant-scoped local usage record with `type`, `quantity`, optional JSON metadata, and timestamp.
- `BillingAccount`: one org-scoped billing metadata record with local status and live-billing flag.
- `WebhookEvent`: org-scoped raw provider webhook record with provider, event type, unique idempotency key, raw payload, received timestamp, and processed timestamp.
- `ProviderPhoneNumber`: org-scoped phone-number metadata with `phoneNumber`, provider name, local status, capabilities, and default-number marker.
- `ProviderCredential`: org-scoped provider credential metadata with provider name, redacted Twilio account/from-number fields, auth-token fingerprint, configured flag, and source.
- `ProviderCredentialRotation`: org-scoped local history of provider credential metadata configuration, rotation, and deletion events.
- `LiveReadinessAuditEvent`: org-scoped audit event for go-live readiness configuration changes.
- `UsageEventType`: `CONTACT_IMPORTED`, `MESSAGE_INBOUND`, `CAMPAIGN_SCHEDULED`, `AI_REQUEST`.
- `BillingAccountStatus`: `DEMO`, `TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELLED`.

Billing records are local metadata only. Stripe/customer/subscription IDs are nullable placeholders and must not be created by MVP endpoints.

## Post-MVP Provider Number Foundation

`ProviderPhoneNumber` records are configuration metadata only. Creating or updating one must not provision a provider number, validate ownership with Twilio, store credentials, enable live messaging, or send SMS.

## Post-MVP Provider Credential Metadata Foundation

`ProviderCredential` records are local readiness metadata only. They may store redacted identifiers and a one-way fingerprint of a submitted token, but must not store raw auth tokens, return secrets to API clients, verify credentials with Twilio, enable live messaging, or send SMS.

## Post-MVP Provider Credential Rotation History

`ProviderCredentialRotation` records are local, tenant-scoped history entries for provider credential metadata changes. They may store redacted account/from-number values, last-four hints, credential presence booleans, action labels, and actor IDs. They must not store raw auth tokens, return one-way token fingerprints through API responses, call Twilio, validate credentials, revoke provider-side credentials, enable live messaging, or send SMS.

## Post-MVP Live Readiness Audit Foundation

`LiveReadinessAuditEvent` records local configuration changes that affect future go-live readiness, such as compliance profile updates and provider number metadata changes. Audit records are local-only and must not trigger notifications, provider calls, billing events, or live messaging.
