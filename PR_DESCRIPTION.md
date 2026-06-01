🧪 Add tests for `getRedisQueueConfig` and `redisConnectionFromUrl`

🎯 **What:**
There was a testing gap for `getRedisQueueConfig` and `redisConnectionFromUrl` in `lib/queue/redis.ts`. Added comprehensive unit tests to close this gap.

📊 **Coverage:**
Covered the following scenarios:
* `getRedisQueueConfig`: correctly returns `REDIS_URL` from the provided env, handles missing `REDIS_URL` values (returns undefined), and correctly defaults to `process.env`.
* `redisConnectionFromUrl`: accurately parses standard Redis URLs (with host, port, username, password, and db index), handles missing default values (e.g. falls back to port `6379`), handles secure URL protocols (`rediss://`), and gracefully parses Redis URLs containing just a password.

✨ **Result:**
Test coverage significantly improved for Redis configuration and connectivity utility parameters, preventing regressions related to background worker bootstrapping.
