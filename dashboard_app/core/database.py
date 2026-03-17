"""
database.py — SQLAlchemy async engine setup.

For PostgreSQL (Supabase / PgBouncer transaction mode), we use a custom
async_creator that creates raw asyncpg connections with:
  - statement_cache_size=0  → disables asyncpg's own prepared-statement cache
  - DEALLOCATE ALL          → purges stale named statements left by PgBouncer
                              before SQLAlchemy's own dialect initialization runs

This is the ONLY approach that reliably prevents DuplicatePreparedStatementError
when PgBouncer reuses backend connections across different application processes
(e.g., between init_db.py and the FastAPI server startup).
"""
import asyncpg
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from core.settings import settings

is_postgres = settings.database_url.startswith("postgres")
is_production = settings.environment == "production"
needs_ssl = (
    is_production
    or "supabase" in settings.database_url.lower()
    or "pooler" in settings.database_url.lower()
    or "sslmode=require" in settings.database_url.lower()
)


def _make_asyncpg_url(db_url: str) -> str:
    """Convert plain postgres:// → asyncpg-compatible DSN (no driver prefix needed)."""
    if db_url.startswith("postgresql+asyncpg://"):
        return db_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    if db_url.startswith("postgresql://"):
        return db_url
    if db_url.startswith("postgres://"):
        return db_url.replace("postgres://", "postgresql://", 1)
    return db_url


if is_postgres:
    _asyncpg_dsn = _make_asyncpg_url(settings.database_url)

    async def _async_creator() -> asyncpg.Connection:  # SQLAlchemy calls this with no args
        """
        Create a raw asyncpg connection and immediately DEALLOCATE ALL prepared
        statements. This cleans up any state left by PgBouncer from previous
        processes (e.g., init_db.py) before SQLAlchemy initialises its dialect.
        
        Returns:
            asyncpg.Connection: A fresh, clean connection ready for SQLAlchemy.
        """
        ssl_ctx = "require" if needs_ssl else None
        conn = await asyncpg.connect(
            _asyncpg_dsn,
            statement_cache_size=0,
            ssl=ssl_ctx,
        )
        try:
            await conn.execute("DEALLOCATE ALL")
        except Exception:
            pass  # Best-effort — ignore if none exist yet
        return conn

    engine = create_async_engine(
        # SQLAlchemy still needs a URL to determine the dialect; the actual
        # connection is provided by async_creator so the URL credentials are
        # never actually used for connecting.
        settings.async_database_url,
        async_creator=_async_creator,
        poolclass=NullPool,
        echo=False,
    )

else:
    # SQLite (local development) — standard setup
    engine = create_async_engine(
        settings.async_database_url,
        echo=False,
        pool_pre_ping=True,
        pool_recycle=300,
    )


AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Declarative base for all SQLAlchemy models."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields an isolated asynchronous database session.
    
    Yields:
        AsyncSession: An active SQLAlchemy async session.
        
    Raises:
        Exception: If a database operation fails, the session is rolled back automatically.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
