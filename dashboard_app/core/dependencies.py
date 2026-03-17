"""
Core Dependency Injection Module.

Provides shared dependencies designed for injection into FastAPI routes via `Depends()`.
Core features include:
- Rate Limiting (`limiter`)
- JWT extraction, validation, and session parsing (`get_current_user`)
- Memory Cache verification (`get_cache_entry`)
- Role-Based Access Control guards (`require_admin`, `require_super_admin`)
"""
from typing import Optional

from fastapi import Request, Depends
import jwt
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from api.users.crud import get_user_by_username
from core.settings import settings
from core.exceptions import UnauthorizedException, SessionExpiredException
from api.auth.schemas import TokenPayload
from api.auth.token_service import is_token_revoked


# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------
limiter = Limiter(key_func=get_remote_address)


# ---------------------------------------------------------------------------
# JWT Auth
# ---------------------------------------------------------------------------

async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenPayload:
    """
    Extracts the `access_token` from HttpOnly cookies (or Authorization header),
    verifies its signature, checks for revocation, and retrieves the active user.

    Args:
        request (Request): The incoming HTTP request.
        db (AsyncSession): The injected database session.

    Returns:
        TokenPayload: The validated JWT payload containing user privileges.

    Raises:
        UnauthorizedException: If the token is missing, malformed, expired,
        revoked, or if the user account is disabled.
    """
    token: Optional[str] = None
    auth_header = request.headers.get("Authorization")
    
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    
    if not token:
        token = request.cookies.get("access_token")

    if not token:
        raise UnauthorizedException()

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.ExpiredSignatureError:
        raise UnauthorizedException("Token expiré. Veuillez rafraîchir votre session.")
    except jwt.PyJWTError:
        raise UnauthorizedException("Token invalide.")

    if payload.get("type") != "access":
        raise UnauthorizedException("Type de token invalide.")
        
    jti = payload.get("jti")
    if not jti or is_token_revoked(jti):
        raise UnauthorizedException("Session révoquée. Veuillez vous reconnecter.")

    username = payload.get("sub")
    if not username:
        raise UnauthorizedException("Jeton invalide.")
        
    user = await get_user_by_username(db, username)
    if not user or not user.is_active:
        raise UnauthorizedException("Utilisateur introuvable ou inactif.")
        
    payload["role"] = user.role

    return TokenPayload(**payload)


# ---------------------------------------------------------------------------
# Cache-aware dependency
# ---------------------------------------------------------------------------

async def get_cache_entry(user: TokenPayload = Depends(get_current_user)) -> "services.data_cache.CacheEntry": # type: ignore
    """
    Ensures the user's uploaded dataset (cache) is still active in memory.
    
    Args:
        user (TokenPayload): The authenticated user making the request.

    Returns:
        CacheEntry: The memory-resident dataset.

    Raises:
        SessionExpiredException: If the cache TTL has expired or data was never uploaded.
    """
    from services.data_cache import cache_manager  # late import to avoid circular dependencies

    entry = await cache_manager.get(user.cache_id)
    if entry is None:
        raise SessionExpiredException()
    return entry


# ---------------------------------------------------------------------------
# RBAC Guards
# ---------------------------------------------------------------------------

async def require_admin(user: TokenPayload = Depends(get_current_user)) -> TokenPayload:
    """
    Role-based guard ensuring the user holds at least 'admin' privileges.

    Args:
        user (TokenPayload): The authenticated user payload automatically injected.

    Returns:
        TokenPayload: The validated user payload.
        
    Raises:
        UnauthorizedException: If the user lacks sufficient clearance.
    """
    if user.role not in ("admin", "super_admin"):
        raise UnauthorizedException("Accès réservé aux administrateurs.")
    return user


async def require_super_admin(user: TokenPayload = Depends(get_current_user)) -> TokenPayload:
    """
    Role-based guard ensuring the user holds explicit 'super_admin' privileges.

    Args:
        user (TokenPayload): The authenticated user payload automatically injected.

    Returns:
        TokenPayload: The validated user payload.
        
    Raises:
        UnauthorizedException: If the user lacks sufficient clearance.
    """
    if user.role != "super_admin":
        raise UnauthorizedException("Accès réservé au super admin.")
    return user

