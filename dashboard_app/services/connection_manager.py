import asyncio
from datetime import datetime
from fastapi import WebSocket
from loguru import logger


class ConnectionManager:
    """
    Singleton gérant toutes les connexions WebSocket actives.
    Thread-safe via asyncio.Lock.
    """

    def __init__(self):
        # username → list[WebSocket] (supporte plusieurs onglets)
        self.connections: dict[str, list[WebSocket]] = {}
        # username → presence info
        self.presence: dict[str, dict] = {}
        self._lock = asyncio.Lock()

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def connect(self, websocket: WebSocket, username: str) -> None:
        await websocket.accept()
        async with self._lock:
            if username not in self.connections:
                self.connections[username] = []
            self.connections[username].append(websocket)
            self.presence[username] = {
                "status": "active",
                "last_seen": datetime.utcnow().isoformat(),
            }
        logger.info(
            f"[WS] + {username} | "
            f"sessions: {len(self.connections[username])} | "
            f"users online: {len(self.connections)}"
        )

    async def disconnect(self, websocket: WebSocket, username: str) -> None:
        async with self._lock:
            if username in self.connections:
                self.connections[username] = [
                    ws for ws in self.connections[username]
                    if ws != websocket
                ]
                if not self.connections[username]:
                    del self.connections[username]
                    self.presence.pop(username, None)
                    logger.info(
                        f"[WS] - {username} fully disconnected | "
                        f"users online: {len(self.connections)}"
                    )
                else:
                    logger.info(
                        f"[WS] - {username} one session closed | "
                        f"remaining: {len(self.connections[username])}"
                    )

    # ── Send helpers ──────────────────────────────────────────────────────────

    async def send_to_user(self, username: str, message: dict) -> None:
        """Envoie à toutes les sessions d'un utilisateur."""
        connections = self.connections.get(username, [])
        if not connections:
            logger.warning(
                f"[WS] send_to_user: {username} not connected, "
                f"dropping: {message.get('event')}"
            )
            return
        dead = []
        for ws in list(connections):
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.warning(f"[WS] Dead connection for {username}: {e}")
                dead.append(ws)
        for ws in dead:
            await self.disconnect(ws, username)

    async def broadcast(self, message: dict) -> None:
        """Envoie à TOUS les utilisateurs connectés."""
        logger.info(
            f"[WS] broadcast {message.get('event')} "
            f"→ {len(self.connections)} users"
        )
        for username in list(self.connections.keys()):
            await self.send_to_user(username, message)

    async def broadcast_except(self, exclude: str, message: dict) -> None:
        """Envoie à tout le monde sauf un utilisateur."""
        for username in list(self.connections.keys()):
            if username != exclude:
                await self.send_to_user(username, message)

    async def force_disconnect_user(self, username: str, reason: str) -> None:
        """Ferme toutes les sessions d'un utilisateur avec un message."""
        await self.send_to_user(username, {
            "event": "SESSION_REVOKED",
            "payload": {"reason": reason},
            "timestamp": datetime.utcnow().isoformat(),
        })
        for ws in list(self.connections.get(username, [])):
            try:
                await ws.close(code=4002)
            except Exception:
                pass
        
        # Broadcast immédiat pour ne pas faire attendre les autres utilisateurs (contourne le debounce du F5)
        self.presence.pop(username, None)
        self.connections.pop(username, None)
        await self.broadcast_except(username, {
            "event": "USER_OFFLINE",
            "payload": {"username": username},
            "timestamp": datetime.utcnow().isoformat(),
        })

    # ── Presence ──────────────────────────────────────────────────────────────

    def get_online_users(self) -> list[dict]:
        return [
            {
                "username": username,
                "session_count": len(conns),
                "status": self.presence.get(username, {}).get("status", "active"),
                "last_seen": self.presence.get(username, {}).get("last_seen"),
            }
            for username, conns in self.connections.items()
            if conns
        ]

    def is_user_online(self, username: str) -> bool:
        return bool(self.connections.get(username))

    def session_count(self, username: str) -> int:
        return len(self.connections.get(username, []))


# Singleton global — importer partout
connection_manager = ConnectionManager()
