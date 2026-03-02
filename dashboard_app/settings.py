"""
Application settings loaded from .env via pydantic-settings.
All configuration flows through this single Settings instance.
"""
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # JWT
    jwt_secret: str = "dev-secret-change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    gemini_api_key: str | None = None

    # Filesystem uploads
    upload_folder: str = "uploads/"
    max_upload_size_mb: int = 50

    # Cache
    cache_ttl_hours: int = 2
    cache_cleanup_interval_minutes: int = 30

    # Logging
    log_format: Literal["json", "human"] = "human"

    # Environment
    environment: Literal["development", "production"] = "development"

    # Access control
    admin_users: str = "admin"

    # ✅ Mots de passe utilisateurs (définis comme Secrets sur HuggingFace)
    admin_password: str = "password123"
    user_password: str = "bank2024"

    # CORS
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Computed properties ---

    @property
    def admin_list(self) -> list[str]:
        return [u.strip() for u in self.admin_users.split(",") if u.strip()]

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
