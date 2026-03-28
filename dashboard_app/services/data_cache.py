"""
In-memory data cache with TTL, asyncio.Lock, and background eviction.
Each entry tracks last_accessed for automatic cleanup.
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass, field
from typing import Any, Optional, List, Dict
import time

from loguru import logger


@dataclass
class CacheEntry:
    """A single cached dataset."""
    id: str
    filepath: str
    filename: Optional[str] = None
    file_size_mb: float = 0.0
    imported_at: Optional[str] = None
    last_accessed: datetime = field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    
    # Selection and processing state
    pending_sheets: List[str] = field(default_factory=list)
    selected_sheet: Optional[str] = None
    schema_overrides: Dict[str, str] = field(default_factory=dict)
    preview: Optional[Dict] = None
    
    # Performance Burst: RAM Caching of the processed DataFrame
    # Note: Using Any to avoid circular imports with Polars/FileProcessor
    df: Any = None 
    
    # Metadata for dashboard summary to avoid re-calculation
    summary_metadata: Optional[dict] = None
    stats_cache: Optional[Dict] = None  # Per-session stats cache
    db_preview: Optional[Dict] = None   # Cached output of database_view (different format from preview)
    last_anomaly_count: int = 0
    last_llm_report: Optional[str] = None


class DataCacheManager:
    """
    Manager for an in-memory session-based cache.
    
    This class handles the temporary storage of dataset metadata and previews.
    It is thread-safe (via asyncio.Lock) and supports TTL-based eviction
    to prevent memory bloat and stale data.
    """

    def __init__(self):
        """Initialize the cache store and its synchronization lock."""
        self._store: dict[str, CacheEntry] = {}
        self._lock = asyncio.Lock()

    async def get(self, cache_id: str) -> CacheEntry | None:
        """
        Retrieve a cache entry by its ID.
        
        Updates the `last_accessed` timestamp to prevent premature eviction.
        
        Args:
            cache_id: The unique session identifier.
            
        Returns:
            The CacheEntry if found, else None.
        """
        async with self._lock:
            entry = self._store.get(cache_id)
            if entry:
                entry.last_accessed = datetime.now(timezone.utc).replace(tzinfo=None)
            return entry

    async def set(self, cache_id: str, entry: CacheEntry):
        """
        Store or update a cache entry.
        
        Sets the `last_accessed` timestamp to the current time.
        
        Args:
            cache_id: The unique session identifier.
            entry: The CacheEntry object to store.
        """
        async with self._lock:
            entry.last_accessed = datetime.now(timezone.utc).replace(tzinfo=None)
            self._store[cache_id] = entry
            logger.debug(f"Cache SET: {cache_id} ({entry.filename})")

    async def delete(self, cache_id: str):
        """
        Remove a cache entry manually.
        
        Args:
            cache_id: The unique session identifier to remove.
        """
        async with self._lock:
            removed = self._store.pop(cache_id, None)
            if removed:
                logger.debug(f"Cache DELETE: {cache_id}")

    async def evict_expired(self, ttl_hours: int) -> int:
        """
        Scan the cache and remove entries that haven't been accessed within the TTL.
        
        Also cleans up the physical files associated with the expired entries
        to prevent disk space exhaustion.
        
        Args:
            ttl_hours: The maximum age of an entry since its last access.
            
        Returns:
            The number of entries evicted.
        """
        async with self._lock:
            cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=ttl_hours)
            expired = [k for k, v in self._store.items() if v.last_accessed < cutoff]
            for k in expired:
                filepath = self._store[k].filepath
                if filepath and os.path.exists(filepath):
                    try:
                        os.remove(filepath)
                        # Also remove the IPC cache if it exists
                        ipc_path = f"{filepath}.ipc"
                        if os.path.exists(ipc_path):
                            os.remove(ipc_path)
                            logger.debug(f"Deleted expired IPC cache: {ipc_path}")
                        logger.debug(f"Deleted expired file: {filepath}")
                    except OSError as e:
                        logger.warning(f"Failed to delete {filepath}: {e}")
                del self._store[k]
            return len(expired)

    async def status(self) -> dict:
        """
        Return a summary of the current cache state for monitoring.
        
        Includes the count of active sessions and an estimated total memory usage.
        
        Returns:
            A dictionary containing cache statistics.
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

cache_manager = DataCacheManager()
