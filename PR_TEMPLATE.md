Title: ⚡ Optimize syncCampaignRecipients to use createMany (fix N+1)

💡 **What:**
Replaced the sequential `findFirst` and `create` loop over unique `contactIds` in `syncCampaignRecipients` (`lib/db/repositories/campaigns.ts`) with a single batched `findMany` followed by `createMany`.

🎯 **Why:**
The original implementation had an N+1 query problem, doing database validation and insertion iteratively. For each contact ID passed, it made two sequential queries to the database. For campaigns with many contacts, this could cause severe CPU and I/O latency. Changing to a bulk strategy optimizes this execution pattern by aggregating validation and creation into two single operations, drastically reducing database overhead.

📊 **Measured Improvement:**
Since the local PostgreSQL container could not be fully spun up in this environment (Daemon Overlay FS Error), an algorithmic script mockup simulation (`scripts/benchmark-sync.ts`) was used. It showed that reducing an O(N) database operational set of loops down to O(1) batched operations yielded a 99.50% reduction in loop latency over 200 items (simulating 2ms round-trip latency, execution drops from 800+ ms down to <5ms).
