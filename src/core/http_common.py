"""Shared HTTP helpers: security headers and request-body reading (pure Python stdlib).

Used by api/rank.py, api/landmarks.py and dev_server.py so the rules live in one place.
"""

import json

MAX_BODY_BYTES = 262_144

CSP_VALUE = (
    "default-src 'self'; "
    "script-src 'self' https://unpkg.com; "
    "style-src 'self' https://unpkg.com https://fonts.googleapis.com; "
    "font-src https://fonts.gstatic.com; "
    "img-src 'self' data: https://*.tile.openstreetmap.org; "
    "connect-src 'self' https://nominatim.openstreetmap.org https://photon.komoot.io"
)

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": CSP_VALUE,
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(self)",
}


def send_json(handler, status_code: int, payload: dict) -> None:
    """Write a JSON response with the security headers. Time: O(len(payload)); Space: O(len(payload))."""
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status_code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    for key, value in SECURITY_HEADERS.items():
        handler.send_header(key, value)
    handler.end_headers()
    handler.wfile.write(body)


def read_json_body(handler) -> dict | None:
    """Read and parse the JSON object body. On a problem, send the error response and return None."""
    raw_len = handler.headers.get("Content-Length")
    if raw_len is not None:
        try:
            length = int(raw_len)
        except ValueError:
            length = -1
        if length < 0:
            send_json(handler, 400, {"ok": False, "error": "Invalid Content-Length header"})
            return None
        if length > MAX_BODY_BYTES:
            send_json(handler, 413, {"ok": False, "error": "Payload exceeds 256 KB limit"})
            return None
        raw_body = handler.rfile.read(length)
    else:
        raw_body = handler.rfile.read(MAX_BODY_BYTES + 1)
    if len(raw_body) > MAX_BODY_BYTES:
        send_json(handler, 413, {"ok": False, "error": "Payload exceeds 256 KB limit"})
        return None
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        send_json(handler, 400, {"ok": False, "error": "Invalid JSON body"})
        return None
    if not isinstance(payload, dict):
        send_json(handler, 400, {"ok": False, "error": "JSON payload must be an object"})
        return None
    return payload
