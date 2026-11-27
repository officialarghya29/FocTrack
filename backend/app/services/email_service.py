"""Transactional email delivery.

One provider, one key: messages go to the Resend HTTP API using the standard
library, so there is no extra dependency to keep patched. When no key is
configured the message is written to the log instead of being posted; a
production deployment refuses to claim an email was sent in that state.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

from app.core.config import settings
from app.core.security import AuthError

logger = logging.getLogger("foctrack")

RESEND_ENDPOINT = "https://api.resend.com/emails"
REQUEST_TIMEOUT_SECONDS = 10.0


def is_configured() -> bool:
    return bool(settings.resend_api_key.strip())


def require_configured() -> None:
    """Fail closed in production when the deployment cannot send mail."""
    if is_configured():
        return
    if settings.environment == "production":
        raise AuthError(
            "Email delivery is not configured on this deployment.", 503
        )
    logger.info("Email is not configured; messages will be logged, not sent.")


def send_email(*, to: str, subject: str, text: str, html: str | None = None) -> bool:
    """Send one message. Returns False when it was only logged locally."""
    if not is_configured():
        logger.info("Email to %s (%s):\n%s", to, subject, text)
        return False

    payload = {
        "from": settings.email_from,
        "to": [to],
        "subject": subject,
        "text": text,
    }
    if html:
        payload["html"] = html
    request = urllib.request.Request(
        RESEND_ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.resend_api_key.strip()}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            if 200 <= response.status < 300:
                return True
            raise AuthError("The email service rejected the message.", 502)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")[:300]
        logger.error("Resend rejected a message (%s): %s", exc.code, body)
        raise AuthError("The email service rejected the message.", 502) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        logger.error("Resend was unreachable: %s", exc)
        raise AuthError("The email service is unreachable. Try again shortly.", 502) from exc
