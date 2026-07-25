"""Vercel Python Function entry point.

The shared handler keeps the local and deployed API contracts identical. Vercel's
filesystem is read-only outside /tmp, so transient video-job state is redirected
before importing the local server module.
"""

from __future__ import annotations

import os


os.environ.setdefault("MUSEUM_RUNTIME_DIR", "/tmp/failure-museum")
os.environ.setdefault("MUSEUM_OPEN_BROWSER", "0")

from local_server import MuseumHandler  # noqa: E402


class handler(MuseumHandler):
    """Serve the museum API through Vercel's BaseHTTPRequestHandler runtime."""

