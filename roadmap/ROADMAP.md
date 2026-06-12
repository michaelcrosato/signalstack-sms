# Roadmap

> **Operator: this is your file.** Plain-English bullets; reorder to change priorities. Agents only ever mark items "✅ shipped (PR #n)" — they never rewrite your words. Sections mean: **Now** = working on it, **Next** = queued, **Later** = someday, **Ideas** = unscoped thoughts.

## Now

- Stand up the Next.js App Router skeleton with TypeScript, Prisma/Postgres, BullMQ/Redis, and Tailwind — local dev runs cleanly with `docker compose up` and `npm run dev`, migrations apply, demo seed works, and `npm run validate` stays green.
- Harden the Twilio messaging provider integration so live-pilot SMS sending works end-to-end behind the existing hard gate (TICKET020): adapter tests pass, provider selection config works, fake/dummy modes stay default.
- Enable Clerk authentication and RBAC enforcement behind the existing hard gate (TICKET021): every dashboard route requires a valid session, tenant isolation enforced on every DB query, no auth bypass in demo mode.

## Next

- Production secret management: secrets live only in provider dashboards and the Claude Code environment; `npm run secrets:scan` catches any stray credentials in files (TICKET022).
- CSV contact import: upload a file on the Contacts page and see your contacts loaded, deduplicated, and ready for a campaign — validation errors shown inline.
- Campaign preflight and send: create a campaign, run the compliance preflight check, and schedule or send it — status updates visible in real time on the Campaigns page.

## Later

- Shared inbox: incoming MMS/SMS replies routed to the inbox with keyword-triggered auto-responses and agent hand-off.
- Lead-qualification flows: configurable keyword + response chains that qualify and score inbound leads automatically.
- Analytics dashboard: delivery rates, opt-out rates, reply rates, and cost per message displayed on the Analytics page with date filtering.
- Billing and usage metering: per-tenant usage tracked and surfaced in the Settings readiness panel; usage limits enforced before live sends.
- Full production deployment automation: CI deploys to Vercel production on `master` merge; database migrations run via Prisma in CI.

## Ideas

- A/B message testing: send two message variants to a random split of a contact list and report which performed better.
- MMS template gallery: pre-built image + copy layouts operators can customize on the Templates page.
- Quarry: a previous implementation was built before this engine was installed. If specific prior work (contacts import logic, campaign queue design, Twilio webhook ingestion) would accelerate a feature, reference it from git history on the pre-purge tag — never bulk-restore it.
