"""AI cover images: a versioned style kit rendered by an MAI image model on Microsoft Foundry.

The MAI API has no seed, so the same prompt never returns the same pixels twice. Consistency comes from:
  • a fixed, versioned prompt template and palette per content type (below), and
  • up to five approved reference images in cover_style/<STYLE_VERSION>/, sent through the edits API
    so every cover inherits the same lighting, materials and finish.
Covers are generated once, in the studio, and stored in Blob; nothing is rendered on the request path.
To change the look: edit the kit, bump STYLE_VERSION, then run `python -m scripts.covers plan` / `apply`.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import logging
from collections.abc import Awaitable, Callable, Sequence
from io import BytesIO
from pathlib import Path
from typing import Protocol

import httpx
from azure.identity.aio import DefaultAzureCredential, get_bearer_token_provider
from PIL import Image, ImageDraw, ImageOps, UnidentifiedImageError

from .ai import SeoGenerator
from .errors import DomainError, UpstreamUnavailable
from .media import MediaStore
from .models import CoverCandidate, CoverRequest, CoverResult, Kind, SeoRequest

log = logging.getLogger(__name__)

STYLE_VERSION = "v2"  # v1: photoreal still life. v2: flat hand-drawn editorial illustration.
STYLE_DIR = Path(__file__).parent / "cover_style"
MAX_REFERENCES = 5  # API limit for the edits endpoint

_LIGHT = "a warm cream paper background (#F4F1EA), ink-navy linework and shapes (#0E1520), with accents of muted brass (#8A6A2B) and soft sage (#9AA894)"
_DARK = "a deep ink background (#0E1520), cream linework and shapes (#F4F1EA), with warm gold accents (#C9A55E)"
PALETTES: dict[Kind, str] = {
    Kind.article: _LIGHT,
    Kind.note: _LIGHT,
    Kind.research: "a deep navy background (#14233C), cream linework and shapes (#F4F1EA), with warm gold accents (#C9A55E)",
    Kind.talk: _DARK,
    Kind.video: _DARK,
}

_STYLE = (
    "Flat editorial illustration for the cover of a thoughtful essay, in a warm, hand-made style. "
    "Simple bold shapes and gentle organic curves, confident hand-drawn ink outlines of slightly varying weight, "
    "a subtle paper-grain texture, and a limited palette of three or four flat colours with no gradients. "
    "Strictly 2D: no 3D rendering, no photorealism, no glossy or glass materials, no drop shadows. "
    "Minimal composition: one clear visual metaphor built from two or three elements, centred, with large calm areas of empty background. "
    "No detailed scenery, horizons full of objects or decorative clutter. "
    "Thoughtful, human and quietly optimistic."
)
_NEGATIVE = (
    "No text, letters, numbers, logos, watermarks, signatures, screens, user interfaces, robots, glowing brains or circuit boards. "
    "Any people are simplified shapes with no facial features."
)
_FROM_REFERENCES = (
    "Create a brand-new illustration that matches the reference images exactly in visual style: line quality, shapes, texture, palette and composition. "
    "Do not reuse their subjects. "
)


def build_prompt(kind: Kind, concept: str, with_references: bool) -> str:
    lead = _FROM_REFERENCES if with_references else ""
    return f"{lead}{_STYLE} Subject: {concept}. Palette: {PALETTES[kind]}. {_NEGATIVE}"


def cover_alt(concept: str) -> str:
    text = f"AI-generated illustration: {concept}"
    return text if len(text) <= 300 else text[:299].rsplit(" ", 1)[0] + "…"


def load_references(version: str = STYLE_VERSION, root: Path = STYLE_DIR) -> list[bytes]:
    """Approved style anchors for a kit version. An empty folder means plain text-to-image."""
    folder = root / version
    if not folder.is_dir():
        return []
    files = sorted(p for p in folder.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg"})
    if len(files) > MAX_REFERENCES:
        log.warning("cover_style_too_many_refs", extra={"version": version, "count": len(files), "used": MAX_REFERENCES})
    return [p.read_bytes() for p in files[:MAX_REFERENCES]]


def to_jpeg(png: bytes, width: int, height: int) -> bytes:
    """Crop to the cover aspect and re-encode. JPEG keeps pages light and is decodable by the OG card renderer."""
    try:
        with Image.open(BytesIO(png)) as im:
            fitted = ImageOps.fit(im.convert("RGB"), (width, height), Image.Resampling.LANCZOS)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise UpstreamUnavailable("The image model returned an unreadable image. Try again.") from exc
    out = BytesIO()
    fitted.save(out, "JPEG", quality=84, optimize=True, progressive=True)
    return out.getvalue()


class ImageClient(Protocol):
    model: str
    ready: bool

    async def render(self, prompt: str, references: Sequence[bytes]) -> bytes:
        """Return PNG (or JPEG) bytes for one image."""
        ...

    async def close(self) -> None: ...


def _mime(data: bytes) -> str:
    return "image/jpeg" if data[:3] == b"\xff\xd8\xff" else "image/png"


class MaiImageClient:
    """MAI image generations/edits API on a Foundry resource (https://<name>.services.ai.azure.com)."""

    _RETRYABLE = {429, 500, 502, 503, 504}
    _ATTEMPTS = 3

    ready = True

    def __init__(self, endpoint: str, deployment: str, width: int, height: int, timeout: float, credential: DefaultAzureCredential) -> None:
        self.model = deployment
        self._token: Callable[[], Awaitable[str]] = get_bearer_token_provider(credential, "https://cognitiveservices.azure.com/.default")
        self._http = httpx.AsyncClient(base_url=endpoint.rstrip("/"), timeout=httpx.Timeout(timeout, connect=10.0))
        self._width, self._height = width, height

    async def _post(self, prompt: str, references: Sequence[bytes]) -> httpx.Response:
        headers = {"Authorization": f"Bearer {await self._token()}"}
        if references:
            files = [("image", (f"reference-{i}", data, _mime(data))) for i, data in enumerate(references)]
            return await self._http.post("/mai/v1/images/edits", headers=headers, data={"model": self.model, "prompt": prompt}, files=files)
        body = {"model": self.model, "prompt": prompt, "width": self._width, "height": self._height}
        return await self._http.post("/mai/v1/images/generations", headers=headers, json=body)

    async def render(self, prompt: str, references: Sequence[bytes]) -> bytes:
        for attempt in range(1, self._ATTEMPTS + 1):
            try:
                res = await self._post(prompt, references)
            except httpx.TimeoutException as exc:
                log.warning("cover_render_timeout", extra={"attempt": attempt})
                raise UpstreamUnavailable("The image model took too long to respond. Try again in a moment.") from exc
            except httpx.HTTPError as exc:
                log.exception("cover_render_unreachable")
                raise UpstreamUnavailable("We couldn’t reach the image model. Try again in a moment.") from exc

            if res.status_code in self._RETRYABLE and attempt < self._ATTEMPTS:
                delay = _retry_after(res) or 4.0 * attempt
                log.warning("cover_render_retry", extra={"status": res.status_code, "attempt": attempt, "delay": delay})
                await asyncio.sleep(delay)
                continue
            if res.status_code == 400:
                log.warning("cover_render_rejected", extra={"body": res.text[:500]})
                raise DomainError("The image model declined this cover idea. Reword it and try again.")
            if res.status_code == 429:
                raise UpstreamUnavailable("The image model is busy. Wait a minute and try again.")
            if not res.is_success:
                log.error("cover_render_failed", extra={"status": res.status_code, "body": res.text[:500]})
                raise UpstreamUnavailable("The image model is unavailable right now. Try again later, or upload an image instead.")
            return _decode(res)
        raise UpstreamUnavailable("The image model is busy. Wait a minute and try again.")  # unreachable; keeps mypy honest

    async def close(self) -> None:
        await self._http.aclose()


def _retry_after(res: httpx.Response) -> float | None:
    try:
        return min(float(res.headers.get("retry-after", "")), 30.0)
    except ValueError:
        return None


def _decode(res: httpx.Response) -> bytes:
    try:
        payload = res.json()
        data = base64.b64decode(payload["data"][0]["b64_json"], validate=True)
    except (ValueError, KeyError, IndexError, TypeError, binascii.Error) as exc:
        log.error("cover_render_bad_payload", extra={"body": res.text[:300]})
        raise UpstreamUnavailable("The image model returned an unexpected response. Try again.") from exc
    if not data:
        raise UpstreamUnavailable("The image model returned an empty image. Try again.")
    return data


class OfflineImageClient:
    """Deterministic placeholder renders for tests and local runs without Foundry."""

    model = "offline"
    ready = True

    def __init__(self, width: int, height: int) -> None:
        self._size = (width, height)

    async def render(self, prompt: str, references: Sequence[bytes]) -> bytes:
        seed = hashlib.sha256(prompt.encode()).digest()
        im = Image.new("RGB", self._size, (243, 243, 240))
        draw = ImageDraw.Draw(im)
        w, h = self._size
        r = h // 3
        cx = w // 2 + seed[0] % (w // 4)
        draw.ellipse((cx - r, h // 2 - r, cx + r, h // 2 + r), fill=(20, 35, 60))
        out = BytesIO()
        im.save(out, "PNG")
        return out.getvalue()

    async def close(self) -> None:
        return None


class UnconfiguredImageClient:
    """Real storage without IMAGE_ENDPOINT: fail clearly rather than publish placeholder art."""

    model = "unconfigured"
    ready = False

    async def render(self, prompt: str, references: Sequence[bytes]) -> bytes:
        raise UpstreamUnavailable("AI covers aren’t set up yet: IMAGE_ENDPOINT isn’t configured. Upload an image instead.")

    async def close(self) -> None:
        return None


class CoverService:
    def __init__(self, images: ImageClient, ai: SeoGenerator, media: MediaStore, width: int, height: int, candidates: int, references: list[bytes]) -> None:
        self.images = images
        self._ai = ai
        self._media = media
        self._size = (width, height)
        self._count = candidates
        self._refs = references

    async def generate(self, req: CoverRequest) -> CoverResult:
        if not self.images.ready:
            raise UpstreamUnavailable("AI covers aren’t set up yet: IMAGE_ENDPOINT isn’t configured. Upload an image instead.")
        if req.literal and req.concept:
            concept = req.concept  # an already-visual scene (e.g. a saved concept being re-rendered)
        else:
            source = SeoRequest(kind=req.kind, title=req.title, body=req.body or req.title, category=req.category)
            concept = await self._ai.concept(source, direction=req.concept)
        prompt = build_prompt(req.kind, concept, bool(self._refs))
        results = await asyncio.gather(*(self._one(prompt) for _ in range(self._count)), return_exceptions=True)

        candidates: list[CoverCandidate] = []
        errors: list[Exception] = []
        for r in results:
            if isinstance(r, CoverCandidate):
                candidates.append(r)
            elif isinstance(r, Exception):
                errors.append(r)
            else:
                raise r  # CancelledError and friends must propagate
        for e in errors:
            if not isinstance(e, DomainError):
                log.error("cover_candidate_failed", exc_info=e)
        log.info("cover_generated", extra={"model": self.images.model, "style": STYLE_VERSION, "ok": len(candidates), "failed": len(errors), "refs": len(self._refs)})

        if not candidates:
            domain = next((e for e in errors if isinstance(e, DomainError)), None)
            raise domain or UpstreamUnavailable("Cover generation failed. Try again, or upload an image instead.")
        return CoverResult(concept=concept, style_version=STYLE_VERSION, model=self.images.model, alt=cover_alt(concept), candidates=candidates, failed=len(errors))

    async def _one(self, prompt: str) -> CoverCandidate:
        raw = await self.images.render(prompt, self._refs)
        w, h = self._size
        jpeg = await asyncio.to_thread(to_jpeg, raw, w, h)
        url, _ = await self._media.put(jpeg, prefix="covers")
        return CoverCandidate.model_validate({"url": url, "width": w, "height": h})
