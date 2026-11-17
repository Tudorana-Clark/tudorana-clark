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

    # IndexNow (Bing, Copilot, Yandex, Seznam, Naver). Empty disables pings.
    indexnow_key: str = ""

    # Managed identity client id in Azure; unset locally so az login is used.
    azure_client_id: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
