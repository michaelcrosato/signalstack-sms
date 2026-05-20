# API Map

Milestone 0:

- `GET /api/health`: returns service health and demo-safe defaults.

Milestone 1:

- `GET /api/orgs/current`: returns deterministic current user and organization summary.

Milestone 2:

- `GET /api/contacts`: lists active contacts.
- `POST /api/contacts`: creates or upserts a contact by phone.
- `GET /api/contacts/:contactId`: returns a tenant-scoped contact.
- `PATCH /api/contacts/:contactId`: updates a tenant-scoped contact.
- `DELETE /api/contacts/:contactId`: soft-archives a tenant-scoped contact.
- `POST /api/contacts/imports`: imports contacts from local CSV text.

Product API routes must be added to `contracts/CONTRACT-API.md` before implementation.
