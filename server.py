import http.server
import socketserver
import sys

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        super().end_headers()

    def do_GET(self):
        if self.path.startswith('/webcontainer/connect/'):
            # Serve a minimal HTML page to load the WebContainer API so the connect popup can establish its channel
            html = '''<!DOCTYPE html>
<html>
<head>
    <script type="module" crossorigin>
        import { WebContainer } from 'https://unpkg.com/@webcontainer/api@1.1.9/dist/index.js';
        window.WebContainer = WebContainer;
    </script>
</head>
<body>Connecting...</body>
</html>'''
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(html.encode('utf-8'))
            return
        return super().do_GET()

PORT = 8000

print(f"Server running on http://localhost:{PORT}")
# Allow address reuse to prevent "Address already in use" errors on restarts
socketserver.TCPServer.allow_reuse_address = True
try:
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        httpd.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped.")
    sys.exit(0)
