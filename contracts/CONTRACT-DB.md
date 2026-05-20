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
