# Integration examples

- [`public-api/`](public-api/) — curl, dependency-free Node/TypeScript, and dependency-free Python clients.
- [`customer-webhook/`](customer-webhook/) — raw-body HMAC verification receivers and a shared golden vector.
- [`provider-callback/`](provider-callback/) — local Twilio inbound/status form and signature examples.

All defaults are localhost-safe and demo/dummy-only. No example embeds a production secret or contacts a
provider. Run `npm run examples:check` to verify the examples against the implementation contract.
