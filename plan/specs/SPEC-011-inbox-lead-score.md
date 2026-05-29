# SPEC-011 — Surface lead qualification score in the inbox workspace

- **Status:** Todo · **Priority:** P2 · **Pillar:** Product/Features · **Effort:** S

## Description
SPEC-008 persists `Contact.leadScore`/`leadStage`/`leadQualifiedAt` and surfaces them on the contact detail
page. The shared inbox is where reps triage conversations, so the qualification belongs there too. Add a
read-only lead-score indicator for the selected conversation's contact. Demo-safe — no live calls, no
mutation, no consent/send side effects.

## Prereqs / deps
SPEC-008 (done): score persistence + `formatLeadStatus` (`lib/product/contacts.ts`). Inbox projection lives
in `lib/product/inbox.ts`; UI in `app/dashboard/inbox/workspace.tsx`.

## Implementation approach
1. Include the selected contact's `leadScore`/`leadStage` in the inbox projection (`lib/product/inbox.ts`),
   formatted via the existing `formatLeadStatus`.
2. Render a read-only "Lead score" line in the inbox workspace selected-conversation panel.
3. No new endpoint, no mutation.

## Acceptance criteria
- [ ] Inbox projection exposes the selected contact's formatted lead status (reusing `formatLeadStatus`); unit tested for present + absent.
- [ ] Inbox workspace shows the lead score read-only; "Not qualified" when absent.
- [ ] No consent/send/provider side effects; `npm run validate` green; verified by a live render of `/dashboard/inbox`.

## Test strategy
Unit: inbox projection includes the formatted lead status (present + absent). Live render check.

## Out of scope
Editing the score from the inbox; auto-routing/assignment by score; analytics rollups.
