# server
import sys
import http.server
import socketserver

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8600
DIRECTORY = sys.argv[2] if len(sys.argv) > 2 else "."


class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

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
