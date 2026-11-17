"""Email notifications to the site owner via Resend. Best-effort: a failure is logged, never raised."""

from __future__ import annotations

import asyncio
import html
import logging
from typing import Protocol

import httpx

from .models import ContactMessage, Subscriber

log = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"

# Background sends are referenced so they are not garbage-collected mid-flight.
_background: set[asyncio.Task[None]] = set()


class Notifier(Protocol):
    def new_subscriber(self, sub: Subscriber) -> None: ...
    def new_message(self, msg: ContactMessage) -> None: ...
    async def close(self) -> None: ...


def _layout(title: str, rows: list[tuple[str, str]], body: str = "") -> str:
    cells = "".join(
        f'<tr><td style="padding:6px 16px 6px 0;color:#5E636B;font-size:13px;vertical-align:top">{html.escape(k)}</td>'
        f'<td style="padding:6px 0;font-size:15px;color:#0E1520">{html.escape(v)}</td></tr>'
        for k, v in rows
    )
    extra = (
        f'<div style="margin-top:20px;padding:20px;background:#F3F3F0;border-radius:14px;font-size:15px;line-height:1.6;'
        f'color:#0E1520;white-space:pre-wrap">{html.escape(body)}</div>'
        if body
        else ""
    )
    return (
        '<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">'
        f'<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;color:#8A6A2B">TUDORANA CLARK</p>'
        f'<h1 style="margin:0 0 16px;font-size:22px;color:#0E1520">{html.escape(title)}</h1>'
        f"<table>{cells}</table>{extra}</div>"
    )


class ResendNotifier:
    def __init__(self, api_key: str, to: str, sender: str, site_url: str) -> None:
        self._client = httpx.AsyncClient(timeout=10, headers={"Authorization": f"Bearer {api_key}"})
        self._to = to
        self._from = sender
        self._site = site_url.rstrip("/")

    def _send(self, *, kind: str, key: str, subject: str, html_body: str, text: str, reply_to: str | None = None) -> None:
        payload: dict[str, object] = {"from": self._from, "to": [self._to], "subject": subject, "html": html_body, "text": text}
        if reply_to:
            payload["reply_to"] = reply_to

        async def run() -> None:
            try:
                # Idempotency key: a retried request can never send a duplicate email.
                res = await self._client.post(RESEND_URL, json=payload, headers={"Idempotency-Key": f"{kind}-{key}"})
                if res.is_success:
                    log.info("notify_sent", extra={"kind": kind})
                else:
                    log.error("notify_failed", extra={"kind": kind, "status": res.status_code, "body": res.text[:300]})
            except httpx.HTTPError:
                log.exception("notify_unreachable", extra={"kind": kind})

        task = asyncio.create_task(run())
        _background.add(task)
        task.add_done_callback(_background.discard)

    def new_subscriber(self, sub: Subscriber) -> None:
        rows = [("Email", sub.email), ("Signed up on", sub.source or "site"), ("When", f"{sub.created_at:%d %b %Y, %H:%M} UTC")]
        self._send(
            kind="subscriber",
            key=sub.id,
            subject=f"New newsletter subscriber: {sub.email}",
            html_body=_layout("New newsletter subscriber", rows)
            + f'<p style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:0 24px;font-size:13px;color:#5E636B">'
            f'All subscribers: <a href="{self._site}/studio/inbox">{self._site}/studio/inbox</a></p>',
            text="\n".join(f"{k}: {v}" for k, v in rows) + f"\n\nAll subscribers: {self._site}/studio/inbox",
        )

    def new_message(self, msg: ContactMessage) -> None:
        rows = [("From", f"{msg.name} <{msg.email}>"), ("Topic", msg.topic.value), ("When", f"{msg.created_at:%d %b %Y, %H:%M} UTC")]
        self._send(
            kind="contact",
            key=msg.id,
            subject=f"[{msg.topic.value}] New message from {msg.name}",
            html_body=_layout(f"New message: {msg.topic.value}", rows, msg.message),
            text="\n".join(f"{k}: {v}" for k, v in rows) + f"\n\n{msg.message}\n\nReply to this email to answer {msg.name} directly.",
            reply_to=msg.email,  # hitting Reply goes straight to the sender
        )

    async def close(self) -> None:
        if _background:
            await asyncio.wait(_background, timeout=5)
        await self._client.aclose()


class NullNotifier:
    """Used when no Resend key is configured (local/offline/tests)."""

    def new_subscriber(self, sub: Subscriber) -> None:
        return None

    def new_message(self, msg: ContactMessage) -> None:
        return None

    async def close(self) -> None:
        return None
