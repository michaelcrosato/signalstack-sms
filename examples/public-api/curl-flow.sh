#!/usr/bin/env bash
set -euo pipefail

# Run only against the default demo/dummy profile. A live direct worker may deliver accepted Twilio work.
# Keep tracing disabled because Authorization headers and the one-time rotated key are sensitive.
set +x

: "${SIGNALSTACK_API_KEY:?Set SIGNALSTACK_API_KEY to a one-time-created M3 API key.}"
SIGNALSTACK_BASE_URL="${SIGNALSTACK_BASE_URL:-http://127.0.0.1:3000}"
SIGNALSTACK_EXAMPLE_PHONE="${SIGNALSTACK_EXAMPLE_PHONE:-+15555550123}"

case "$SIGNALSTACK_BASE_URL" in
  http://*|https://*) ;;
  *) echo "SIGNALSTACK_BASE_URL must use http or https." >&2; exit 1 ;;
esac
[[ "$SIGNALSTACK_API_KEY" =~ ^ss_api_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$ ]] || {
  echo "SIGNALSTACK_API_KEY is malformed." >&2
  exit 1
}

RUN_ID="$(date +%s)-$$"
CONTACT_KEY="curl-contact-${RUN_ID}"
MESSAGE_KEY="curl-message-${RUN_ID}"
ROTATE_KEY="curl-rotate-${RUN_ID}"
REVOKE_KEY="curl-revoke-${RUN_ID}"
ORIGINAL_API_KEY="$SIGNALSTACK_API_KEY"

json_field() {
  local field_path="$1"
  node -e '
    const fs = require("node:fs");
    let value = JSON.parse(fs.readFileSync(0, "utf8"));
    for (const part of process.argv[1].split(".")) value = value[part];
    if (typeof value !== "string") throw new Error("Expected a string JSON field.");
    process.stdout.write(value);
  ' "$field_path"
}

curl_with_bearer() {
  local api_key="$1"
  shift
  [[ "$api_key" =~ ^ss_api_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$ ]] || {
    echo "Refusing to use a malformed API key." >&2
    return 1
  }
  # Read the sensitive header from stdin so the bearer never appears in curl's process arguments.
  curl "$@" --config - <<EOF
header = "Authorization: Bearer ${api_key}"
EOF
}

post_json() {
  local path="$1" idempotency_key="$2" body="$3" api_key="${4:-$SIGNALSTACK_API_KEY}"
  curl_with_bearer "$api_key" --silent --show-error --fail-with-body \
    --request POST "${SIGNALSTACK_BASE_URL}${path}" \
    --header "Content-Type: application/json" \
    --header "Idempotency-Key: ${idempotency_key}" \
    --data "$body"
}

post_without_body() {
  local path="$1" idempotency_key="$2" api_key="${3:-$SIGNALSTACK_API_KEY}"
  curl_with_bearer "$api_key" --silent --show-error --fail-with-body \
    --request POST "${SIGNALSTACK_BASE_URL}${path}" \
    --header "Idempotency-Key: ${idempotency_key}"
}

expect_invalid_key() {
  local api_key="$1" status
  status="$(curl_with_bearer "$api_key" --silent --show-error --output /dev/null --write-out '%{http_code}' \
    "${SIGNALSTACK_BASE_URL}/api/v1/api-keys/current")"
  test "$status" = "401" || {
    echo "Expected revoked/rotated key denial, received HTTP ${status}." >&2
    exit 1
  }
}

export SIGNALSTACK_EXAMPLE_PHONE
CONTACT_BODY="$(node -e '
  process.stdout.write(JSON.stringify({
    phone: process.env.SIGNALSTACK_EXAMPLE_PHONE,
    displayName: "M3 local curl example",
    consentStatus: "OPTED_IN",
    optInSource: "documented_local_example",
    consentCapturedAt: new Date().toISOString(),
    consentMethod: "documented_test_fixture",
    consentDisclosure: "Local dummy-provider integration example; no carrier message is sent."
  }));
')"
CONTACT_RESPONSE="$(post_json "/api/v1/contacts" "$CONTACT_KEY" "$CONTACT_BODY")"
CONTACT_ID="$(printf '%s' "$CONTACT_RESPONSE" | json_field "data.id")"

export CONTACT_ID
MESSAGE_BODY="$(node -e '
  process.stdout.write(JSON.stringify({
    contactId: process.env.CONTACT_ID,
    body: "SignalStack dummy integration message. No carrier call is made."
  }));
')"
MESSAGE_RESPONSE="$(post_json "/api/v1/messages" "$MESSAGE_KEY" "$MESSAGE_BODY")"
REPLAY_RESPONSE="$(post_json "/api/v1/messages" "$MESSAGE_KEY" "$MESSAGE_BODY")"
MESSAGE_ID="$(printf '%s' "$MESSAGE_RESPONSE" | json_field "data.message.id")"
REPLAY_MESSAGE_ID="$(printf '%s' "$REPLAY_RESPONSE" | json_field "data.message.id")"
test "$MESSAGE_ID" = "$REPLAY_MESSAGE_ID" || {
  echo "Idempotent message retry returned a different message ID." >&2
  exit 1
}
printf '%s' "$MESSAGE_RESPONSE" | node -e '
  const fs = require("node:fs");
  const message = JSON.parse(fs.readFileSync(0, "utf8")).data.message;
  if (message.transport !== "dummy" || message.applicationStatus !== "SENT" ||
      message.attemptCount !== 1 || message.latestAttemptStatus !== "SUCCEEDED" ||
      message.requiresReview !== false) {
    throw new Error("Example must run against the deterministic dummy lifecycle.");
  }
'

STATUS_RESPONSE="$(curl_with_bearer "$SIGNALSTACK_API_KEY" --silent --show-error --fail-with-body \
  "${SIGNALSTACK_BASE_URL}/api/v1/messages/${MESSAGE_ID}/status")"
DELIVERY_STATUS="$(printf '%s' "$STATUS_RESPONSE" | json_field "data.deliveryStatus.status")"

# Rotation reveals the replacement once. Keep it only in this process and never print it.
ROTATE_RESPONSE="$(post_without_body "/api/v1/api-keys/current/rotate" "$ROTATE_KEY")"
SIGNALSTACK_API_KEY="$(printf '%s' "$ROTATE_RESPONSE" | json_field "data.token")"
expect_invalid_key "$ORIGINAL_API_KEY"

curl_with_bearer "$SIGNALSTACK_API_KEY" --silent --show-error --fail-with-body \
  --request DELETE "${SIGNALSTACK_BASE_URL}/api/v1/api-keys/current" \
  --header "Idempotency-Key: ${REVOKE_KEY}" >/dev/null
expect_invalid_key "$SIGNALSTACK_API_KEY"

printf 'contact=%s message=%s status=%s transport=dummy attempt=1 review=no idempotent=yes old-key-denied=yes revoked-key-denied=yes\n' \
  "$CONTACT_ID" "$MESSAGE_ID" "$DELIVERY_STATUS"
