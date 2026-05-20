# Queue Contract

Owner: backend-data.

Jobs must use validated payloads and idempotency keys.

## Milestone 4 Foundation

Queue job records are persisted in `QueueJob` before any worker/provider behavior:

- `type`: `SCHEDULED_CAMPAIGN`
- `status`: `QUEUED`, `CANCELLED`, `COMPLETED`, `FAILED`
- `idempotencyKey`: unique stable key for retries
- `payload`: validated JSON payload
- `runAt`: scheduled execution time

`POST /api/campaigns/:campaignId/schedule` creates or updates a queued job only after campaign preflight passes. `POST /api/campaigns/:campaignId/cancel` marks queued jobs cancelled and pauses the campaign.

Milestone 4 does not call live providers.

## Post-MVP Local Worker Foundation

`npm run worker` processes due `SCHEDULED_CAMPAIGN` jobs only when `MESSAGING_PROVIDER=dummy` and `LIVE_MESSAGING_ENABLED` is not `true`.

- The worker uses validated version-1 scheduled campaign payloads.
- Invalid payloads or missing scheduled campaigns are marked `FAILED`.
- Valid due jobs create idempotent outbound `Message` rows through the dummy provider.
- Completed jobs are marked `COMPLETED`; campaigns are marked `COMPLETED`.
- The worker must not call Twilio or any live provider.
