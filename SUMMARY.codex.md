# Codex Summary

Run number: 832

- **Repository audit + standalone-identity merge landed on `chore/repo-audit-2026-07-12`** (PR to
  `develop`). The self-hosted identity milestone (M1/M2) was reviewed and merged: built-in local
  credentials, keyed opaque sessions, teams/invites, password resets, RBAC, and database-enforced tenant
  RLS with runtime roles. No new npm dependencies; crypto is Node built-ins.
- **Security hardening from the merge review:** production posture now fails closed on `DEMO_MODE=true`
  unless `ALLOW_PRODUCTION_DEMO=true` (config refinement + `DEMO_MODE_WITHOUT_PRODUCTION_DEMO_ACK`
  deployment blocker); API rate limiter no longer trusts spoofable IP headers without `TRUST_PROXY`;
  local-auth handlers log redacted failure types instead of swallowing errors.
- **Correctness fixes:** partial contact PATCH no longer wipes the un-provided tag/list collection;
  billing usage totals aggregate all events (not just the recent 100); segment export validates query
  params (400 not 500); contact import returns 422 on a write-once consent conflict; queue worker logs
  failures instead of bare `catch {}`; continuous worker result history is bounded; live AI calls have a
  timeout and map failures to 502 (not 403); Redis URLs percent-decode creds and enable `rediss:` TLS;
  quiet-hours falls back to the org timezone for unmapped area codes.
- **Cleanup:** removed `codex-runs/`, `prompts/`, `planning/`, `codex-skynet-max.ps1`, bootstrap handoff
  files, root `CONTRACTS.md`, the placeholder `automerge.yml`, vestigial `agent:status`/`agent:handoff`
  scripts, non-functional shadcn config, and dead exports. Deleted stale `jules-*` remote branch and
  local `main`.
- **Docs:** README/GOAL/REPO_MAP aligned to the identity reality; CANONICAL plan bannered historical;
  TICKET021 superseded, TICKET023 marked partial; new `docs/KNOWN_LIMITATIONS.md` records every remaining
  deployment-gated/latent risk. Validation: `npm run validate` green locally incl. e2e smoke and the full
  `RUN_DB_TESTS=true` suite (1139 tests) against Postgres 16.
- History is in `git log`; start with `npm run agent:brief`.
