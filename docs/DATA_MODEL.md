# Data Model

`prisma/schema.prisma` is the executable source of truth.

## Milestone 1 Foundation

SignalStack is multi-tenant from the first product milestone:

- `Organization` represents a customer workspace.
- `AppUser` represents the local app user record mapped from Clerk later.
- `Membership` connects users to organizations with a role and status.

Demo mode uses:

- Organization slug: `demo-signalstack`
- User: `owner@signalstack.example`
- Role: `OWNER`

Tenant rule: every tenant-scoped table must include `orgId` unless explicitly documented in `contracts/CONTRACT-DB.md`.

## Milestone 2 Contacts

Contacts now include profile, consent, and import metadata:

- `Contact` stores phone, optional identity fields, consent state, opt-in/out timestamps, source, notes, and `archivedAt`.
- `Tag`/`ContactTag` provide reusable labels.
- `ContactList`/`ContactListMember` provide static list membership.
- `Segment` stores saved segment definitions as JSON for later campaign targeting.
- `ContactImport` stores CSV import audit counts and row-scoped errors.

The API uses tenant-scoped repositories for contact reads and writes. Contact deletion is a soft archive.

## Milestone 3 Campaign Drafts

- `MessageTemplate` stores reusable SMS copy and parsed variable names.
- `Campaign` stores draft campaign copy and an optional template link.
- `CampaignRecipient` stores the selected contacts for a draft campaign.

Preflight reads contacts and returns compliance reasons. It does not create messages, queue jobs, or call providers.
