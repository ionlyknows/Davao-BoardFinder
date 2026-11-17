"""Local development HTTP server for static files and /api/* routes."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import mimetypes
import sys

ROOT_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = (ROOT_DIR / "public").resolve()

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from core.http_common import SECURITY_HEADERS, read_json_body, send_json  # noqa: E402
from core.service import handle_landmarks, handle_rank  # noqa: E402

# Security headers (X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Content-Security-Policy,
# Referrer-Policy, Permissions-Policy) are defined once in core/http_common.py.
HOST = "127.0.0.1"
PORT = 8000


class DevHandler(BaseHTTPRequestHandler):
    """Serves src/public/ statically and routes /api/landmarks and /api/rank."""

    def _send_security_headers(self) -> None:
        for key, value in SECURITY_HEADERS.items():
            self.send_header(key, value)

    def _send_json(self, status_code: int, payload: dict) -> None:
        send_json(self, status_code, payload)

    def _send_bytes(self, status_code: int, content_type: str, body: bytes) -> None:
        self.send_response(status_code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self._send_security_headers()
        self.end_headers()
        self.wfile.write(body)

    def _serve_static(self, req_path: str) -> None:
        rel_path = "index.html" if req_path == "/" else unquote(req_path).lstrip("/")
        target = (PUBLIC_DIR / rel_path).resolve()

        if target != PUBLIC_DIR and PUBLIC_DIR not in target.parents:
            self._send_bytes(403, "text/plain; charset=utf-8", b"Forbidden")
            return

        if target.is_dir():
            self._send_bytes(403, "text/plain; charset=utf-8", b"Directory listing disabled")
            return

        if not target.is_file():
            self._send_bytes(404, "text/plain; charset=utf-8", b"Not Found")
            return

        guessed_type, _ = mimetypes.guess_type(str(target))
        content_type = guessed_type or "application/octet-stream"
        if content_type.startswith("text/") or content_type in (
            "application/javascript",
            "application/json",
            "image/svg+xml",
        ):
            content_type = f"{content_type}; charset=utf-8"

        self._send_bytes(200, content_type, target.read_bytes())

    def do_GET(self) -> None:
        req_path = urlsplit(self.path).path
        if req_path == "/api/landmarks":
            status_code, payload = handle_landmarks()
            self._send_json(status_code, payload)
            return
        if req_path == "/api/rank":
            self._send_json(405, {"ok": False, "error": "Method not allowed"})
            return
        self._serve_static(req_path)

    def do_POST(self) -> None:
        req_path = urlsplit(self.path).path
        if req_path != "/api/rank":
            self._send_json(405, {"ok": False, "error": "Method not allowed"})
            return

        payload = read_json_body(self)
        if payload is None:
            return
        status_code, response_body = handle_rank(payload)
        self._send_json(status_code, response_body)

    def _method_not_allowed(self) -> None:
        self._send_json(405, {"ok": False, "error": "Method not allowed"})

    do_PUT = _method_not_allowed
    do_DELETE = _method_not_allowed
    do_PATCH = _method_not_allowed
    do_OPTIONS = _method_not_allowed


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), DevHandler)
    print(f"http://{HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
