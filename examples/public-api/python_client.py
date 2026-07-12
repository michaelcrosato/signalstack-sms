#!/usr/bin/env python3
"""Dependency-free Python 3 client for the SignalStack /api/v1 integration flow."""

from __future__ import annotations

import json
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any, Generator, Mapping
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen


@dataclass(frozen=True)
class ApiResult:
    data: Any
    meta: Mapping[str, Any]
    status: int
    replayed: bool


class SignalStackApiError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        request_id: str | None,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.request_id = request_id
        self.details = details


class SignalStackClient:
    """Small stdlib-only client. API keys stay in memory and never enter URLs or output."""

    def __init__(self, base_url: str, api_key: str, timeout_seconds: float = 10.0) -> None:
        self.base_url = _normalize_base_url(base_url)
        self._api_key = _require_api_key(api_key)
        if timeout_seconds <= 0 or timeout_seconds > 120:
            raise ValueError("timeout_seconds must be greater than zero and at most 120")
        self.timeout_seconds = timeout_seconds

    def request(
        self,
        path: str,
        method: str = "GET",
        body: Mapping[str, Any] | None = None,
        idempotency_key: str | None = None,
        request_id: str | None = None,
    ) -> ApiResult:
        if not path.startswith("/api/v1/") or path.startswith("//"):
            raise ValueError("client paths must be relative /api/v1/ paths")
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self._api_key}",
        }
        encoded_body = None
        if body is not None:
            encoded_body = json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        if request_id:
            headers["X-Request-Id"] = request_id

        request = Request(
            f"{self.base_url}{path}", data=encoded_body, headers=headers, method=method
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                return self._parse_response(response.status, response.headers, response.read())
        except HTTPError as error:
            return self._parse_response(error.code, error.headers, error.read())

    def iterate_collection(
        self, path: str, collection_field: str, limit: int = 50
    ) -> Generator[Mapping[str, Any], None, None]:
        """Iterate without interpreting or modifying the opaque cursor."""
        if not isinstance(limit, int) or limit < 1 or limit > 100:
            raise ValueError("collection limit must be between 1 and 100")
        cursor: str | None = None
        seen_cursors: set[str] = set()
        while True:
            query = {"limit": str(limit)}
            if cursor:
                query["cursor"] = cursor
            result = self.request(f"{path}?{urlencode(query)}")
            rows = result.data.get(collection_field) if isinstance(result.data, dict) else None
            if not isinstance(rows, list):
                raise TypeError(f"envelope data.{collection_field} must be an array")
            for row in rows:
                if not isinstance(row, dict):
                    raise TypeError("collection row must be an object")
                yield row
            if result.meta.get("hasMore") is not True:
                return
            next_cursor = result.meta.get("nextCursor")
            if (
                not isinstance(next_cursor, str)
                or not next_cursor
                or next_cursor in seen_cursors
            ):
                raise TypeError("paginated response contains an invalid or repeated nextCursor")
            seen_cursors.add(next_cursor)
            cursor = next_cursor

    def create_contact(self, body: Mapping[str, Any], idempotency_key: str) -> ApiResult:
        return self.request("/api/v1/contacts", "POST", body, idempotency_key)

    def submit_dummy_message(self, body: Mapping[str, Any], idempotency_key: str) -> ApiResult:
        return self.request("/api/v1/messages", "POST", body, idempotency_key)

    def get_message_status(self, message_id: str) -> ApiResult:
        return self.request(f"/api/v1/messages/{message_id}/status")

    def rotate_current_key(self, idempotency_key: str) -> ApiResult:
        result = self.request(
            "/api/v1/api-keys/current/rotate", "POST", None, idempotency_key
        )
        token = result.data.get("token") if isinstance(result.data, dict) else None
        self._api_key = _require_api_key(token)
        return result

    def revoke_current_key(self, idempotency_key: str) -> ApiResult:
        return self.request(
            "/api/v1/api-keys/current", "DELETE", None, idempotency_key
        )

    @staticmethod
    def _parse_response(status: int, headers: Any, raw_body: bytes) -> ApiResult:
        try:
            envelope = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise SignalStackApiError(status, "INVALID_RESPONSE", "Response was not JSON.", None) from error
        if not isinstance(envelope, dict) or not isinstance(envelope.get("ok"), bool):
            raise SignalStackApiError(status, "INVALID_RESPONSE", "Response envelope was invalid.", None)
        meta = envelope.get("meta")
        request_id = meta.get("requestId") if isinstance(meta, dict) else None
        if not isinstance(request_id, str) or headers.get("X-Request-Id") != request_id:
            raise SignalStackApiError(
                status, "INVALID_RESPONSE", "Request ID evidence was inconsistent.", request_id
            )
        if envelope["ok"] is False:
            api_error = envelope.get("error")
            if not isinstance(api_error, dict):
                raise SignalStackApiError(
                    status, "INVALID_RESPONSE", "Error envelope was invalid.", request_id
                )
            raise SignalStackApiError(
                status,
                str(api_error.get("code", "INVALID_RESPONSE")),
                str(api_error.get("message", "SignalStack API request failed.")),
                request_id,
                api_error.get("details"),
            )
        if "data" not in envelope:
            raise SignalStackApiError(status, "INVALID_RESPONSE", "Success envelope was invalid.", request_id)
        return ApiResult(
            data=envelope["data"],
            meta=meta,
            status=status,
            replayed=headers.get("Idempotency-Replayed") == "true",
        )


def run_example_flow(environment: Mapping[str, str] = os.environ) -> None:
    api_key = environment.get("SIGNALSTACK_API_KEY")
    if not api_key:
        raise RuntimeError("SIGNALSTACK_API_KEY is required")
    base_url = environment.get("SIGNALSTACK_BASE_URL", "http://127.0.0.1:3000")
    client = SignalStackClient(base_url, api_key)
    run_id = str(uuid.uuid4())
    contact_body = {
        "phone": environment.get("SIGNALSTACK_EXAMPLE_PHONE", f"+1555{str(int(time.time()))[-7:]}"),
        "displayName": "M3 local integration example",
        "consentStatus": "OPTED_IN",
        "optInSource": "documented_local_example",
        "consentCapturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "consentMethod": "documented_test_fixture",
        "consentDisclosure": "Local dummy-provider integration example; no carrier message is sent.",
    }
    contact = client.create_contact(contact_body, f"contact:{run_id}")
    contact_id = contact.data["id"]
    message_body = {
        "contactId": contact_id,
        "body": "SignalStack dummy integration message. No carrier call is made.",
    }
    message_key = f"message:{run_id}"
    first_message = client.submit_dummy_message(message_body, message_key)
    retried_message = client.submit_dummy_message(message_body, message_key)
    message_id = first_message.data["message"]["id"]
    if retried_message.data["message"]["id"] != message_id:
        raise RuntimeError("idempotent message retry returned a different message ID")
    status = client.get_message_status(message_id)

    for row in client.iterate_collection("/api/v1/contacts", "contacts", 25):
        if row.get("id") == contact_id:
            break

    previous_key = api_key
    rotated = client.rotate_current_key(f"rotate:{run_id}")
    _expect_invalid_key(SignalStackClient(base_url, previous_key))
    client.revoke_current_key(f"revoke:{run_id}")
    _expect_invalid_key(SignalStackClient(base_url, rotated.data["token"]))

    print(
        json.dumps(
            {
                "contactId": contact_id,
                "messageId": message_id,
                "messageMode": first_message.data["message"]["mode"],
                "deliveryStatus": status.data["deliveryStatus"]["status"],
                "idempotencyReplayed": retried_message.replayed,
                "priorKeyDeniedAfterRotation": True,
                "rotatedKeyDeniedAfterRevocation": True,
            },
            separators=(",", ":"),
        )
    )


def _expect_invalid_key(client: SignalStackClient) -> None:
    try:
        client.request("/api/v1/api-keys/current")
    except SignalStackApiError as error:
        if error.status == 401 and error.code == "INVALID_API_KEY":
            return
        raise
    raise RuntimeError("expected the API key to be denied")


def _normalize_base_url(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("SIGNALSTACK_BASE_URL must be an absolute http or https URL")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("SIGNALSTACK_BASE_URL cannot contain credentials, query, or fragment")
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path.rstrip("/"), "", ""))


def _require_api_key(value: Any) -> str:
    import re

    if not isinstance(value, str) or not re.fullmatch(
        r"ss_api_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}", value
    ):
        raise ValueError("SIGNALSTACK_API_KEY is missing or malformed")
    return value


if __name__ == "__main__":
    try:
        run_example_flow()
    except (SignalStackApiError, OSError, RuntimeError, ValueError, TypeError) as error:
        raise SystemExit(str(error)) from error
