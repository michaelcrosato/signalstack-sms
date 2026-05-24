# Current State Matrix

Last updated: 2026-05-23.

Run 593 note: live-worker authorization now evaluates exact frozen control-array evidence without reading inherited `Array.prototype` mutator/visitor method metadata.

Run 592 note: live-worker authorization now evaluates exact frozen control-array evidence without reading inherited `Array.prototype` transform/reducer method metadata.

Run 591 note: live-worker authorization now evaluates exact frozen control-array evidence without reading inherited `Array.prototype.every` metadata, and the authorization helpers no longer depend on inherited `Array.prototype.every` or iterator methods in the checked path.

Run 590 note: live-worker authorization now evaluates exact frozen control-array evidence without reading inherited `Array.prototype` lookup method metadata, and supported status matching no longer depends on inherited `Array.prototype.includes`.

Run 589 note: live-worker authorization now evaluates exact frozen control-array evidence without reading inherited `Array.prototype` `entries`, `keys`, or `values` metadata.

Run 588 note: live-worker authorization now evaluates exact frozen control-array evidence without reading inherited `Array.prototype` `Symbol.asyncIterator` metadata.

Run 587 note: live-worker authorization now denies own accessor-backed `Symbol.toStringTag` metadata on otherwise valid control arrays without reading the getter.

Run 586 note: live-worker authorization now evaluates exact frozen control-array evidence without reading inherited `Array.prototype` string-method symbol metadata.

Run 585 note: live-worker authorization now evaluates exact frozen control-array evidence without reading inherited `Array.prototype[Symbol.isConcatSpreadable]` metadata.

Run 584 note: live-worker authorization now evaluates exact frozen control-array evidence without reading inherited `Array.prototype[Symbol.unscopables]` metadata.

Run 583 note: live-worker authorization now evaluates exact frozen control-array evidence without reading inherited `Array.prototype.constructor` metadata.

Run 580 note: live-worker authorization now evaluates exact frozen authorization-wrapper evidence without reading inherited `Object.prototype` `Symbol.toStringTag` metadata.

Run 579 note: live-worker authorization now evaluates exact frozen control-entry evidence without reading inherited `Object.prototype` `Symbol.toStringTag` metadata.

Run 578 note: live-worker authorization now evaluates exact frozen control-array evidence without reading inherited `Array.prototype` `Symbol.toStringTag` metadata.

Run 577 note: live-worker authorization now evaluates exact frozen authorization-wrapper evidence without invoking inherited `Object.prototype` `Symbol.toPrimitive`, `toString`, or `valueOf` metadata.

Run 576 note: live-worker authorization now evaluates exact frozen control-entry evidence without invoking inherited `Object.prototype` `Symbol.toPrimitive`, `toString`, or `valueOf` metadata.

Run 575 note: live-worker authorization now evaluates exact frozen control-array evidence without reading inherited `Array.prototype` `Symbol.toPrimitive`, `toString`, or `valueOf` metadata.

Run 574 note: live-worker authorization now denies control arrays with own `Symbol.toPrimitive`, `toString`, or `valueOf` metadata without reading or invoking those hooks.

Run 573 note: live-worker authorization now denies control entries with own `Symbol.toStringTag`, `Symbol.toPrimitive`, `toString`, or `valueOf` metadata without reading or invoking those hooks.

Run 572 note: live-worker authorization now denies own accessor-backed `Symbol.toStringTag` metadata on authorization wrappers before hostile supplied controls are inspected and without reading the getter.

Run 571 note: live-worker authorization now denies authorization wrappers with own coercion metadata before hostile supplied controls are inspected and without invoking own `Symbol.toPrimitive`, `toString`, or `valueOf`.

Run 570 note: live-worker authorization now denies authorization wrappers with inherited coercion hooks before hostile supplied controls are inspected and without invoking inherited `Symbol.toPrimitive`, `toString`, or `valueOf`.

Run 569 note: revoked proxy-backed authorization wrappers now deny before hostile supplied controls are inspected.

Run 568 note: live-worker authorization-wrapper reflection traps now deny before hostile supplied controls are inspected.

Run 567 note: live-worker authorization now denies reflection-trapped proxy object deployment-class evidence without reading get, prototype, descriptor, key, or frozen-state traps before supplied controls can be inspected.

Run 566 note: live-worker authorization now denies inherited `Symbol.toStringTag` accessors on deployment-class evidence without reading the getter or inspecting hostile supplied controls.

Run 565 note: live-worker authorization now denies inherited `Symbol.toStringTag` accessors on supplied controls evidence and authorization-wrapper metadata without reading those getters or inspecting hostile controls.

Run 564 note: campaign cancellation now returns a `409` conflict for existing non-scheduled campaigns while preserving the no-queue/no-campaign-mutation guard for draft, paused, and completed campaigns.

Run 563 note: campaign cancellation now only pauses scheduled campaigns; missing, draft, paused, and completed campaigns return without queue or campaign mutations.

Run 561 note: live-worker authorization now denies proxy-backed and revoked proxy-backed `Map`, `Set`, `WeakMap`, and `WeakSet` deployment-class evidence before inspecting supplied controls.

Run 559 note: live-worker authorization now denies proxy-backed and revoked proxy-backed URL-shaped, weak-reference, and finalization-registry deployment-class values before supplied controls are inspected, without reading object traps.

Run 558 note: live-worker authorization now denies proxy-backed and revoked proxy-backed array-buffer-shaped deployment-class values before supplied controls are inspected, without reading object traps.

Run 557 note: live-worker authorization now denies proxy-backed and revoked proxy-backed boxed primitive deployment-class values before supplied controls are inspected, without reading object traps.

Run 556 note: live-worker authorization now denies deployment-class objects with inherited coercion hooks before supplied controls are inspected, without invoking inherited `Symbol.toPrimitive`, `toString`, or `valueOf`.

Run 555 note: live-worker authorization now denies proxy-backed and revoked proxy-backed runtime-supported Web-platform, WebAssembly, and Web Crypto records as deployment-class evidence before supplied controls can be inspected.

Run 554 note: live-worker authorization now denies proxy-backed and revoked proxy-backed runtime-supported typed-array constructor values as deployment-class evidence before supplied controls can be inspected.

Run 553 note: live-worker authorization now denies every runtime-supported typed-array constructor as deployment-class evidence before supplied controls can be inspected.

Run 552 note: live-worker authorization now denies every runtime-supported typed-array constructor as `controls` evidence and as authorization-wrapper impostors before the reserved worker class can authorize.

Run 551 note: live-worker authorization now denies revoked proxy-backed runtime-supported Web Crypto records as `controls` evidence without inspecting `get`, prototype, descriptor, or key traps before the reserved worker class can authorize.

Run 550 note: live-worker authorization now has focused coverage denying proxy-backed and revoked proxy-backed runtime-supported WebAssembly records as `controls` evidence before the reserved worker class can authorize.

Run 549 note: live-worker authorization now has focused coverage denying runtime-supported WebAssembly records as `controls` evidence before the reserved worker class can authorize.

Run 548 note: live-worker authorization now denies revoked proxy-backed runtime-supported Web-platform records as `controls` evidence before the reserved worker class can authorize, without throwing or falling back to built-in metadata.

Run 547 note: live-worker authorization now denies runtime-supported Web-platform records as ordinary or proxy-backed `controls` evidence before the reserved worker class can authorize, without inspecting proxy object traps.

Run 546 note: live-worker authorization now denies accessor-backed `workerDeploymentClass` or `controls` public fields on otherwise frozen authorization wrappers before supplied controls are inspected or getters are read.

Run 545 note: top-level loop truth now records that root `LOOP_LOG.md` preserved Run 543 while `docs/LOOP_LOG.md` skipped that entry before Run 544; the discrepancy is documented without rewriting prior log entries.

Run 544 note: live-worker authorization now denies sealed-but-writable authorization wrappers before supplied controls are inspected.

Run 543 note: live-worker authorization now denies exact-field array-shaped and function-shaped authorization-wrapper impostors with exact public data descriptors before supplied controls are inspected.

Run 542 note: live-worker authorization now denies exact-field non-ordinary authorization-wrapper impostors, including frozen null-prototype and class-instance wrappers with exact public data descriptors, before supplied controls are inspected.

Run 541 note: live-worker authorization now denies revoked proxy-backed non-ordinary authorization-wrapper impostors, including null-prototype and class-instance wrappers, before supplied controls are inspected or wrapper fields are read.

Run 540 note: live-worker authorization now denies proxy-backed non-ordinary authorization-wrapper impostors, including null-prototype and class-instance wrappers, before supplied controls are inspected or wrapper fields are read.

Run 539 note: live-worker authorization now denies accessor-backed `Symbol.toStringTag` authorization-wrapper metadata without reading the tag getter or inspecting supplied controls before the reserved worker class can authorize.

Run 538 note: live-worker authorization now denies accessor-backed `Symbol.toStringTag` controls-evidence impostors without reading tag, index, or length getters before the reserved worker class can authorize.

Run 537 note: live-worker authorization now denies deployment-class impostor objects with throwing `Symbol.toStringTag` accessors before supplied controls are inspected and without reading the accessor.

Run 536 note: live-worker authorization now denies array-buffer, URL-shaped, weak-reference, and finalization-registry records when they are supplied as deployment-class impostors before supplied controls are inspected.

Run 535 note: live-worker authorization now denies boxed `Symbol` and boxed `BigInt` records when they are supplied as deployment-class impostors before supplied controls are inspected.

Run 534 note: live-worker authorization now denies runtime-supported Web-platform, WebAssembly, and Web Crypto records when they are supplied as deployment-class impostors before supplied controls are inspected.

Run 533 note: live-worker authorization now denies runtime-supported Web Crypto records as controls evidence and authorization-wrapper impostors before the reserved worker class can authorize.

Run 532 note: live-worker authorization now denies runtime-supported WebAssembly records as controls evidence and authorization-wrapper impostors before the reserved worker class can authorize.

Run 531 note: live-worker authorization now denies runtime-supported Web-platform channel/port, compression stream, queueing strategy, URL pattern, and performance observer records as controls evidence and authorization-wrapper impostors before the reserved worker class can authorize.

Run 530 note: live-worker authorization now denies additional runtime-supported Web-platform stream, encoding-stream, event, and DOM exception records as controls evidence and authorization-wrapper impostors before the reserved worker class can authorize.

Run 529 note: live-worker authorization now denies runtime-supported Web-platform controls evidence and authorization-wrapper impostors before they can authorize the reserved live-worker class or inspect supplied controls.

Run 528 note: live-worker authorization now denies revoked proxy-backed typed-array, data-view, and weak-collection controls evidence before it can be treated as the future live-worker checklist.

Run 527 note: live-worker authorization now denies ordinary `ArrayBuffer` and runtime-supported `SharedArrayBuffer` controls evidence before it can be treated as the future live-worker checklist.

Run 526 note: live-worker authorization now denies boxed `Symbol` and boxed `BigInt` controls evidence in ordinary, proxy-backed, and revoked proxy-backed forms before it can be treated as the future live-worker checklist.

Run 525 note: live-worker authorization now denies boxed `Symbol` and boxed `BigInt` authorization-wrapper impostors in ordinary, exact-field frozen, proxy-backed, reflection-trapped, and revoked proxy-backed forms before supplied controls are inspected.

Run 524 note: live-worker authorization now denies URL-shaped `controls` evidence, including `URL` and `URLSearchParams`, in ordinary, proxy-backed, and revoked proxy-backed forms before supplied controls can be treated as the future live-worker checklist.

Run 523 note: live-worker authorization now denies URL-shaped authorization-wrapper impostors, including `URL` and `URLSearchParams`, in ordinary, exact-field frozen, proxy-backed, reflection-trapped, and revoked proxy-backed forms before supplied controls are inspected.

Run 522 note: top-level Codex handoff truth now leads with the current Run 521 Date-shaped authorization-wrapper boundary.

Run 521 note: live-worker authorization now denies Date-shaped built-in authorization-wrapper impostors in ordinary, exact-field frozen, proxy-backed, reflection-trapped, and revoked proxy-backed forms before supplied controls are inspected.

Run 520 note: live-worker authorization now denies reflection-trapped built-in authorization-wrapper impostors before supplied controls are inspected and without descriptor, key, prototype, frozen-state, or get traps escaping.

Run 519 note: live-worker authorization now denies ArrayBuffer and runtime-supported SharedArrayBuffer authorization-wrapper impostors in ordinary, exact-field frozen, proxy-backed, and revoked proxy-backed forms before supplied controls are inspected.

Run 518 note: live-worker authorization now denies built-in authorization-wrapper impostors with exact-looking frozen public data descriptors before supplied controls are inspected.

Run 517 note: live-worker authorization now denies revoked proxy-backed built-in authorization-wrapper impostors before supplied controls are inspected or built-in metadata can be used as fallback evidence.

Run 516 note: live-worker authorization now denies proxy-backed built-in authorization-wrapper impostors before supplied controls are inspected.

Run 515 note: live-worker authorization now denies WeakRef and FinalizationRegistry authorization-wrapper impostors before supplied controls are inspected.

Run 514 note: live-worker authorization now denies weak-reference and finalization-registry `controls` evidence, including proxy-backed and revoked proxy-backed forms, without trap reads or built-in fallback.

Run 513 note: live-worker authorization now denies revoked proxy-backed built-in `controls` evidence without throwing or falling back to built-in control metadata.

Run 560 note: live-worker authorization now denies proxy-backed and revoked proxy-backed `Promise`, `RegExp`, `Error`, and `TypeError` deployment-class evidence before inspecting supplied controls.

Run 512 note: live-worker authorization now denies proxy-backed `SharedArrayBuffer` `controls` evidence without reading object `get`, prototype, descriptor, or key traps when the runtime exposes it.

Run 511 note: live-worker authorization now denies proxy-backed `ArrayBuffer` `controls` evidence without reading object `get`, prototype, descriptor, or key traps.

Run 510 note: live-worker authorization now denies proxy-backed Map, Set, WeakMap, and WeakSet `controls` evidence without reading object `get`, prototype, descriptor, or key traps.

Run 509 note: live-worker authorization now denies proxy-backed date, RegExp, and Error `controls` evidence without reading object `get`, prototype, descriptor, or key traps.

Run 508 note: live-worker authorization now denies proxy-backed boxed primitive `controls` evidence without reading object `get`, prototype, descriptor, or key traps.

Run 507 note: live-worker authorization now denies proxy-backed `Promise` `controls` evidence without reading object `get`, prototype, descriptor, or key traps.

Run 506 note: live-worker authorization now denies proxy-backed `DataView` `controls` evidence without reading object `get`, prototype, descriptor, or key traps.

Run 505 note: live-worker authorization now denies proxy-backed typed-array `controls` evidence without reading object `get`, prototype, descriptor, or key traps.

Run 504 note: live-worker authorization now denies revoked proxy-backed array-prototype impostor `controls` evidence without throwing or falling back to built-in metadata.

Run 503 note: live-worker authorization now denies proxy-backed array-prototype impostor `controls` evidence without reading object `get`, prototype, descriptor, or key traps.

Run 502 note: live-worker authorization now denies `Symbol.toStringTag` array-impostor `controls` evidence without reading spoofed index or length getters.

Run 501 note: live-worker authorization now denies revoked proxy-backed non-array `controls` evidence without throwing or falling back to built-in metadata.

Run 500 note: live-worker authorization now denies proxy-backed non-array `controls` evidence without reading object `get`, prototype, descriptor, or key traps.

Run 499 note: live-worker authorization now denies function-shaped `controls` evidence without invoking callable values or inspecting iterator metadata.

Run 498 note: live-worker authorization now denies proxy-backed and revoked proxy deployment-class impostors before inspecting hostile supplied controls.

Run 497 note: live-worker authorization now denies weak collection deployment-class impostors before inspecting hostile supplied controls.

Run 496 note: top-level Codex handoff truth now leads with the current Run 495 built-in deployment-class impostor boundary.

Run 495 note: live-worker authorization now denies built-in object-shaped deployment-class impostors, including maps, sets, weak collections, typed arrays, data views, promises, regular expressions, and errors, before inspecting hostile supplied controls.

Run 494 note: live-worker authorization now evaluates exact frozen control-entry evidence without reading inherited `Object.prototype` accessors for `id`, `status`, or `requirement`.

Latest protected local gate for Run 593: `$env:PLAYWRIGHT_PORT='3111'; .\scripts\local-gate.ps1` passed on 2026-05-23 with gate integrity, contracts, secrets, compliance, production, production-worker, observability, operator, platform, lint, typecheck, Prisma validate/generate, 59 Vitest files / 611 tests, Playwright smoke, and build green.

Run 581 note: live-worker authorization now proves exact frozen control-array evidence is evaluated without reading inherited `Array.prototype` indexed accessors beyond the frozen checklist entries.

This document is the quick reality check for planning. It complements `PLAN.md` and does not replace `docs/CANONICAL_IMPLEMENTATION_PLAN.md`.

Tests/Gates addendum: mutating-route auth coverage now includes assigned and whole-parenthesized type-asserted or `satisfies` direct `Request` constructor and `Request.prototype` aliases, parenthesized and whole-parenthesized type-asserted `globalThis` root member access for `Request` and `Reflect`, parenthesized `satisfies` local/root `globalThis` aliases for reflective body-reader paths, plus type-asserted and `satisfies` destructured local-`globalThis` `Object`/`Reflect`/`Request` aliases before body-reader checks. Live-worker control coverage now proves inherited `Object.prototype` accessors cannot influence exact frozen wrapper or control-entry evidence, inherited `Object.prototype` coercion metadata cannot influence exact frozen wrapper or control-entry evidence, inherited `Object.prototype` `Symbol.toStringTag` metadata cannot influence exact frozen authorization-wrapper or control-entry evidence, inherited `Array.prototype` indexed accessors beyond the frozen checklist entries, inherited non-index string or symbol metadata, inherited constructor metadata, inherited iteration-method metadata, inherited lookup-method metadata, inherited `every` metadata, inherited transform/reducer method metadata, inherited unscopables metadata, inherited concat-spreadable metadata, and inherited string-method symbol metadata cannot influence exact frozen control-array evidence, inherited `Symbol.toStringTag` accessors cannot influence deployment-class evidence, controls evidence, or authorization-wrapper metadata, own accessor-backed `Symbol.toStringTag` authorization-wrapper metadata cannot inspect hostile controls or read the tag getter, reflection-trapped proxy object deployment-class evidence cannot authorize before supplied controls are inspected, authorization-wrapper prototype, descriptor, key, and frozen-state reflection traps deny before hostile supplied controls are inspected, collection deployment-class values cannot authorize in proxy-backed or revoked proxy-backed form, Date deployment-class values cannot authorize in proxy-backed or revoked proxy-backed form, boxed primitive deployment-class values cannot authorize in proxy-backed or revoked proxy-backed form, array-buffer-shaped deployment-class values cannot authorize in proxy-backed or revoked proxy-backed form, promise and error-shaped deployment-class values cannot authorize in proxy-backed or revoked proxy-backed form, runtime-supported typed-array constructors cannot authorize as deployment-class evidence including proxy-backed and revoked proxy-backed deployment-class evidence, controls evidence, or authorization-wrapper impostors, runtime-supported Web-platform, WebAssembly, and Web Crypto records cannot authorize as proxy-backed or revoked proxy-backed deployment-class evidence, runtime-supported Web-platform records cannot authorize as ordinary, proxy-backed, or revoked proxy-backed controls evidence, runtime-supported WebAssembly records cannot authorize as ordinary, proxy-backed, or revoked proxy-backed controls evidence, and revoked proxy-backed runtime-supported Web Crypto controls evidence denies without object-trap inspection.

| Area | Backend/API State | Browser State | Main Gap | Next Action |
| --- | --- | --- | --- | --- |
| Contacts | Tenant-scoped contacts, consent fields, CSV import, tags/lists/segments foundations. | Product dashboard summary, `/dashboard/contacts` list/import plus archived restore links, `/dashboard/contacts/:contactId` local detail/edit/archive/restore/merge workspace, read-only operations views, and demo path coverage. | Merge is local-only and intentionally preserves source rows through soft archive; no advanced conflict review UI yet. | Keep merge local-only; revisit conflict review after product demo feedback. |
| Campaigns | Drafts, recipients, preflight, schedule/cancel records, scheduled-only local cancellation with conflict responses for existing non-scheduled campaigns, queue jobs, dummy worker path. | Product dashboard summary plus `/dashboard/campaigns` composer with fake-AI copy assist, recipient selection, preflight, local schedule, status table, `/dashboard/campaigns/:campaignId` draft edit/queued-cancel workflow, and product demo coverage. | No advanced campaign history or send-result drilldown beyond local lifecycle state. | Keep live sends blocked; add deeper reporting only after product demo feedback. |
| Inbox | Conversations, messages, assignment, notes, resolve/reopen, demo inbound, STOP/HELP parsing, and deterministic fake-AI summary/lead qualification endpoints. | Product dashboard summary, `/dashboard/inbox` list/thread workflow, local demo inbound, fake-AI insights, notes, assignment, resolve/reopen, read-only operations view, and product demo coverage. | No outbound reply send path, intentionally blocked until live/provider gates mature. | Keep product inbox local-only; revisit outbound reply UX only after live/provider gates mature. |
| Templates | Template model and APIs exist, including tenant-scoped detail/update. | Product dashboard summary, `/dashboard/templates` create/list workflow, `/dashboard/templates/:templateId` local detail/edit workflow, and read-only template operations view. | No delete/archive workflow, intentionally deferred until template lifecycle needs are clearer. | Keep local-only template edits; revisit lifecycle controls after product demo feedback. |
| Compliance | Profile/checklist APIs, readiness audit, opt-out foundations, central messaging gates. | Product dashboard summary, `/dashboard/compliance` readiness detail, compliance and readiness audit operations pages. | A2P, quiet-hours, consent evidence, and live-send policy still need production implementation. | Keep live campaign sends blocked; revisit production compliance depth only after product demo feedback. |
| Twilio/Provider | Webhook foundations, string-only and duplicate-free form payload enforcement, inbound address/body validation, status updates, provider metadata, credential readiness, gated live-test SMS. | Provider operations page plus `/demo` live-test SMS. | Full live campaign sending is intentionally not enabled. | Keep isolated test SMS; later harden Twilio adapter behind explicit gates. |
| AI | Deterministic fake provider and local AI endpoints that record local `AI_REQUEST` usage after successful fake output. | AI operations page plus `/dashboard/campaigns` fake-AI copy assist and `/dashboard/inbox` fake-AI summary/lead qualification using local endpoints. | No live AI provider or cost controls. | Keep fake AI for demo; defer live AI until product UI and cost gates exist. |
| Billing | Local usage events, billing account data, usage APIs, and endpoint-driven fake AI usage metering. | Billing/usage operations pages. | No Stripe, payment collection, invoices, or subscription lifecycle. | Defer until Phase 3 behind live billing gates. |
| Auth/RBAC | Demo current user, role helpers, tenant helpers, mutating-route role enforcement. | Demo-safe single-user experience. | No production auth provider. | Add real auth/RBAC after product flow stabilizes. |
| Queue/Worker | Durable jobs, tenant-scoped idempotency, dummy worker with send-time consent rechecks, all-marker production-like runtime blocking, optional BullMQ/Redis mirror and worker, a `WORKER_DEPLOYMENT_CLASS=local-demo` guard, fail-closed runtime-unknown `LIVE_MESSAGING_ENABLED` worker readiness, runtime-unknown public worker-readiness denial for malformed deployment-class values, and frozen executable metadata plus frozen-descriptor, enumerable indexed-data-slot exact-key-order, duplicate proxy-key denial on control arrays and authorization wrappers, accessor-backed, inherited, writable, configurable, and proxy-invalid indexed-slot denial, malformed primitive control-entry denial, non-ordinary array/date/function-shaped control-entry denial, sealed-but-writable, configurable-public-field, hidden-string-control-entry and hidden-symbol-control-entry metadata denial, custom iterator control-array metadata denial without iterator invocation, inherited array iterator, inherited iteration-method metadata, inherited lookup-method metadata, inherited every-method metadata, inherited transform/reducer-method metadata, inherited mutator/visitor-method metadata, inherited non-index metadata, inherited concat-spreadable metadata, and inherited array coercion metadata independence for exact frozen evidence, inherited control-entry accessor and coercion metadata independence for exact frozen evidence, symbol-keyed control-entry public-field impersonator denial, duplicate-key, proxy-invalid public-field-descriptor, malformed primitive public-field-value denial including malformed primitive status values, non-primitive public-field-value control-entry denial without coercion including boxed string `id`, `status`, and `requirement` values, and exact public-string matching for supplied control `id`, `status`, and `requirement` values without trimming or case normalization, missing/accessor/writable native length descriptor denial, nullish length-descriptor denial before indexed control reads, proxy-invalid configurable/enumerable length-descriptor denial without descriptor invariant leaks, exact checklist-size length descriptor requirement, mismatched, oversized safe-integer, boxed numeric, and non-coercive malformed primitive length-descriptor denial before indexed control reads, hostile length-descriptor denial before indexed control reads, exact-order control-entry public fields, plain-array and tampered-prototype-array denial, getter-safe, descriptor-valid proxy-wrapped exact evidence evaluation without `get` trap execution, array/entry/wrapper proxy-trap-safe denial for malformed or revoked evidence, malformed/decorated-input-safe including hidden string/symbol array metadata, ordinary-object-only supplied-control authorization, exact deployment-class string matching without trimming or case normalization including invisible Unicode escape and Unicode line/paragraph separator padding, unsupported/malformed-class evidence short-circuiting for primitive values including bigint plus object-shaped impostors including weak collections, inherited-coercion-hook objects, proxy-backed objects, and revoked proxy values without deployment-class coercion, exact-order own-enumerable frozen-public-field wrapper denial, authorization-wrapper full and mixed symbol-keyed public-field impersonator denial before supplied control inspection, non-enumerable wrapper public-field denial before control inspection, non-ordinary built-in object-shaped wrapper denial including maps, sets, weak collections, typed arrays, data views, promises, boxed primitives, dates, regular expressions, errors, weak references, finalization registries, and proxy-backed, reflection-trapped, or revoked proxy-backed built-in wrappers before control inspection, non-ordinary array/date/function-shaped, inherited-coercion-hook, and tampered-prototype authorization-wrapper denial before control inspection, malformed wrapper-key and wrapper-shape denial before control inspection including hidden string/symbol wrapper metadata, extensible-wrapper denial, writable/configurable/proxy-invalid wrapper-field denial across both public wrapper fields, malformed primitive, function-shaped, and object-shaped non-array controls-evidence denial including weak collections, data views, boxed primitives including boxed `Symbol` and boxed `BigInt`, dates, regular expressions, errors, URLs, URLSearchParams, weak references, finalization registries, proxy-backed map/set/weak-collection records, proxy-backed non-array records, proxy-backed typed-array records, proxy-backed data-view records, proxy-backed array-buffer records, proxy-backed shared-array-buffer records, proxy-backed promise records, proxy-backed boxed primitive records including boxed `Symbol` and boxed `BigInt`, proxy-backed date records, proxy-backed regular expression records, proxy-backed error records, proxy-backed URL records, proxy-backed URLSearchParams records, proxy-backed weak-reference records, proxy-backed finalization-registry records, revoked proxy-backed built-in records including boxed `Symbol` and boxed `BigInt`, proxy-backed array-prototype impostors, and revoked proxy-backed array-prototype impostors without coercion, fallback, callable invocation, or object-trap inspection, hostile array-like, iterable object, and own or inherited `Symbol.toStringTag` array-impostor controls-evidence denial without getter reads or iterator invocation, own or inherited `Symbol.toStringTag` authorization-wrapper metadata denial before hostile control inspection, malformed/decorated/proxy-trap-safe wrapper denial including authorization-wrapper descriptor traps, array length descriptor traps, and frozen-state traps, and nullish-control-evidence denial for the blocked `production-live-campaign` control checklist. | Queue operations page. | Worker execution remains local/demo-only; no production/live worker deployment class is authorized. | Keep live sends blocked; implement every `production-live-campaign` control before any live worker support. |
| Rate Limiting | Local in-memory API middleware. | Visible in operations status. | Not production-distributed. | Move to Redis or platform-backed limiter when production infrastructure is configured. |
| Operations Surfaces | Extensive inventory-backed read-only pages and tests, including frozen webhook operations metadata for local Twilio route/event coverage and no-impact boundaries. | Many `/settings/**` pages with compact related-link headers; `/settings/api` visibly marks route-level external-impact classification, with only `POST /api/demo/live-test-sms` marked external impact. | Operations UI has outgrown product UI. | Stop expanding operations pages unless they support release safety. |
| Tests/Gates | `npm run validate`, protected `.\scripts\local-gate.ps1`, unit tests, Playwright smoke/demo/product-demo, contract/secret/compliance/production gates, and production worker policy check. The Run 475 focused auth test passed on 2026-05-22; parenthesized and whole-parenthesized type-asserted `globalThis` root member aliases for `Request` and `Reflect`, plus type-asserted destructured `globalThis` `Object`/`Reflect`/`Request` aliases, are now covered before mutating-route body-reader role-gate checks. API operations reverse coverage now reuses the shared contract route-method extractor, and the contract scanner masks comments, quoted strings, template literals, and regex literals, including escaped-regex bodies and character classes, before collecting implemented route methods. API operations unit coverage plus seeded investor demo coverage verify the visible `/settings/api` live-test SMS route row carries its external-impact classification and Twilio allowlist-gate safety copy. Campaign, template, contact, inbox/demo inbound, fake-AI, billing usage, campaign preflight, compliance settings, provider number metadata, provider settings, and live-test SMS mutation route coverage verifies malformed JSON returns `400` before local repository work, CSV parsing, import mutations, inbound message creation, assignment, notes, resolve mutations, conversation lookup, fake provider execution, local AI usage metering, local usage records, local preflight repository work, compliance updates, readiness audit writes, provider metadata writes, provider settings rendering, or gated live-test send helpers can run. Readiness audit and provider credential rotation route coverage verifies unsupported JSON/CSV export query filters return `400` before local reads or CSV serialization, while supported filters stay bounded to tenant-scoped local metadata. Compliance/provider mutating-route coverage verifies role denials return before request-body parsing and successful admin requests remain local metadata changes only. Campaign schedule/cancel route coverage verifies role denials and missing campaigns return before local queue or cancel work, existing non-scheduled campaign cancellation returns `409` without queue or campaign mutations, and successful paths do not call providers, execute workers, bill, notify, send SMS, or enable live features. Webhook helper coverage verifies signed Twilio parsing, duplicate/unsupported field rejection, normalization, idempotency, and terminal timestamp cleanup. Mutating-route auth coverage now normalizes TypeScript type-asserted, `satisfies`, non-null, optional direct property alias, request-alias property reader, assigned reader-name alias, cloned request body-reader expressions, `Request`, `globalThis.Request`, `Request.prototype`, and `globalThis.Object`/`globalThis.Reflect` alias forms before role-gate ordering checks; live-worker control coverage remains extensive for the blocked `production-live-campaign` checklist and live-worker authorization stays unsupported. | Browser smoke, seeded investor demo path, and seeded product dashboard with opt-in rate, local usage, and fake-AI usage visibility plus contacts import/detail/archive/restore/merge, campaign fake-AI copy/schedule/detail/edit/cancel, inbox thread, template create/detail/edit, analytics detail with scheduled-campaign and fake-AI usage-share visibility, and compliance readiness paths. | Product demo now covers the main local workflows; production readiness remains intentionally gated. | Keep local gate green and defer live-provider implementation until production worker controls are executable. |
| Docs/Planning | Canonical plan, contracts, local gate docs, large historical run logs, new model planning captures. | N/A | Plan needs to stay short enough to guide new agents. | Keep `PLAN.md`, this matrix, and `planning/CONSENSUS-2026-05-21.md` concise. |
Run 582 note: live-worker authorization now proves exact frozen control-array evidence is evaluated without reading inherited non-index string or symbol metadata on `Array.prototype`.

Run 583 note: live-worker authorization now proves exact frozen control-array evidence is evaluated without reading inherited `Array.prototype.constructor` metadata.

Run 584 note: live-worker authorization now proves exact frozen control-array evidence is evaluated without reading inherited `Array.prototype[Symbol.unscopables]` metadata.

Run 587 note: live-worker authorization now denies own accessor-backed `Symbol.toStringTag` metadata on otherwise valid control arrays without reading the getter.

Run 586 note: live-worker authorization now proves exact frozen control-array evidence is evaluated without reading inherited `Array.prototype` string-method symbol metadata.

Run 585 note: live-worker authorization now proves exact frozen control-array evidence is evaluated without reading inherited `Array.prototype[Symbol.isConcatSpreadable]` metadata.
