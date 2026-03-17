"""
WebSocket Connection Manager Module.

This module provides a thread-safe singleton (`ConnectionManager`) to manage 
active WebSocket connections, track user presence, and handle real-time 
message broadcasting across the Dashboard application.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import WebSocket
from loguru import logger

# --- Constants ---
WS_EVENT_SESSION_REVOKED = "SESSION_REVOKED"
WS_EVENT_USER_OFFLINE = "USER_OFFLINE"
WS_STATUS_ACTIVE = "active"
WS_CLOSE_CODE_POLICY_VIOLATION = 4002


class ConnectionManager:
    """
    Singleton managing all active WebSocket connections.
    
    Ensures thread-safety during connection modifications using an `asyncio.Lock`.
    Supports multiple concurrent sessions (tabs/devices) per user.
    """

    def __init__(self) -> None:
        """Initialize the ConnectionManager with empty connection and presence tracking."""
        # Maps username to a list of active WebSocket instances
        self.connections: Dict[str, List[WebSocket]] = {}
        # Maps username to their current presence metadata (status, last_seen)
        self.presence: Dict[str, Dict[str, Any]] = {}
        # Mutex lock to prevent race conditions during concurrent dict mutations
        self._lock = asyncio.Lock()

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def connect(self, websocket: WebSocket, username: str) -> None:
        """
        Accept a new WebSocket connection and register it for the user.

        Args:
            websocket (WebSocket): The raw FastAPI WebSocket connection.
            username (str): The unique identifier (username) of the connecting user.

        Returns:
            None
        """
        await websocket.accept()
        
        # Acquire lock to safely append to the user's connection list
        async with self._lock:
            if username not in self.connections:
                self.connections[username] = []
            self.connections[username].append(websocket)
            
            # Update presence to active upon new connection
            self.presence[username] = {
                "status": WS_STATUS_ACTIVE,
                "last_seen": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            }
            
        logger.info(
            f"[WS] + {username} | "
            f"sessions: {len(self.connections[username])} | "
            f"users online: {len(self.connections)}"
        )

    async def disconnect(self, websocket: WebSocket, username: str) -> None:
        """
        Remove a WebSocket connection from the user's active sessions.
        If it's the user's last session, remove them entirely from presence tracking.

        Args:
            websocket (WebSocket): The WebSocket connection that was closed.
            username (str): The identifier of the disconnecting user.

        Returns:
            None
        """
        # Acquire lock to safely remove the socket from the list
        async with self._lock:
            if username in self.connections:
                self.connections[username] = [
                    ws for ws in self.connections[username]
                    if ws != websocket
                ]
                
                # If the user has no more active websockets across all tabs
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

    async def send_to_user(self, username: str, message: Dict[str, Any]) -> None:
        """
        Send a JSON payload to all active WebSocket sessions of a specific user.

        Args:
            username (str): The target user to receive the message.
            message (Dict[str, Any]): The JSON-serializable dictionary payload.

        Returns:
            None
        """
        connections = self.connections.get(username, [])
        if not connections:
            logger.warning(
                f"[WS] send_to_user: {username} not connected, "
                f"dropping: {message.get('event')}"
            )
            return
            
        dead_connections: List[WebSocket] = []
        for ws in list(connections):
            try:
                await ws.send_json(message)
            except Exception as e:
                # If sending fails, the socket is likely severed/dead
                logger.warning(f"[WS] Dead connection for {username}: {e}")
                dead_connections.append(ws)
                
        # Clean up any dead connections discovered during transmission
        for ws in dead_connections:
            await self.disconnect(ws, username)

    async def broadcast(self, message: Dict[str, Any]) -> None:
        """
        Broadcast a JSON message to all currently connected users.

        Args:
            message (Dict[str, Any]): The JSON-serializable message payload.

        Returns:
            None
        """
        logger.info(
            f"[WS] broadcast {message.get('event')} "
            f"→ {len(self.connections)} users"
        )
        for username in list(self.connections.keys()):
            await self.send_to_user(username, message)

    async def broadcast_except(self, exclude_username: str, message: Dict[str, Any]) -> None:
        """
        Broadcast a JSON message to all connected users EXCEPT a specific user.
        Useful for notifying others about an action taken by `exclude_username` (e.g. they sent a broadcast).

        Args:
            exclude_username (str): The username to skip broadcasting to.
            message (Dict[str, Any]): The JSON-serializable message payload.

        Returns:
            None
        """
        for username in list(self.connections.keys()):
            if username != exclude_username:
                await self.send_to_user(username, message)

    async def force_disconnect_user(self, username: str, reason: str) -> None:
        """
        Forcefully terminate all sessions for a given user and notify the network.
        Typically used when a user's role changes, their account is deleted,
        or they undergo a mandatory password reset.

        Args:
            username (str): The target user to be kicked out.
            reason (str): The visual reason to display to the expelled user.

        Returns:
            None
        """
        # 1. Send the termination event to the target user's active sockets clientside
        await self.send_to_user(username, {
            "event": WS_EVENT_SESSION_REVOKED,
            "payload": {"reason": reason},
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        })
        
        # 2. Forcefully close the physical WebSocket pipes on the backend
        async with self._lock:
            sockets = list(self.connections.get(username, []))
            
        for ws in sockets:
            try:
                await ws.close(code=WS_CLOSE_CODE_POLICY_VIOLATION)
            except Exception:
                pass  # Ignore close exceptions if the pipe is already dead
        
        # 3. Aggressively purge them from local memory to avoid race conditions
        async with self._lock:
            self.presence.pop(username, None)
            self.connections.pop(username, None)
        
        # 4. Notify everyone else immediately that this user is now offline
        # (Bypasses typical frontend unmount debouncing for security actions)
        await self.broadcast_except(username, {
            "event": WS_EVENT_USER_OFFLINE,
            "payload": {"username": username},
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        })

    # ── Presence ──────────────────────────────────────────────────────────────

    def get_online_users(self) -> List[Dict[str, Any]]:
        """
        Retrieve a snapshot of all currently online users and their session metadata.

        Returns:
            List[Dict[str, Any]]: A list of dictionaries detailing online presence,
            session count, and the last time they were active.
        """
        return [
            {
                "username": username,
                "session_count": len(conns),
                "status": self.presence.get(username, {}).get("status", WS_STATUS_ACTIVE),
                "last_seen": self.presence.get(username, {}).get("last_seen"),
            }
            for username, conns in self.connections.items()
            if conns
        ]

    def is_user_online(self, username: str) -> bool:
        """
        Check if a given user currently has at least one active WebSocket session.

        Args:
            username (str): The user to verify.

        Returns:
            bool: True if connected, False otherwise.
        """
        return bool(self.connections.get(username))

    def session_count(self, username: str) -> int:
        """
        Count the number of active browser tabs/sessions open for a user.

        Args:
            username (str): The target user.

        Returns:
            int: Total amount of active WebSocket pipes.
        """
        return len(self.connections.get(username, []))


# --- Global Singleton ---
# Import this instance across the FastAPI application
connection_manager = ConnectionManager()
