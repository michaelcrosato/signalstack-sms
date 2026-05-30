# SPEC-025 — Message Template Variable Substitution Validator & Preview Seam

- **Status:** Todo · **Priority:** P2 · **Pillar:** Quality · **Effort:** S

## Description
Provide a template rendering engine previewer and validator. When selecting a template, the user or API caller should be able to submit a dictionary of template variables, validate that all placeholders (e.g. `{{firstName}}`, `{{discount}}`) are fully substituted, and preview the safe rendered body text before scheduling any campaigns.

## Prereqs / deps
Requires templates core schemas and models (`MessageTemplate`).

## Implementation approach
1. Design a rendering validation utility `lib/validation/template-preview.ts` which takes a template body and a variables map.
2. The utility parses the string, checks if any placeholder pattern `{{variableName}}` remains unreplaced, and reports missing variables or extra variables.
3. Expose an API endpoint `POST /api/templates/preview` accepting `{ "templateId": "...", "variables": { "var1": "val1" } }`.
4. Return the fully rendered preview string and a boolean success indicator along with any warning tags.
5. Write unit tests checking missing placeholders, empty values, security injections, and nested inputs.

## Acceptance criteria
- [ ] Render utility replaces all template variables with zero bracket leakage.
- [ ] Returns detailed validation warnings when variables are missing or mismatched.
- [ ] Endpoint `/api/templates/preview` returns standard JSON payload with success, body, and issues.
- [ ] Unit tests cover multiple variable counts, escape characters, and formatting errors.
- [ ] `npm run validate` runs and exits 0.

## Test strategy
- Unit tests under `tests/unit/validation/template-preview.test.ts` verifying variable resolver behavior, endpoint output, and warning arrays.
