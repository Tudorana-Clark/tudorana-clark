"""IndexNow: tells Bing (and so Copilot / ChatGPT search), Yandex, Seznam and Naver a URL changed.

Fire-and-forget. A failed ping must never fail a publish.
"""

import logging

import httpx

log = logging.getLogger(__name__)

ENDPOINT = "https://api.indexnow.org/indexnow"


async def ping(site_url: str, key: str, urls: list[str]) -> None:
    if not key or not urls or "localhost" in site_url or "127.0.0.1" in site_url:
        return
    host = httpx.URL(site_url).host
    payload = {"host": host, "key": key, "keyLocation": f"{site_url.rstrip('/')}/{key}.txt", "urlList": urls}
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            res = await client.post(ENDPOINT, json=payload)
        log.info("indexnow_ping", extra={"status": res.status_code, "count": len(urls)})
    except httpx.HTTPError:
        log.warning("indexnow_ping_failed", exc_info=True)
