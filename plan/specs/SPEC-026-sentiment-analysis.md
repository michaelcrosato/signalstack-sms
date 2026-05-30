# SPEC-026 — Conversation Sentiment Analysis and AI Categorization Seam

- **Status:** Todo · **Priority:** P2 · **Pillar:** Features · **Effort:** M

## Description
Provide automatic sentiment analysis and classification for incoming messages. When an inbound message is received, the AI provider seam can optionally classify the incoming text into a sentiment score (e.g. POSITIVE, NEGATIVE, NEUTRAL) and category (e.g. INQUIRY, OPT_OUT, SUPPORT, SALUTATION), storing these metadata values directly inside the conversation context.

## Prereqs / deps
Requires AI provider adapter seam (`lib/ai/provider.ts`) and conversations/inbox tables.

## Implementation approach
1. Add nullable fields `sentiment` and `category` to the `Conversation` model in `prisma/schema.prisma` or manage them dynamically at the app layer (using tags/metadata logs).
2. Wire an async analysis hook inside inbound message processing (`createDemoInboundMessage` or queue jobs).
3. Call `resolveAiProvider().analyzeConversationSentiment()` using a fake provider default and flag-gated live Anthropic provider.
4. Update the inbox dashboard workspace to surface sentiment tags (e.g., green for POSITIVE, red for NEGATIVE).
5. Write unit tests checking analysis classification, error containment, fallback values, and metadata persistence.

## Acceptance criteria
- [ ] Inbound messages optionally trigger AI analysis without blocking message creation.
- [ ] Conversations are successfully updated with detected sentiment and category tags.
- [ ] Surfaces visual indicators/tags inside the inbox view correctly.
- [ ] Unit tests cover various sentiments, fallback modes, and async execution guards.
- [ ] `npm run validate` runs and exits 0.

## Test strategy
- Unit tests under `tests/unit/ai/sentiment-analysis.test.ts` verifying classifier outcomes, mock payloads, and database updates.
