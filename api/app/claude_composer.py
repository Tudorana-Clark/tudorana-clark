"""Claude on Microsoft Foundry for the article steps where writing quality and judgement matter most
(drafting and fact-checking). Keyless: Entra ID tokens from the app's managed identity or az login.
"""

from __future__ import annotations

import logging
from typing import Literal, TypeVar

import anthropic
from anthropic import AsyncAnthropicFoundry
from azure.identity.aio import DefaultAzureCredential, get_bearer_token_provider
from pydantic import BaseModel

from .errors import DomainError, UpstreamUnavailable

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

Effort = Literal["low", "medium", "high", "xhigh", "max"]
_SCOPE = "https://ai.azure.com/.default"
# Non-streaming requests stay under the SDK's HTTP timeout at this size; a 900-word article plus
# structured wrapping and adaptive thinking fits comfortably.
_MAX_TOKENS = 16_000


class ClaudeComposer:
    def __init__(self, resource: str, deployment: str, effort: Effort, timeout: float, credential: DefaultAzureCredential) -> None:
        self.model = deployment
        self._effort: Effort = effort
        self._client = AsyncAnthropicFoundry(
            resource=resource,
            azure_ad_token_provider=get_bearer_token_provider(credential, _SCOPE),
            timeout=timeout,
            max_retries=1,  # one quick retry for 429/5xx; a second would outlast the studio's wait
        )

    async def parse(self, system: str, user: str, schema: type[T], what: str) -> T:
        try:
            resp = await self._client.messages.parse(
                model=self.model,
                max_tokens=_MAX_TOKENS,
                system=system,
                messages=[{"role": "user", "content": user}],
                thinking={"type": "adaptive"},
                output_config={"effort": self._effort},
                output_format=schema,
            )
        except anthropic.APITimeoutError as exc:
            log.warning("claude_timeout", extra={"what": what})
            raise UpstreamUnavailable("Claude took too long to respond. Try again in a moment.") from exc
        except anthropic.RateLimitError as exc:
            log.warning("claude_rate_limited", extra={"what": what})
            raise UpstreamUnavailable("Claude is busy right now. Wait a minute and try again.") from exc
        except (anthropic.APIStatusError, anthropic.APIConnectionError) as exc:
            log.exception("claude_failed", extra={"what": what})
            raise UpstreamUnavailable("Claude is unavailable right now. Try again shortly.") from exc

        usage = resp.usage
        log.info("claude_call", extra={"what": what, "model": resp.model, "stop": resp.stop_reason, "in": usage.input_tokens, "out": usage.output_tokens})
        if resp.stop_reason == "refusal":
            details = resp.stop_details
            log.warning("claude_refusal", extra={"what": what, "category": getattr(details, "category", None)})
            raise DomainError("Claude declined this request. Check the brief and sources for anything that could read as harmful, then try again.")
        if resp.stop_reason == "max_tokens":
            raise UpstreamUnavailable("Claude ran out of room before finishing. Try again, or shorten the outline.")
        parsed = resp.parsed_output
        if parsed is None:
            raise UpstreamUnavailable("Claude couldn’t produce a result for this step. Try again.")
        return parsed

    async def close(self) -> None:
        await self._client.close()
