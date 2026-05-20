# Provider Adapter Contract

Owner: integrations-ai.

Default provider is `dummy`. Live provider calls are blocked unless `LIVE_MESSAGING_ENABLED=true` and future compliance gates pass.

Required interface: provider name, deterministic send input, send result, and idempotency key.
