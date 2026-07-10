1. **Goal**: Add missing test coverage for `lib/db/repositories/campaigns.ts`. Currently, `scheduleCampaign`, `cancelCampaign`, and `preflightCampaign` are tested in separate files (`tests/unit/db/campaigns-schedule.test.ts`, `tests/unit/db/campaigns-cancel.test.ts`, `tests/unit/db/campaigns-preflight.test.ts`), but the remaining functions in `lib/db/repositories/campaigns.ts` are untested.

2. **Untested functions to cover**:
   - `listCampaigns`
   - `listCampaignsWithDelivery`
   - `getCampaign`
   - `getCampaignWithMessages`
   - `createCampaign`
   - `updateCampaign`

3. **Plan**:
   - Create a new file `tests/unit/db/campaigns.test.ts` (or append to existing patterns but it seems best to create a general one for these CRUD methods).
   - Mock Prisma client similar to the existing tests.
   - Write tests for `listCampaigns` to ensure it calls `prisma.campaign.findMany` with the correct arguments.
   - Write tests for `listCampaignsWithDelivery` to ensure it calls `prisma.campaign.findMany` with delivery includes.
   - Write tests for `getCampaign` to ensure it calls `prisma.campaign.findFirst` correctly.
   - Write tests for `getCampaignWithMessages` to check if it returns null when missing, and queries `message.findMany` when found.
   - Write tests for `createCampaign` to verify transaction, `campaign.create`, and `syncCampaignRecipients`.
   - Write tests for `updateCampaign` to verify transaction, fetch existing, check draft status, `campaign.update`, and `syncCampaignRecipients` conditionally.
