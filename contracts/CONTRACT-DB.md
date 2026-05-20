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
