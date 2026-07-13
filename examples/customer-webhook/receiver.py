#!/usr/bin/env python3
"""Dependency-free Python 3 SignalStack customer-webhook receiver and vector verifier."""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

SIGNING_DOMAIN = b"signalstack/customer-webhook-signature/v1\0"
DEFAULT_TOLERANCE_SECONDS = 300
MAX_BODY_BYTES = 1024 * 1024
IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,190}$")
EVENT_TYPE_PATTERN = re.compile(r"^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$")
SIGNATURE_PATTERN = re.compile(r"^v1=([a-f0-9]{64})$")
SECRET_PATTERN = re.compile(r"^whsec_([A-Za-z0-9_-]{43})$")
REQUIRED_HEADERS = (
    "content-type",
    "x-signalstack-event-id",
    "x-signalstack-event-type",
    "x-signalstack-delivery-id",
    "x-signalstack-timestamp",
    "x-signalstack-secret-version",
    "x-signalstack-signature",
)


class WebhookVerificationError(Exception):
    pass


@dataclass(frozen=True)
class VerifiedWebhook:
    event_id: str
    event_type: str
    delivery_id: str
    secret_version: int
    event: Mapping[str, Any]


def verify_customer_webhook(
    raw_headers: Iterable[tuple[str, str]],
    raw_body: bytes,
    secrets_by_version: Mapping[int, str],
    now_seconds: int | None = None,
    tolerance_seconds: int = DEFAULT_TOLERANCE_SECONDS,
) -> VerifiedWebhook:
    """Verify untouched body bytes before parsing; raw_headers must preserve duplicate fields."""
    headers = _read_required_single_headers(raw_headers)
    if headers["content-type"].split(";", 1)[0].strip().lower() != "application/json":
        raise WebhookVerificationError()
    if not isinstance(raw_body, bytes) or len(raw_body) > MAX_BODY_BYTES:
        raise WebhookVerificationError()

    timestamp_text = headers["x-signalstack-timestamp"]
    timestamp = _canonical_integer(timestamp_text, allow_zero=True)
    secret_version = _canonical_integer(
        headers["x-signalstack-secret-version"], allow_zero=False
    )
    current_time = int(time.time()) if now_seconds is None else now_seconds
    timestamp_valid = (
        isinstance(current_time, int)
        and current_time >= 0
        and isinstance(tolerance_seconds, int)
        and 0 <= tolerance_seconds <= 3600
        and abs(current_time - timestamp) <= tolerance_seconds
    )

    secret = _parse_secret(secrets_by_version.get(secret_version, ""))
    expected = (
        hmac.new(
            secret,
            SIGNING_DOMAIN + timestamp_text.encode("ascii") + b"." + raw_body,
            hashlib.sha256,
        ).digest()
        if secret is not None
        else bytes(32)
    )
    signature_match = SIGNATURE_PATTERN.fullmatch(headers["x-signalstack-signature"])
    candidate = bytes.fromhex(signature_match.group(1)) if signature_match else bytes(32)
    signature_valid = hmac.compare_digest(expected, candidate)
    if not timestamp_valid or secret is None or signature_match is None or not signature_valid:
        raise WebhookVerificationError()

    event_id = headers["x-signalstack-event-id"]
    event_type = headers["x-signalstack-event-type"]
    delivery_id = headers["x-signalstack-delivery-id"]
    if not (
        IDENTIFIER_PATTERN.fullmatch(event_id)
        and IDENTIFIER_PATTERN.fullmatch(delivery_id)
        and EVENT_TYPE_PATTERN.fullmatch(event_type)
    ):
        raise WebhookVerificationError()

    # Parsing is deliberately after the constant-time comparison over the exact received bytes.
    try:
        event = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise WebhookVerificationError() from error
    if not _is_event(event) or event["id"] != event_id or event["type"] != event_type:
        raise WebhookVerificationError()
    return VerifiedWebhook(event_id, event_type, delivery_id, secret_version, event)


def parse_secrets_environment(environment: Mapping[str, str] = os.environ) -> dict[int, str]:
    encoded = environment.get("SIGNALSTACK_WEBHOOK_SECRETS_JSON")
    if encoded:
        try:
            parsed = json.loads(encoded)
        except json.JSONDecodeError as error:
            raise ValueError("SIGNALSTACK_WEBHOOK_SECRETS_JSON must be a JSON object") from error
        if not isinstance(parsed, dict) or not parsed:
            raise ValueError("SIGNALSTACK_WEBHOOK_SECRETS_JSON must be a non-empty JSON object")
        result: dict[int, str] = {}
        for version_text, secret in parsed.items():
            version = _canonical_integer(str(version_text), allow_zero=False)
            if not isinstance(secret, str) or _parse_secret(secret) is None:
                raise ValueError("SIGNALSTACK_WEBHOOK_SECRETS_JSON contains an invalid signing secret")
            result[version] = secret
        return result

    secret = environment.get("SIGNALSTACK_WEBHOOK_SECRET", "")
    if _parse_secret(secret) is None:
        raise ValueError("SIGNALSTACK_WEBHOOK_SECRET is required")
    version = _canonical_integer(
        environment.get("SIGNALSTACK_WEBHOOK_SECRET_VERSION", "1"), allow_zero=False
    )
    return {version: secret}


class Receiver(BaseHTTPRequestHandler):
    # Demonstration only. Production must atomically claim event IDs in durable storage before effects.
    seen_event_ids: set[str] = set()

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        if self.path != "/signalstack/webhooks":
            self._respond(404)
            return
        lengths = self.headers.get_all("Content-Length", failobj=[])
        if len(lengths) != 1 or not re.fullmatch(r"(0|[1-9]\d{0,6})", lengths[0]):
            self._respond(400)
            return
        length = int(lengths[0])
        if length > MAX_BODY_BYTES:
            self._respond(413)
            return
        raw_body = self.rfile.read(length)
        if len(raw_body) != length:
            self._respond(400)
            return
        try:
            verified = verify_customer_webhook(
                list(self.headers.raw_items()), raw_body, parse_secrets_environment()
            )
        except (WebhookVerificationError, ValueError):
            self._respond(400)
            return

        if verified.event_id in self.seen_event_ids:
            self._respond(204)
            return
        self.seen_event_ids.add(verified.event_id)
        print(
            json.dumps(
                {
                    "acceptedEventId": verified.event_id,
                    "eventType": verified.event_type,
                    "deliveryId": verified.delivery_id,
                    "secretVersion": verified.secret_version,
                },
                separators=(",", ":"),
            )
        )
        self._respond(204)

    def log_message(self, _format: str, *_arguments: Any) -> None:
        return

    def _respond(self, status: int) -> None:
        self.send_response(status)
        self.send_header("Content-Length", "0")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()


def verify_fixture(path: Path) -> None:
    vector = json.loads(path.read_text(encoding="utf-8"))
    body = base64.b64decode(vector["rawBodyBase64"], validate=True)
    headers = list(vector["headers"].items())
    verified = verify_customer_webhook(
        headers,
        body,
        {int(vector["secretVersion"]): vector["secret"]},
        int(vector["nowSeconds"]),
        int(vector["toleranceSeconds"]),
    )
    if verified.event_id != vector["eventId"] or verified.event_type != vector["eventType"]:
        raise WebhookVerificationError()
    print("Python customer-webhook golden vector passed.")


def _read_required_single_headers(
    raw_headers: Iterable[tuple[str, str]],
) -> dict[str, str]:
    values: dict[str, list[str]] = {}
    for name, value in raw_headers:
        values.setdefault(name.lower(), []).append(value)
    result: dict[str, str] = {}
    for name in REQUIRED_HEADERS:
        matches = values.get(name, [])
        if len(matches) != 1 or _has_control(matches[0]):
            raise WebhookVerificationError()
        result[name] = matches[0]
    return result


def _parse_secret(value: str) -> bytes | None:
    match = SECRET_PATTERN.fullmatch(value)
    if not match:
        return None
    try:
        decoded = base64.urlsafe_b64decode(match.group(1) + "=")
    except (ValueError, base64.binascii.Error):
        return None
    canonical = base64.urlsafe_b64encode(decoded).decode("ascii").rstrip("=")
    return decoded if len(decoded) == 32 and canonical == match.group(1) else None


def _canonical_integer(value: str, allow_zero: bool) -> int:
    if not re.fullmatch(r"0|[1-9]\d{0,11}", value):
        raise WebhookVerificationError()
    parsed = int(value)
    if parsed < (0 if allow_zero else 1):
        raise WebhookVerificationError()
    return parsed


def _has_control(value: str) -> bool:
    return any(ord(character) < 32 or ord(character) == 127 for character in value)


def _is_event(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and isinstance(value.get("apiVersion"), str)
        and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value["apiVersion"])
        and isinstance(value.get("id"), str)
        and isinstance(value.get("type"), str)
        and isinstance(value.get("occurredAt"), str)
        and "data" in value
    )


def main(arguments: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-fixture", type=Path)
    parser.add_argument("--port", type=int, default=8787)
    options = parser.parse_args(arguments)
    if options.verify_fixture:
        verify_fixture(options.verify_fixture)
        return
    if options.port < 1 or options.port > 65535:
        raise SystemExit("--port must be between 1 and 65535")
    server = ThreadingHTTPServer(("127.0.0.1", options.port), Receiver)
    print(
        f"SignalStack webhook receiver listening at "
        f"http://127.0.0.1:{options.port}/signalstack/webhooks"
    )
    server.serve_forever()


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, WebhookVerificationError) as error:
        raise SystemExit("Customer webhook receiver failed.") from error
