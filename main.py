# server
import sys
import http.server
import socketserver
import mimetypes
import json
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8600
DIRECTORY = sys.argv[2] if len(sys.argv) > 2 else "./"

mimetypes.add_type("text/plain", ".srt")
mimetypes.add_type("text/plain", ".vtt")

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv"}
Subtitle_EXTENSIONS = {".srt", ".vtt"}

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200, ":thumbsup:")
        self.end_headers()

    def do_GET(self):
        if self.path.rstrip("/") == "/api/list":
            self._handle_list()
            return
        super().do_GET()

    def _handle_list(self):
        try:
            root = Path(self.directory)
            videos = []
            subs = []
            for file in sorted(root.iterdir()):
                if not p.is_file():
                    continue
                ext = file.suffix.lower()
                if ext in VIDEO_EXTENSIONS:
                    videos.append(p.name)
                elif ext in Subtitle_EXTENSIONS:
                    subs.append(p.name)
                payload = ({"videos": videos , "subtitles": subs}).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(json.dumps({"error": str(e)})).encode("utf-8"))


    def log_message(self, format, *args):
        super().log_message(format, *args)


def make_handler(directory):
    def handler(*args, **kwargs):
        return CORSRequestHandler(*args, directory=directory, **kwargs)

    return handler


if __name__ == "__main__":
    handler_class = make_handler(DIRECTORY)

    class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True

    with ThreadingHTTPServer(("127.0.0.1", PORT), handler_class) as httpd:
        print(f"Subs from '{DIRECTORY}' at http://localhost:{PORT}")
        httpd.serve_forever()
