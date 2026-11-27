"""Small in-process rate limiter for authentication endpoints.

The API runs as a single free-tier instance, so a process-local sliding window
is sufficient and avoids another hosted dependency. If the service is ever
scaled horizontally this must move to a shared store; that limitation is
documented in docs/deployment.md.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.core.config import settings


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def retry_after(self, key: str, limit: int, window_seconds: int) -> int:
        """Record a hit and return 0, or the seconds until the window frees."""
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= limit:
                return max(1, int(window_seconds - (now - hits[0])) + 1)
            hits.append(now)
            # Opportunistic cleanup keeps the dictionary from growing forever.
            if len(self._hits) > 5000:
                for stale_key in [k for k, v in self._hits.items() if not v]:
                    self._hits.pop(stale_key, None)
            return 0


limiter = SlidingWindowLimiter()


def client_ip(request: Request) -> str:
    if settings.trust_forwarded_for:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def enforce(request: Request, scope: str, limit: int, window_seconds: int, *parts: str) -> None:
    key = "|".join((scope, client_ip(request), *[part.lower() for part in parts]))
    retry_after = limiter.retry_after(key, limit, window_seconds)
    if retry_after:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Please wait and try again.",
            headers={"Retry-After": str(retry_after)},
        )


def reset() -> None:
    """Test hook: forget every recorded hit."""
    with limiter._lock:
        limiter._hits.clear()
