"""Check that a source's link still resolves, without letting pasted URLs reach internal addresses.

The URLs come from pasted research and model output, and the API runs inside Azure, so every hop is
validated: http(s) only, the host must resolve to public addresses only, and redirects are followed by
hand so each new location is validated too. Nothing is downloaded beyond the response headers.
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import re
import socket
from datetime import date
from urllib.parse import urljoin, urlsplit

import httpx

from .models import LinkStatus

log = logging.getLogger(__name__)
_MAX_REDIRECTS = 4
_UA = "Mozilla/5.0 (compatible; StudioLinkCheck/1.0)"


class UnsafeUrl(Exception):
    pass


async def _assert_public(url: str) -> None:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise UnsafeUrl("only public http(s) links can be checked")
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(parts.hostname, parts.port or (443 if parts.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UnsafeUrl("host does not resolve") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise UnsafeUrl("host resolves to a non-public address")


def _classify(code: int) -> LinkStatus:
    if 200 <= code < 300:
        return "ok"
    if code in (404, 410):
        return "broken"
    return "blocked"  # 401/403/429/5xx: the page exists but refuses automated checks, or is briefly down


async def check_link(client: httpx.AsyncClient, url: str) -> LinkStatus:
    current = url
    try:
        for _ in range(_MAX_REDIRECTS + 1):
            await _assert_public(current)
            res = await client.head(current)
            if res.status_code in (403, 405, 501):  # many sites reject HEAD; retry with GET, headers only
                async with client.stream("GET", current) as streamed:
                    res = streamed
            if res.is_redirect and res.headers.get("location"):
                current = urljoin(current, res.headers["location"])
                continue
            return _classify(res.status_code)
        return "blocked"  # too many redirects
    except UnsafeUrl:
        return "broken"
    except httpx.TimeoutException:
        return "blocked"
    except httpx.HTTPError:
        return "broken"


async def check_links(urls: list[str], concurrency: int = 6, per_request_seconds: float = 8.0) -> dict[str, LinkStatus]:
    sem = asyncio.Semaphore(concurrency)
    async with httpx.AsyncClient(follow_redirects=False, timeout=httpx.Timeout(per_request_seconds, connect=5.0), headers={"user-agent": _UA}) as client:

        async def one(u: str) -> tuple[str, LinkStatus]:
            async with sem:
                return u, await check_link(client, u)

        results = await asyncio.gather(*(one(u) for u in dict.fromkeys(urls)))
    return dict(results)


_MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}
_DATE = re.compile(r"(?:(\d{1,2})\s+)?([A-Za-z]{3,9})\.?\s+(\d{4})|\b(\d{4})-(\d{2})(?:-\d{2})?\b|\b((?:19|20)\d{2})\b")


def parse_published(text: str) -> date | None:
    """'July 2026', '17 Jul 2026', '2026-07' or '2026' -> first day of that month (or year)."""
    m = _DATE.search(text or "")
    if not m:
        return None
    if m.group(3):
        month = _MONTHS.get(m.group(2)[:3].lower())
        return date(int(m.group(3)), month, 1) if month else date(int(m.group(3)), 1, 1)
    if m.group(4):
        return date(int(m.group(4)), max(1, min(12, int(m.group(5)))), 1)
    return date(int(m.group(6)), 1, 1)
