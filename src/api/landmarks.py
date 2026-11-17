"""Vercel serverless handler for GET /api/landmarks."""

from http.server import BaseHTTPRequestHandler
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from core.http_common import send_json  # noqa: E402
from core.service import handle_landmarks  # noqa: E402


class handler(BaseHTTPRequestHandler):
    """HTTP handler for /api/landmarks."""

    def _method_not_allowed(self) -> None:
        send_json(self, 405, {"ok": False, "error": "Method not allowed"})

    def do_GET(self) -> None:
        status_code, payload = handle_landmarks()
        send_json(self, status_code, payload)

    do_POST = _method_not_allowed
    do_PUT = _method_not_allowed
    do_DELETE = _method_not_allowed
    do_PATCH = _method_not_allowed
    do_OPTIONS = _method_not_allowed
    do_HEAD = _method_not_allowed
