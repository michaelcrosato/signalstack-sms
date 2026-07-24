# Production Deployment Runbook

This runbook covers the single-package production deployment bundle delivered in Milestone M10. Built-in local identity, multi-stage Docker packaging, Caddy TLS ingress, non-root execution (`ssms` UID 10001), fail-closed PostgreSQL RLS boundaries, background worker outbox, and AES-256-GCM encrypted backup/restore harness are fully implemented.

## Single-Package Production Bundle & Container Lifecycle

SignalStack SMS is packaged as a multi-stage Docker image built on Node 22 (`Dockerfile`) and configured via `docker-compose.prod.yml`.

### Docker Architecture
- **Web Application (`app`)**: Next.js web runtime running under non-root `ssms` user (`UID:GID 10001:10001`) with read-only root filesystem readiness.
- **Background Worker (`worker`)**: Outbox queue worker running `npm run worker` under `ssms` user.
- **Database (`db`)**: PostgreSQL 16 database container with persistent data volume `postgres-data` and health checks.
- **TLS Ingress (`caddy`)**: Reverse proxy managing automatic TLS ingress and proxy headers to `app:3000`.
- **Media Volume (`media-data`)**: Persistent volume for local encrypted SMS media attachments.

### Container Lifecycle Commands

Start production stack in detached mode:
```bash
docker compose -f docker-compose.prod.yml up -d
```

View running services and health status:
```bash
docker compose -f docker-compose.prod.yml ps
```

View service logs:
```bash
docker compose -f docker-compose.prod.yml logs -f app worker db caddy
```

Stop production stack:
```bash
docker compose -f docker-compose.prod.yml down
```

Rebuild production container image:
```bash
docker compose -f docker-compose.prod.yml build --no-cache
```

## Deployment Class

Current supported class: demo-safe production-like deployment.

Required environment:

```bash
APP_ENV=production
DEMO_MODE=true
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake
API_RATE_LIMIT_ENABLED=true
DATABASE_RLS_ENFORCED=true
```

Forbidden for the current deployment class:

- `ALLOW_PRODUCTION_EXTERNALS=true`
- `LIVE_MESSAGING_ENABLED=true`
- `LIVE_BILLING_ENABLED=true`
- `MESSAGING_PROVIDER=twilio`
- `AI_PROVIDER` values other than `fake`
- Twilio account, auth-token, messaging-service, or from-number environment secrets
- Stripe secret or webhook-secret environment secrets
- Clerk secret or publishable-key environment configuration

`/settings/provider` now stores verified provider Auth Tokens only as account-hash/AAD-bound AES-256-GCM
ciphertext. Plaintext must never be stored, logged, returned, exported, committed, or placed in browser-
delivered configuration. Provisioning/rotation of the separate `SECRETS_MASTER_KEY` and any real credential
remains human-controlled; M4 ownership alone does not authorize M5 sends. The exact
`production-live-direct` worker additionally requires M5 live/runtime/organization/compliance/consent/
quiet-hour/frontier gates. Legacy provider credential/rotation rows remain unverified/display-only.

## Pre-Deploy Checks

Run locally before deployment:

```bash
npm install
npm run db:generate
$env:DATABASE_URL='postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public'; npm run db:migrate
npm run demo:seed
npm run validate
npm run test:e2e:demo
```

Run context check and production gate before pushing image:

```bash
npm run docker:context:check
$env:APP_ENV='production'
$env:DEMO_MODE='true'
$env:LIVE_MESSAGING_ENABLED='false'
$env:LIVE_BILLING_ENABLED='false'
$env:MESSAGING_PROVIDER='dummy'
$env:AI_PROVIDER='fake'
npm run production:gate
```

Expected result: `Production deployment gate passed with external-impact defaults blocked.`

## Database Deployment & Encrypted Backup/Restore

### Database Deployment & Provisioning
Use separate credentials for migrations and each runtime process. `MIGRATION_DATABASE_URL` must identify
the table-owning migration/operator login; `DATABASE_URL` must identify the desired non-owner runtime login.

Deploy migrations:
```powershell
$env:MIGRATION_DATABASE_URL='<postgresql owner URL>'
$env:DATABASE_URL='<postgresql web runtime URL>'
npm run db:deploy
npm run db:provision:web
```

Provision worker:
```powershell
$env:DATABASE_URL='<postgresql worker runtime URL>'
npm run db:provision:worker
```

### Encrypted Database Backup & Restore Harness

Database backups are produced and restored using `scripts/backup-restore.ts` / `npm run db:backup` / `npm run db:restore` using AES-256-GCM encryption with SHA-256 checksum verification.

Create an encrypted database backup:
```bash
tsx scripts/backup-restore.ts backup --out=backups/signalstack-$(date +%Y%m%d%H%M%S).dump --key=<32-byte-hex-or-passphrase>
```
Or using npm:
```bash
$env:BACKUP_ENCRYPTION_KEY='<32-byte-hex-key>'
npm run db:backup -- --out=backups/signalstack-prod.dump
```

Verify an encrypted backup file without restoring:
```bash
tsx scripts/backup-restore.ts verify --in=backups/signalstack-prod.dump --key=<32-byte-hex-or-passphrase>
```

Restore an encrypted database backup (idempotent drill):
```bash
tsx scripts/backup-restore.ts restore --in=backups/signalstack-prod.dump --key=<32-byte-hex-or-passphrase>
```

### Volume Backup Instructions

Back up local media volume (`media-data`):
```bash
docker run --rm -v media-data:/volume -v $(pwd)/backups:/backup alpine tar czf /backup/media-backup-$(date +%Y%m%d).tar.gz -C /volume .
```

Restore local media volume (`media-data`):
```bash
docker run --rm -v media-data:/volume -v $(pwd)/backups:/backup alpine tar xzf /backup/media-backup-$(date +%Y%m%d).tar.gz -C /volume
```

## Upgrade Migration & Maintenance Runbook

1. **Pre-Upgrade Backup**: Create an encrypted database snapshot and volume tarball before starting upgrade:
   ```bash
   tsx scripts/backup-restore.ts backup --out=backups/pre-upgrade-$(date +%Y%m%d%H%M%S).dump
   ```
2. **Rebuild or Pull New Docker Image**:
   ```bash
   docker compose -f docker-compose.prod.yml build
   ```
3. **Execute Non-Destructive Database Migrations**:
   ```bash
   docker compose -f docker-compose.prod.yml exec app npm run db:deploy
   ```
4. **Perform Rolling Service Update**:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --remove-orphans
   ```
5. **Post-Upgrade Verification**:
   ```bash
   docker compose -f docker-compose.prod.yml exec app npm run validate
   ```

Do not run `npm run db:reset`, manual destructive SQL, or production data deletion as part of this runbook.

Seed data is for local/demo workspaces. Do not run `npm run demo:seed` against a real customer production database unless the environment is explicitly a disposable demo tenant.

## Tenant-Boundary Proof

The mandatory database gate requires a disposable PostgreSQL database and an owner-capable test credential:

```powershell
$env:RUN_DB_TESTS='true'
$env:DATABASE_URL='<disposable PostgreSQL owner URL>'
npm run test:tenant-db
```

Expected evidence is eight files / 33 tests covering tenant A/B, protected tables, missing context, forged reads/writes/relations, rollback, semantic policy fingerprints, command-specific control denial, worker dispatch, and multi-connection pool reuse.

The production local-auth browser proof:

```powershell
$env:RUN_LOCAL_AUTH_E2E='true'
$env:MIGRATION_DATABASE_URL='<dedicated loopback PostgreSQL owner URL>'
$env:DATABASE_URL='<dedicated loopback PostgreSQL non-owner web URL>'
npm run test:e2e:local-auth:production
```

## Post-Deploy Smoke

Verify these routes in the deployed app:

- `/api/health` reports demo-safe defaults.
- `/demo` renders the investor demo console.
- `/settings` shows live messaging blocked.
- `/settings/provider` shows only safe M4 account/ownership/health state.

Production observability planning is documented in `docs/PRODUCTION_OBSERVABILITY.md`. Current observability is platform/local only.

Platform-specific hosting notes are documented in `docs/DEPLOYMENT_PLATFORM_NOTES.md`.

Production worker execution policy is documented in `docs/PRODUCTION_WORKER_POLICY.md`.

Production auth/RBAC is documented in `docs/PRODUCTION_AUTH_RBAC.md`.

## Rollback

Rollback procedure for application or migration issues:

- For application regressions: Redeploy previous container image: `docker compose -f docker-compose.prod.yml up -d` specifying the previous image tag.
- For database restore: If database corruption occurs, run restore harness from pre-upgrade snapshot:
  ```bash
  tsx scripts/backup-restore.ts restore --in=backups/pre-upgrade-<timestamp>.dump --key=<key>
  ```
- Do not roll back database migrations with destructive SQL unless a reviewed production data playbook exists.
- If external-impact flags are ever accidentally set, immediately restore the required demo-safe environment values and rerun `npm run production:gate`.

## Incident Switches

These values must remain available to force the product back into a no-external-impact posture:

```bash
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake
```

Do **not** flip `DEMO_MODE=true` on a production deployment as an incident switch.
