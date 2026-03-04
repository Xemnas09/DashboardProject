"""
Shared dependencies injected into routers via FastAPI's Depends().
- JWT cookie extraction and verification
- Admin role check
- Rate limiter instance
"""
from fastapi import Request, Depends
from jose import jwt, JWTError, ExpiredSignatureError
from slowapi import Limiter
from slowapi.util import get_remote_address

from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from crud.user import get_user_by_username

from settings import settings
from exceptions import UnauthorizedException, SessionExpiredException
from schemas.auth import TokenPayload

# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------
limiter = Limiter(key_func=get_remote_address)


# ---------------------------------------------------------------------------
# JWT auth: extract access token from HttpOnly cookie
# ---------------------------------------------------------------------------
from services.token_service import is_token_revoked

async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenPayload:
    """
    Reads the `access_token` HttpOnly cookie, verifies signature + expiry,
    and returns the decoded payload as a TokenPayload.
    """
    token = request.cookies.get("access_token")
    if not token:
        raise UnauthorizedException()

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except ExpiredSignatureError:
        raise UnauthorizedException("Token expiré. Veuillez rafraîchir votre session.")
    except JWTError:
        raise UnauthorizedException("Token invalide.")

    if payload.get("type") != "access":
        raise UnauthorizedException("Type de token invalide.")
        
    jti = payload.get("jti")
    if not jti or is_token_revoked(jti):
        raise UnauthorizedException("Session révoquée. Veuillez vous reconnecter.")

    username = payload.get("sub")
    user = await get_user_by_username(db, username)
    if not user or not user.is_active:
        raise UnauthorizedException("Utilisateur introuvable ou inactif.")
        
    payload["role"] = user.role

    return TokenPayload(**payload)


# ---------------------------------------------------------------------------
# Cache-aware dependency: ensures cache_id from JWT maps to a live cache entry
# ---------------------------------------------------------------------------
async def get_cache_entry(user: TokenPayload = Depends(get_current_user)):
    """
    Verifies that the user's cache_id still exists in the DataCacheManager.
    Raises 410 SESSION_EXPIRED if the data was evicted or never uploaded.
    """
    from main import cache_manager  # late import to avoid circular

    entry = await cache_manager.get(user.cache_id)
    if entry is None:
        raise SessionExpiredException()
    return entry


# ---------------------------------------------------------------------------
# Admin-only dependency
# ---------------------------------------------------------------------------
async def require_admin(user: TokenPayload = Depends(get_current_user)) -> TokenPayload:
    """
    Verifies the current user has the admin or super_admin role.
    """
    if user.role not in ("admin", "super_admin"):
        raise UnauthorizedException("Accès réservé aux administrateurs.")
    return user


async def require_super_admin(user: TokenPayload = Depends(get_current_user)) -> TokenPayload:
    """
    Verifies the current user has the super_admin role.
    """
    if user.role != "super_admin":
        raise UnauthorizedException("Accès réservé au super admin.")
    return user
