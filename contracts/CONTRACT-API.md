# API Contract

Owner: backend-data and frontend-ui.

## Implemented Endpoints

### `GET /api/health`

Returns service health and demo-safe defaults.

### `GET /api/orgs/current`

Returns the demo-safe current user and organization summary.

Response shape:

```json
{
  "currentUser": {
    "id": "string",
    "email": "string",
    "role": "OWNER"
  },
  "organization": {
    "id": "string",
    "name": "string",
    "slug": "string",
    "demoMode": true,
    "timezone": "America/Los_Angeles",
    "_count": {
      "memberships": 1,
      "contacts": 0,
      "campaigns": 0,
      "conversations": 0,
      "messages": 0
    }
  }
}
```

### `GET /api/contacts`

Returns active contacts for the current organization.

### `POST /api/contacts`

Creates or updates a contact by `(orgId, phone)`.

Accepted fields: `phone`, `email`, `firstName`, `lastName`, `displayName`, `consentStatus`, `optInSource`, `source`, `notes`, `tagNames`, `listNames`.

### `GET /api/contacts/:contactId`

Returns a single contact only when it belongs to the current organization.

### `PATCH /api/contacts/:contactId`

Updates contact profile, consent, tags/lists, or archive state only when the contact belongs to the current organization.

### `DELETE /api/contacts/:contactId`

Soft-archives the contact by setting `archivedAt`. It does not hard-delete rows.

### `POST /api/contacts/imports`

Accepts JSON `{ "filename": "contacts.csv", "csv": "..." }`, parses demo-safe CSV locally, upserts valid contacts, and stores an org-scoped `ContactImport` audit record. Invalid rows are returned with row numbers.

Product endpoints must be specified here before implementation.
