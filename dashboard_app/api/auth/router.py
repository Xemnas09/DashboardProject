"""
Auth Router.

Provides endpoints for User Authentication, Session Management, and Token Issuance.
Includes functionality for login, logout, token refresh, and WebSocket ticket generation.
"""
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Request, Response, Depends, HTTPException
from jose import jwt, JWTError

from core.settings import settings
from api.auth.schemas import LoginRequest, TokenPayload
from core.dependencies import get_current_user, require_admin, limiter
from core.exceptions import UnauthorizedException, ValidationException
from services.notifications import notification_store
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from api.users.crud import authenticate_user
from loguru import logger

router = APIRouter(tags=["Auth"])

# (removed static USERS dictionary)


def _create_token(data: dict, token_type: str, expires_delta: timedelta) -> str:
    """
    Generates a secure JWT token with the provided subject and scope.
    
    Args:
        data (dict): The custom claims to embed in the payload (e.g. sub, role, cache_id).
        token_type (str): The scope of the token (e.g., 'access', 'refresh', 'ws').
        expires_delta (timedelta): The relative duration until the token expires.
        
    Returns:
        str: The signed JWT string.
    """
    now = datetime.utcnow()
    payload = {
        **data,
        "type": token_type,
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _set_auth_cookies(response: Response, username: str, role: str, cache_id: str) -> tuple[str, str]:
    """
    Issues Access and Refresh tokens to the client via secure HttpOnly cookies.
    Also acts as a factory, returning the raw tokens.
    
    Args:
        response (Response): The FastAPI response object used to inject cookies.
        username (str): The subject of the tokens.
        role (str): The RBAC role of the user.
        cache_id (str): Reference to the server-side session cache.
        
    Returns:
        tuple[str, str]: A pair containing the (access_token, refresh_token).
    """
    access_token = _create_token(
        {"sub": username, "role": role, "cache_id": cache_id},
        "access",
        timedelta(minutes=settings.access_token_expire_minutes),
    )
    refresh_token = _create_token(
        {"sub": username, "role": role, "cache_id": cache_id},
        "refresh",
        timedelta(days=settings.refresh_token_expire_days),
    )

    # Pour les iframes (comme Hugging Face Spaces), les navigateurs exigent
    # obligatoirement SameSite="none" et Secure=True pour autoriser les cookies.
    is_prod = settings.environment == "production"
    samesite = "none" if is_prod else "lax"
    secure = is_prod

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite=samesite,
        secure=secure,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite=samesite,
        secure=secure,
        max_age=settings.refresh_token_expire_days * 86400,
        path="/api/auth/refresh",
    )
    return access_token, refresh_token


@router.post("/login")
@limiter.limit("5/minute")
async def login(
    request: Request,
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """
    Authenticates a user and establishes a secure session.
    Enforces rate limiting and single-session policies for Super Admins.
    """
    username = body.username
    password = body.password

    user = await authenticate_user(db, username, password)
    if not user:
        notification_store.add(username or "unknown", "Échec de connexion", "error")
        raise UnauthorizedException("Identifiant ou mot de passe incorrect")

    # ✅ Super admin — session unique
    from api.realtime.connection_manager import connection_manager
    if user.role == "super_admin" and connection_manager.is_user_online(user.username):
        raise HTTPException(
            status_code=403,
            detail=(
                "Le compte super administrateur est déjà connecté sur un autre appareil. "
                "Veuillez d'abord vous déconnecter de l'autre session."
            )
        )

    cache_id = str(uuid.uuid4())
    access_token, refresh_token = _set_auth_cookies(response, username, user.role, cache_id)

    notification_store.clear(username)
    notification_store.add(username, "Connexion réussie", "success")

    logger.info(f"User logged in: {username}")
    return {"status": "success", "access_token": access_token}


@router.post("/logout")
async def logout(request: Request, response: Response) -> dict[str, str]:
    """
    Terminates the user's current session by revoking active tokens and clearing cookies.
    Also automatically disconnects the user from real-time WebSocket channels.
    """
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

    if token:
        try:
            payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
            jti = payload.get("jti")
            exp = payload.get("exp")
            if jti and exp:
                from api.auth.token_service import revoke_token
                from datetime import datetime
                await revoke_token(jti, datetime.utcfromtimestamp(exp))
                
            cache_id = payload.get("cache_id")
            if cache_id:
                from main import cache_manager
                await cache_manager.delete(cache_id)
            
            username = payload.get("sub")
            role = payload.get("role")
            logger.info(f"User logged out: {username}")
            
            # For super_admin: force-disconnect ALL their WebSocket sessions so the
            # single-session restriction doesn't block them from logging back in.
            # For regular accounts (admin/user): don't disconnect other sessions —
            # this allows shared accounts to work (multiple people, one login).
            if role == "super_admin":
                from api.realtime.connection_manager import connection_manager
                await connection_manager.force_disconnect_user(username, "Déconnexion.")
        except JWTError:
            pass

    is_prod = settings.environment == "production"
    samesite = "none" if is_prod else "lax"
    secure = is_prod

    response.delete_cookie("access_token", path="/", samesite=samesite, secure=secure)
    response.delete_cookie("refresh_token", path="/api/auth/refresh", samesite=samesite, secure=secure)
    return {"status": "success"}


@router.get("/api/status")
async def status(user: TokenPayload = Depends(get_current_user)) -> dict:
    """
    Retrieves the current user's session status alongside localized unread notifications.
    """
    return {
        "status": "success",
        "user": user.sub,
        "role": user.role,
        "has_unread": notification_store.has_unread(user.sub),
        "notifications": notification_store.get_recent(user.sub),
    }


@router.post("/api/auth/refresh")
async def refresh_token(request: Request, response: Response) -> dict:
    """
    Exchanges a valid refresh token for a fresh access token without requiring re-authentication.
    """
    token = request.cookies.get("refresh_token")
    if not token:
        raise UnauthorizedException("Refresh token manquant.")

    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise UnauthorizedException("Refresh token invalide ou expiré. Reconnectez-vous.")

    if payload.get("type") != "refresh":
        raise UnauthorizedException("Type de token invalide.")

    access_token = _create_token(
        {"sub": payload["sub"], "role": payload.get("role", "user"), "cache_id": payload["cache_id"]},
        "access",
        timedelta(minutes=settings.access_token_expire_minutes),
    )

    is_prod = settings.environment == "production"
    samesite = "none" if is_prod else "lax"
    secure = is_prod

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite=samesite,
        secure=secure,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )

    return {"status": "success", "message": "Token rafraîchi", "access_token": access_token}


@router.get("/api/cache/status")
async def cache_status(admin: TokenPayload = Depends(require_admin)) -> dict:
    """
    Diagnostics endpoint ensuring the Data Cache is operational. Restricted to Admins.
    """
    from main import cache_manager
    return await cache_manager.status()


@router.get("/api/auth/ws-token")
async def get_ws_token(
    current_user: TokenPayload = Depends(get_current_user),
) -> dict[str, str]:
    """
    Issues a short-lived (5 min), single-use JWT specifically scoped for WebSocket handshakes.
    These 'ws' tickets cannot be repurposed for standard REST API authorization.
    """
    expire = datetime.utcnow() + timedelta(minutes=5)
    payload = {
        "sub": current_user.sub,
        "type": "ws",
        "jti": str(uuid.uuid4()),
        "exp": expire,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm="HS256")
    return {"token": token}
