# Data Model

Milestone 0 baseline tables are defined in `prisma/schema.prisma`.

Tenant rule: every tenant-scoped table must include `orgId` unless explicitly documented in `contracts/CONTRACT-DB.md`.
