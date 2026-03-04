import logging
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from services.connection_manager import connection_manager
from settings import settings

router = APIRouter()
logger = logging.getLogger(__name__)


def _verify_ws_token(token: str) -> str | None:
    """Vérifie le token WS et retourne le username, ou None si invalide."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        username: str = payload.get("sub")
        token_type: str = payload.get("type", "access")
        if not username or token_type != "ws":
            return None
        return username
    except JWTError:
        return None


def _now() -> str:
    return datetime.utcnow().isoformat()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = ""):
    # 1. Authentification
    username = _verify_ws_token(token)
    if not username:
        await websocket.close(code=4001)
        logger.warning("[WS] Rejected: invalid token")
        return

    # 2. Enregistrement
    await connection_manager.connect(websocket, username)

    # 3. Envoyer la liste des utilisateurs connectés au nouveau client
    await websocket.send_json({
        "event": "ONLINE_USERS_LIST",
        "payload": {"users": connection_manager.get_online_users()},
        "timestamp": _now(),
    })

    # 4. Notifier les autres que cet utilisateur est connecté
    await connection_manager.broadcast_except(username, {
        "event": "USER_ONLINE",
        "payload": {
            "username": username,
            "session_count": connection_manager.session_count(username),
            "status": "active",
            "last_seen": _now(),
        },
        "timestamp": _now(),
    })

    # 5. Boucle de messages
    try:
        while True:
            data = await websocket.receive_json()
            event = data.get("event", "")

            if event == "REQUEST_ONLINE_USERS":
                await websocket.send_json({
                    "event": "ONLINE_USERS_LIST",
                    "payload": {"users": connection_manager.get_online_users()},
                    "timestamp": _now(),
                })

            elif event == "ping":
                await websocket.send_json({"event": "pong", "timestamp": _now()})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"[WS] Error for {username}: {e}")
    finally:
        # 6. Nettoyage à la déconnexion
        await connection_manager.disconnect(websocket, username)
        if not connection_manager.is_user_online(username):
            await connection_manager.broadcast_except(username, {
                "event": "USER_OFFLINE",
                "payload": {"username": username},
                "timestamp": _now(),
            })
