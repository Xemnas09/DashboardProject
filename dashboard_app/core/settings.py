"""
Application settings loaded from .env via pydantic-settings.
All configuration flows through this single Settings instance.
"""
from pathlib import Path
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # JWT
    jwt_secret: str = "dev-secret-change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    gemini_api_key: str | None = None

    # Filesystem uploads (Moved outside of dashboard_app to prevent uvicorn reloads on watch)
    upload_folder: str = str(Path(__file__).parent.parent.parent / "uploads")
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

    # Database
    database_url: str = "sqlite+aiosqlite:///./datavera.db"

    # Default user passwords
    admin_password: str = "admin123"   # overridden by ADMIN_PASSWORD env var
    user_password: str = "user123"     # overridden by USER_PASSWORD env var

    # Super admin username
    super_admin_username: str = "admin"  # overridden by SUPER_ADMIN_USERNAME env var

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

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_file_encoding="utf-8")

    @property
    def async_database_url(self) -> str:
        """
        Convert DATABASE_URL to async-compatible driver at runtime.
        Supabase provides postgresql:// → convert to postgresql+asyncpg://
        SQLite stays as sqlite+aiosqlite://
        """
        url = self.database_url
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        if url.startswith("sqlite:///"):
            # Resolve relative sqlite paths to absolute paths to avoid duplicates in different CWDs
            db_path = url.replace("sqlite:///", "", 1)
            if not db_path.startswith("/") and ":" not in db_path:
                root_dir = Path(__file__).parent.parent
                abs_path = (root_dir / db_path).resolve()
                return f"sqlite+aiosqlite:///{abs_path}"
            return url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
        return url


settings = Settings()
