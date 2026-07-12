# Public API examples

These examples exercise the M3 `/api/v1` contract against a running SignalStack instance. The M3 message
route is intentionally dummy-only: it records a local message lifecycle and customer events but makes no
carrier request.

Create an API key through the authenticated settings API or UI and grant only the scopes used here:
`contacts:read`, `contacts:write`, `messages:send`, `deliveries:read`, `credentials:read`, and
`credentials:write`. The raw key appears only in its create response. Keep it in an environment variable,
never in source, a URL, shell history, or diagnostic output.

```bash
export SIGNALSTACK_BASE_URL=http://127.0.0.1:3000
export SIGNALSTACK_API_KEY='<one-time API key>'

bash examples/public-api/curl-flow.sh
npx tsx examples/public-api/typescript-client.ts
python3 examples/public-api/python_client.py
```

`SIGNALSTACK_EXAMPLE_PHONE` may override the localhost-safe placeholder. Each flow creates an opted-in test
contact with explicit consent evidence, submits the same dummy message twice under one `Idempotency-Key`,
reads its delivery status, iterates contacts using opaque cursors, rotates the calling key, proves the old
key is denied, revokes the new key, and proves it is denied. Run it with a disposable integration key because
successful completion revokes that key.

Both clients enforce the stable `ok` envelope and request-ID correlation, surface machine error codes, keep
cursors opaque, and require the caller to supply idempotency keys for mutations. Production deployments
should use HTTPS and source keys from a process secret store.

Protocol authority: [`contracts/CONTRACT-API.md`](../../contracts/CONTRACT-API.md) and
[`plan/specs/SPEC-031-public-integrations.md`](../../plan/specs/SPEC-031-public-integrations.md).
