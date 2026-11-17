"""Runtime configuration. Every value comes from the environment (or api/.env locally)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["local", "test", "production"] = "local"
    log_level: str = "INFO"

    # "memory" keeps tests and offline development self-contained; "cosmos" is the real store.
    storage_backend: Literal["memory", "cosmos"] = "cosmos"

    # Shared secret between the Next.js server and this API for /v1/admin/* routes.
    admin_api_key: SecretStr = Field(default=SecretStr(""))

    # Public site (used for absolute URLs, IndexNow and AI prompts).
    site_url: str = "http://localhost:3000"
    site_name: str = "Tudorana Clark"
    author_name: str = "Daniel Tudorana-Clark"

    # Cosmos DB (keyless, via managed identity / az login)
    cosmos_endpoint: str = ""
    cosmos_database: str = "site"

    # Blob storage for media
    storage_account: str = ""
    media_container: str = "media"
    media_base_url: str = ""
    media_max_bytes: int = 10 * 1024 * 1024

    # Azure OpenAI
    openai_endpoint: str = ""
    openai_deployment: str = "gpt-4.1-mini"
    openai_api_version: str = "2024-10-21"
    openai_timeout_seconds: float = 45.0
    # Long-form drafting and research. Empty uses openai_deployment; a larger model writes noticeably better articles.
    article_deployment: str = ""
    article_timeout_seconds: float = 120.0
    # Claude on the Foundry resource for drafting and fact-checking. Empty resource keeps those steps on the OpenAI deployment.
    claude_resource: str = ""  # e.g. aif-tudoranaclark-gfkywk
    claude_deployment: str = "claude-opus-5-5"
    claude_effort: Literal["low", "medium", "high", "xhigh", "max"] = "high"
    claude_timeout_seconds: float = 180.0  # the studio waits 230 s; Azure ingress cuts off at 240 s

    # AI cover images (MAI image model on a Microsoft Foundry resource). Empty endpoint uses offline placeholders.
    image_endpoint: str = ""  # https://<foundry-resource>.services.ai.azure.com
    image_deployment: str = "MAI-Image-2.6-Flash"
    image_timeout_seconds: float = 120.0
    # MAI-Image-2.6 allows up to 2,359,296 px; MAI-Image-2.5 up to 1,048,576 (use 1280x800). Each side >= 768.
    cover_width: int = Field(default=1600, ge=768, le=2048)
    cover_height: int = Field(default=1000, ge=768, le=2048)
    cover_candidates: int = Field(default=3, ge=1, le=4)

    # IndexNow (Bing, Copilot, Yandex, Seznam, Naver). Empty disables pings.
    indexnow_key: str = ""

    # Email notifications (Resend). Empty key disables them.
    resend_api_key: SecretStr = Field(default=SecretStr(""))
    notify_email: str = "daniel@tudoranaclark.com"
    notify_from: str = "Tudorana Clark <notifications@tudoranaclark.com>"

    # Managed identity client id in Azure; unset locally so az login is used.
    azure_client_id: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
