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
