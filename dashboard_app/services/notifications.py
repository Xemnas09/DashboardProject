"""
Server-side notification store.
Notifications are stored per-user (keyed by username) in memory.
"""
from datetime import datetime
from loguru import logger


class NotificationStore:
    """Simple per-user notification storage."""

    def __init__(self):
        self._store: dict[str, dict] = {}
        # Each user key -> {"notifications": [...], "history": [...], "has_unread": bool}

    def _ensure_user(self, username: str):
        if username not in self._store:
            self._store[username] = {
                "notifications": [],
                "history": [],
                "has_unread": False,
            }

    def add(self, username: str, message: str, category: str = "info") -> dict:
        """Add a notification for a user. Returns the new notification dict."""
        self._ensure_user(username)
        timestamp = datetime.now().strftime('%H:%M:%S')
        notif = {
            "message": message,
            "category": category,
            "time": timestamp,
        }

        store = self._store[username]
        # Toast notifications (last 5)
        store["notifications"].insert(0, notif)
        if len(store["notifications"]) > 5:
            store["notifications"] = store["notifications"][:5]

        # Full history (last 50)
        store["history"].insert(0, notif)
        if len(store["history"]) > 50:
            store["history"] = store["history"][:50]

        store["has_unread"] = True
        logger.debug(f"Notification [{category}] for {username}: {message}")
        return notif

    def get_recent(self, username: str) -> list[dict]:
        self._ensure_user(username)
        return self._store[username]["notifications"]

    def get_history(self, username: str) -> list[dict]:
        self._ensure_user(username)
        return self._store[username]["history"]

    def has_unread(self, username: str) -> bool:
        self._ensure_user(username)
        return self._store[username]["has_unread"]

    def mark_read(self, username: str):
        self._ensure_user(username)
        self._store[username]["has_unread"] = False

    def clear(self, username: str):
        """Clear all notifications for a user (e.g., on login)."""
        self._store[username] = {
            "notifications": [],
            "history": [],
            "has_unread": False,
        }


# Singleton
notification_store = NotificationStore()
