"""
Token revocation service with in-memory cache for performance.

Flow:
  - On startup: load all non-expired revoked JTIs from DB into cache
  - On revocation: persist to DB + update cache immediately
  - On every authenticated request: check cache only (no DB query)
  - Every hour: clean up expired entries from DB and cache
"""

import logging
from datetime import datetime
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import AsyncSessionLocal
from models.revoked_token import RevokedToken

logger = logging.getLogger(__name__)

# In-memory set of revoked JTIs — O(1) lookup on every request
REVOKED_JTI_CACHE: set[str] = set()


def is_token_revoked(jti: str) -> bool:
    """Check cache only — no DB query, called on every authenticated request."""
    return jti in REVOKED_JTI_CACHE


async def revoke_token(jti: str, expires_at: datetime) -> None:
    """Persist revoked token to DB and update cache immediately."""
    REVOKED_JTI_CACHE.add(jti)
    async with AsyncSessionLocal() as db:
        # Avoid duplicate if already revoked
        existing = await db.execute(
            select(RevokedToken).where(RevokedToken.jti == jti)
        )
        if existing.scalar_one_or_none():
            return
        db.add(RevokedToken(jti=jti, expires_at=expires_at))
        await db.commit()
    logger.debug(f"[TokenService] Revoked token jti={jti}")


async def revoke_user_tokens(username: str, user_jtis: list[tuple[str, datetime]]) -> None:
    """
    Revoke all active tokens for a user.
    Called when role changes or password is reset.

    Args:
        username: for logging
        user_jtis: list of (jti, expires_at) tuples — extracted from active sessions
    """
    for jti, expires_at in user_jtis:
        await revoke_token(jti, expires_at)
    logger.info(
        f"[TokenService] Revoked {len(user_jtis)} token(s) for user '{username}'"
    )


async def load_revoked_tokens() -> None:
    """
    Populate in-memory cache from DB on startup.
    Only loads non-expired tokens.
    """
    now = datetime.utcnow()
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(RevokedToken.jti).where(RevokedToken.expires_at > now)
        )
        jtis = result.scalars().all()
        REVOKED_JTI_CACHE.update(jtis)
    logger.info(f"[TokenService] Loaded {len(jtis)} revoked token(s) into cache")


async def cleanup_expired_tokens() -> None:
    """
    Delete expired entries from DB and remove from cache.
    Called periodically (every hour) by the background task in main.py.
    """
    now = datetime.utcnow()
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(RevokedToken.jti).where(RevokedToken.expires_at <= now)
        )
        expired_jtis = result.scalars().all()

        await db.execute(
            delete(RevokedToken).where(RevokedToken.expires_at <= now)
        )
        await db.commit()

    for jti in expired_jtis:
        REVOKED_JTI_CACHE.discard(jti)

    if expired_jtis:
        logger.info(f"[TokenService] Cleaned up {len(expired_jtis)} expired token(s)")
