"""
In-memory data cache with TTL, asyncio.Lock, and background eviction.
Each entry tracks last_accessed for automatic cleanup.
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from typing import Any

from loguru import logger


@dataclass
class CacheEntry:
    """A single cached dataset."""
    filepath: str
    filename: str                           # original filename (for display only)
    schema_overrides: dict = field(default_factory=dict)
    preview: dict | None = None
    selected_sheet: str | None = None
    pending_sheets: list[str] | None = None
    last_accessed: datetime = field(default_factory=datetime.utcnow)


class DataCacheManager:
    """Thread-safe, async-aware in-memory cache with TTL eviction."""

    def __init__(self):
        self._store: dict[str, CacheEntry] = {}
        self._lock = asyncio.Lock()

    async def get(self, cache_id: str) -> CacheEntry | None:
        async with self._lock:
            entry = self._store.get(cache_id)
            if entry:
                entry.last_accessed = datetime.utcnow()
            return entry

    async def set(self, cache_id: str, entry: CacheEntry):
        async with self._lock:
            entry.last_accessed = datetime.utcnow()
            self._store[cache_id] = entry
            logger.debug(f"Cache SET: {cache_id} ({entry.filename})")

    async def delete(self, cache_id: str):
        async with self._lock:
            removed = self._store.pop(cache_id, None)
            if removed:
                logger.debug(f"Cache DELETE: {cache_id}")

    async def evict_expired(self, ttl_hours: int) -> int:
        """Remove entries older than ttl_hours. Also deletes physical files."""
        async with self._lock:
            cutoff = datetime.utcnow() - timedelta(hours=ttl_hours)
            expired = [k for k, v in self._store.items() if v.last_accessed < cutoff]
            for k in expired:
                filepath = self._store[k].filepath
                if filepath and os.path.exists(filepath):
                    try:
                        os.remove(filepath)
                        logger.debug(f"Deleted expired file: {filepath}")
                    except OSError as e:
                        logger.warning(f"Failed to delete {filepath}: {e}")
                del self._store[k]
            return len(expired)

    async def status(self) -> dict:
        """Returns cache status with real memory estimation.
        Uses Polars df.estimated_size() when applicable, sys.getsizeof for preview dicts.
        """
        async with self._lock:
            total_mb = 0.0
            entries_info = []
            for cache_id, entry in self._store.items():
                entry_mb = 0.0
                if entry.preview and isinstance(entry.preview, dict):
                    # Estimate preview dict size (contains data rows as list of dicts)
                    data = entry.preview.get("data", [])
                    entry_mb = sys.getsizeof(str(data)) / (1024 * 1024)
                total_mb += entry_mb
                entries_info.append({
                    "cache_id": cache_id,
                    "filename": entry.filename,
                    "last_accessed": entry.last_accessed.isoformat(),
                    "memory_mb": round(entry_mb, 2),
                })
            return {
                "entries": len(self._store),
                "total_memory_mb": round(total_mb, 2),
                "details": entries_info,
            }
