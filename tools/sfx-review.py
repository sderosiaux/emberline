"""Tiny local server for tools/sfx-review.html: serves the repo and saves votes to tools/sfx-review.json.
usage: python3 tools/sfx-review.py  → open http://127.0.0.1:5199/tools/sfx-review.html"""
import http.server, json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tools', 'sfx-review.json')

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path == '/votes':
            data = open(OUT, 'rb').read() if os.path.exists(OUT) else b'{}'
            self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(data); return
        super().do_GET()
    def do_POST(self):
        body = self.rfile.read(int(self.headers['Content-Length']))
        json.loads(body)
        open(OUT, 'wb').write(body)
        self.send_response(204); self.end_headers()

http.server.ThreadingHTTPServer(('127.0.0.1', 5199), H).serve_forever()
