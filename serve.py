#!/usr/bin/env python3
"""Server statis kecil untuk pratinjau index.html (NEXALAP).

Hanya untuk pratinjau/uji lokal: menyajikan index.html pada 0.0.0.0
supaya bisa diakses lewat live preview. Tidak dipakai di produksi.
"""
import http.server
import os
import socketserver

PORT = int(os.environ.get("PORT", "8080"))
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        if self.path in ("/", "/index", "/preview"):
            self.path = "/index.html"
        return super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


class Reuse(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    print(f"NEXALAP preview on http://0.0.0.0:{PORT}")
    with Reuse(("0.0.0.0", PORT), Handler) as httpd:
        httpd.serve_forever()
