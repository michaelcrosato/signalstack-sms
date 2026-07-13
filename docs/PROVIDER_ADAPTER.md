# Provider Adapter

The default provider is `dummy`. It is deterministic, reads no provider environment credentials, and makes
no network call. M4 completes provider identity/ownership; M5 enables direct live messaging only through
the durable, separately authorized final-gated worker.

## M4 Provider Control Plane

`/settings/provider` is the same-origin ADMIN control plane for verified provider accounts. It uses
unprefilled password controls and safe DTOs for account connection, credential rotation, explicit
verification/health, number and messaging-service discovery/import, local default/disable lifecycle, and
local revocation. The page offers no send, purchase, release, port, or provider-side configuration action.

Provider Auth Tokens persist only as AES-256-GCM ciphertext under a separately provisioned
`SECRETS_MASTER_KEY`. AAD binds the organization, provider, exact external account ID and canonical keyed
account hash, local account ID, credential-secret ID/version, envelope/key versions, and safe fingerprint.
Plaintext, envelope fields, routing hashes, full account IDs, fingerprints, raw provider errors, and secrets
never enter responses, HTML, logs, audit metadata, exports, or caches.

Explicit same-origin ADMIN connect, rotate, verify, health, and discovery operations may make bounded read-
only Twilio requests. Tests and defaults use injected fixtures and never contact Twilio. Import persists only
fresh, account/generation-bound discovery evidence and never purchases, releases, ports, configures, or
otherwise mutates a provider resource.

`GET /api/settings/provider` reports safe aggregate M4 readiness without a provider call. The old metadata
`PATCH` is retired and returns authenticated no-store `410 PROVIDER_METADATA_ENDPOINT_RETIRED` before body
parsing. Compatibility `DELETE` locally revokes only the selected default account's authority and history is
retained; it does not revoke credentials at Twilio.

The `/api/settings/provider/accounts/**` routes expose safe account lifecycle, discovery/import, and owned-
resource reads. `PATCH /api/settings/numbers/:numberId` and the nested messaging-service `PATCH` perform one
local default/disable action and never change provider state.

M4 configure, verify, rotate, revoke, health, discovery, import, default, and disable operations append
secret-free `IntegrationAuditEvent` evidence. Existing `ProviderCredential` and
`ProviderCredentialRotation` rows and their JSON/CSV history endpoints remain unverified/display-only legacy
metadata; they never authorize an account, number, service, credential, callback, or send.

Signed Twilio callbacks resolve exactly one keyed account plus owned destination, decrypt only that
account's active credential for signature validation, and recheck tenant/generation state before persistence.
Unknown, crossed, ambiguous, disabled, revoked, or stale evidence fails generically. Non-owner PostgreSQL
routing plus HTTP route fixtures prove the boundary; M4 does not claim a literal callback-server E2E.

General Twilio SMS/MMS creation is implemented for the exact `production-live-direct` worker class. It uses
the attempt's encrypted tenant credential and verified owned sender, supplies a signed correlated HTTPS
callback, applies a bounded timeout, and never retries possible-impact ambiguity. Public/inbox acceptance,
pages, tests, builds, and default workers do not call Twilio. The isolated live-test SMS continues to use its
separate environment credentials/operator gates and does not authorize the general outbox.
