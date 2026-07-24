# Carrier Canary Policy & Verification Guide

Status: Active Operational Policy  
Milestone: M11 (Release Assurance)

## 1. Overview & Objectives

The **Carrier Canary Verification Policy** governs all live transmission of SMS/MMS messages to external mobile telecommunication networks (such as Twilio CPaaS or direct carrier routes). 

Because live carrier transmissions incur real monetary charges, carrier registration overhead, and network delivery impact, live carrier canary tests are **strictly human-gated** and subject to rigorous safety controls.

---

## 2. Mandatory Safety Invariants

1. **Demo-Safe Default in Automated CI**:
   - Automated CI build pipelines, pre-merge validation runners (`npm run validate`), and local development environments MUST NEVER send live carrier messages.
   - `CARRIER_CANARY_AUTHORIZED` defaults to `false`.
   - `MESSAGING_PROVIDER` defaults to `dummy`.
   - In any environment where `CI=true` or `CARRIER_CANARY_AUTHORIZED!=true`, live carrier sends are completely disabled.

2. **Explicit Human Authorization Requirement**:
   - Executing a live carrier canary message requires explicit manual operator authorization by specifying `CARRIER_CANARY_AUTHORIZED=true` alongside valid production credentials.
   - Attempting a canary send without explicit authorization MUST fail-closed immediately.

3. **Strict Cost Cap Enforcement ($1.00 USD Limit)**:
   - Each canary execution batch is hard-capped at an estimated total cost of **$1.00 USD**.
   - Standard domestic SMS rates are estimated at ~$0.0079 USD per segment. A canary batch of up to 10 test messages falls well below the $1.00 USD cap (~$0.079 USD).
   - If the estimated cost exceeds $1.00 USD, or if request volume exceeds the canary limit, the canary runner MUST abort execution before initiating provider mutations.

4. **Designated Target Device Policy**:
   - Canary sends MUST target an explicitly authorized operator-owned test phone number.
   - Broad customer contact lists, unverified numbers, or multi-tenant database pools are strictly forbidden target lists for canary sends.

---

## 3. Pre-Flight Verification Checklist

Before executing an authorized live carrier canary send, an operator MUST verify:

- [ ] `CARRIER_CANARY_AUTHORIZED=true` set in environment.
- [ ] `LIVE_MESSAGING_ENABLED=true` set in environment.
- [ ] `MESSAGING_PROVIDER=twilio` set in environment.
- [ ] `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` populated and valid.
- [ ] `TWILIO_FROM_NUMBER` (E.164 format) or `TWILIO_MESSAGING_SERVICE_SID` populated and registered.
- [ ] `SECRETS_MASTER_KEY` (256-bit AES key) configured.
- [ ] Estimated batch cost <= $1.00 USD limit.
- [ ] Operator has access to target test device to verify end-to-end receipt.

---

## 4. Programmatic Canary Verification Engine

SignalStack SMS includes a dedicated carrier canary verification engine:
- **Policy Engine**: `lib/operations/carrier-canary.ts`
- **Verification Runner**: `scripts/carrier-canary-check.ts`
- **Unit Suite**: `tests/unit/operations/carrier-canary.test.ts`

### Execution

```bash
# Run canary policy check (runs in demo-safe mode by default)
npm run carrier-canary:check

# Run full release validation suite
npm run validate
```

---

## 5. Post-Canary Reversal & Security

Immediately following a live canary run:
1. Revoke `CARRIER_CANARY_AUTHORIZED=true` from active shell/session environment.
2. Confirm carrier status callbacks correlated correctly to the database outbox attempt record.
3. Verify account balance usage did not exceed the $1.00 USD threshold.
