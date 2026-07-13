# Twilio provider callback examples

Provider callbacks are inbound `application/x-www-form-urlencoded` requests to SignalStack. They use
Twilio's signature boundary and must not be verified with the customer-webhook HMAC protocol.

This dependency-free Node example is dry-run by default, permits localhost targets only, and never contacts
Twilio or another provider. Its token must match the local SignalStack process but is never printed:

```bash
export SIGNALSTACK_BASE_URL=http://127.0.0.1:3000
export TWILIO_AUTH_TOKEN='<local callback token configured on the server>'

npx tsx examples/provider-callback/twilio-callback.ts --kind inbound
npx tsx examples/provider-callback/twilio-callback.ts --kind status

# Explicitly submit the signed form to localhost:
npx tsx examples/provider-callback/twilio-callback.ts --kind inbound --send
```

For a status callback, set `TWILIO_MESSAGE_SID` to an existing local message's provider ID if you want the
handler to apply the transition. The placeholder otherwise demonstrates parsing/signature behavior only.

Twilio signs the exact externally visible callback URL followed by every form parameter, sorted by field
name, using HMAC-SHA-1 and the account auth token. SignalStack validates all string-only form fields,
including unknown provider fields, and rejects duplicate field names before signature validation. In a real
deployment, configure the public HTTPS URL exactly as Twilio sees it; reverse-proxy scheme, host, port, or path
drift changes the signature input. Never place the auth token in a URL, source file, fixture, or command output.

Protocol authority: [`contracts/CONTRACT-WEBHOOKS.md`](../../contracts/CONTRACT-WEBHOOKS.md) and
[`docs/WEBHOOKS.md`](../../docs/WEBHOOKS.md).
