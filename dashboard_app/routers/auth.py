"""
Auth router: /login, /logout, /api/status, /api/auth/refresh, /api/cache/status
"""
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Request, Response, Depends
from jose import jwt, JWTError

from settings import settings
from schemas.auth import LoginRequest, TokenPayload
from dependencies import get_current_user, require_admin, limiter
from exceptions import UnauthorizedException, ValidationException
from services.notifications import notification_store
from loguru import logger

router = APIRouter(tags=["Auth"])

# Mock users (to be replaced with DB in SaaS phase)
USERS = {
    "admin": "password123",
    "user": "bank2024",
}


def _create_token(data: dict, token_type: str, expires_delta: timedelta) -> str:
    payload = {
        **data,
        "type": token_type,
        "exp": datetime.utcnow() + expires_delta,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _set_auth_cookies(response: Response, username: str, cache_id: str):
    """Sets both access and refresh HttpOnly cookies."""
    access_token = _create_token(
        {"sub": username, "cache_id": cache_id},
        "access",
        timedelta(minutes=settings.access_token_expire_minutes),
    )
    refresh_token = _create_token(
        {"sub": username, "cache_id": cache_id},
        "refresh",
        timedelta(days=settings.refresh_token_expire_days),
    )

    is_prod = settings.environment == "production"

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=is_prod,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=is_prod,
        max_age=settings.refresh_token_expire_days * 86400,
        path="/api/auth/refresh",
    )


# ---------------------------------------------------------------------------
# POST /login
# ---------------------------------------------------------------------------
@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, body: LoginRequest, response: Response):
    username = body.username
    password = body.password

    if username not in USERS or USERS[username] != password:
        notification_store.add(username or "unknown", "Échec de connexion", "error")
        raise UnauthorizedException("Identifiants incorrects")

    # Create or reuse cache_id
    cache_id = str(uuid.uuid4())
    _set_auth_cookies(response, username, cache_id)

    notification_store.clear(username)
    notification_store.add(username, "Connexion réussie", "success")

    logger.info(f"User logged in: {username}")
    return {"status": "success"}


# ---------------------------------------------------------------------------
# POST /logout
# ---------------------------------------------------------------------------
@router.post("/logout")
async def logout(request: Request, response: Response):
    # Try to get user for cache cleanup
    token = request.cookies.get("access_token")
    if token:
        try:
            payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
            cache_id = payload.get("cache_id")
            if cache_id:
                from main import cache_manager
                await cache_manager.delete(cache_id)
            logger.info(f"User logged out: {payload.get('sub')}")
        except JWTError:
            pass

    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/api/auth/refresh")
    return {"status": "success"}


# ---------------------------------------------------------------------------
# GET /api/status
# ---------------------------------------------------------------------------
@router.get("/api/status")
async def status(user: TokenPayload = Depends(get_current_user)):
    return {
        "status": "success",
        "user": user.sub,
        "has_unread": notification_store.has_unread(user.sub),
        "notifications": notification_store.get_recent(user.sub),
    }


# ---------------------------------------------------------------------------
# POST /api/auth/refresh
# ---------------------------------------------------------------------------
@router.post("/api/auth/refresh")
async def refresh_token(request: Request, response: Response):
    """Issues a new access token from a valid refresh token cookie."""
    token = request.cookies.get("refresh_token")
    if not token:
        raise UnauthorizedException("Refresh token manquant.")

    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise UnauthorizedException("Refresh token invalide ou expiré. Reconnectez-vous.")

    if payload.get("type") != "refresh":
        raise UnauthorizedException("Type de token invalide.")

    # Issue new access token
    access_token = _create_token(
        {"sub": payload["sub"], "cache_id": payload["cache_id"]},
        "access",
        timedelta(minutes=settings.access_token_expire_minutes),
    )

    is_prod = settings.environment == "production"
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=is_prod,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )

    return {"status": "success", "message": "Token rafraîchi"}


# ---------------------------------------------------------------------------
# GET /api/cache/status (admin only)
# ---------------------------------------------------------------------------
@router.get("/api/cache/status")
async def cache_status(admin: TokenPayload = Depends(require_admin)):
    from main import cache_manager
    return await cache_manager.status()
