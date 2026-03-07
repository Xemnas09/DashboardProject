"""
Token Revocation Service.

Maintains an in-memory cache of revoked JWT IDs (JTIs) to intercept
revoked sessions instantly on every authenticated request without hitting 
the database (O(1) lookup).

Lifecycle:
  - Startup: Populates cache with all unexpired revoked tokens from DB.
  - Revocation: Immediately invalidates the token in DB and cache.
  - Periodic Cleanup: Removes expired entries from DB and cache to free memory.
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
    """
    Persists a revoked token to the database and updates the fast-lookup cache.
    
    Args:
        jti (str): The unique JWT ID to block.
        expires_at (datetime): The absolute UTC time when the token naturally expires.
    """
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
    Revokes a batch of active tokens associated with a specific user.
    Called dynamically when a user's role changes or their password is reset.

    Args:
        username (str): The username of the affected account (used for logging).
        user_jtis (list[tuple[str, datetime]]): A list containing tuples of (JTI, expiration time).
    """
    for jti, expires_at in user_jtis:
        await revoke_token(jti, expires_at)
        
    logger.info(f"[TokenService] Revoked {len(user_jtis)} token(s) for user '{username}'")


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
