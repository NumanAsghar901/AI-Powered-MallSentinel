"""High-performance caching layer with Upstash Redis / Redis support
and ultra-fast in-memory TTL fallback.
"""
import asyncio
import json
import logging
import time
from typing import Any
import urllib.request
import urllib.error

from app.core.config import settings

logger = logging.getLogger(__name__)


class CacheLayer:
    def __init__(self) -> None:
        self._memory_cache: dict[str, tuple[Any, float]] = {}
        self._lock = asyncio.Lock()
        self._upstash_url = (settings.UPSTASH_REDIS_REST_URL or "").rstrip("/")
        self._upstash_token = settings.UPSTASH_REDIS_REST_TOKEN or ""

    @property
    def has_upstash(self) -> bool:
        return bool(self._upstash_url and self._upstash_token)

    async def get(self, key: str) -> Any | None:
        # 1. Try local memory cache first for sub-millisecond retrieval
        now = time.monotonic()
        if key in self._memory_cache:
            val, expires_at = self._memory_cache[key]
            if now < expires_at:
                return val
            else:
                del self._memory_cache[key]

        # 2. Try Upstash Redis if configured
        if self.has_upstash:
            try:
                loop = asyncio.get_running_loop()
                return await loop.run_in_executor(None, self._upstash_get, key)
            except Exception as exc:
                logger.warning("Upstash get error for %s: %s", key, exc)

        return None

    def _upstash_get(self, key: str) -> Any | None:
        req = urllib.request.Request(
            f"{self._upstash_url}/get/{urllib.parse.quote(key)}",
            headers={"Authorization": f"Bearer {self._upstash_token}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                data = json.loads(resp.read().decode())
                raw_val = data.get("result")
                if raw_val is not None:
                    try:
                        return json.loads(raw_val)
                    except Exception:
                        return raw_val
        except urllib.error.URLError:
            pass
        return None

    async def set(self, key: str, value: Any, ttl_seconds: int = 60) -> None:
        now = time.monotonic()
        # Save in memory cache
        self._memory_cache[key] = (value, now + ttl_seconds)

        # Sync to Upstash Redis if configured
        if self.has_upstash:
            try:
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, self._upstash_set, key, value, ttl_seconds)
            except Exception as exc:
                logger.warning("Upstash set error for %s: %s", key, exc)

    def _upstash_set(self, key: str, value: Any, ttl: int) -> None:
        serialized = json.dumps(value) if not isinstance(value, (str, int, float, bool)) else str(value)
        req = urllib.request.Request(
            f"{self._upstash_url}/set/{urllib.parse.quote(key)}?ex={ttl}",
            data=serialized.encode(),
            headers={
                "Authorization": f"Bearer {self._upstash_token}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=2.0):
                pass
        except urllib.error.URLError:
            pass

    async def delete(self, key: str) -> None:
        self._memory_cache.pop(key, None)
        if self.has_upstash:
            try:
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, self._upstash_del, key)
            except Exception as exc:
                logger.warning("Upstash del error for %s: %s", key, exc)

    def _upstash_del(self, key: str) -> None:
        req = urllib.request.Request(
            f"{self._upstash_url}/del/{urllib.parse.quote(key)}",
            headers={"Authorization": f"Bearer {self._upstash_token}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=2.0):
                pass
        except urllib.error.URLError:
            pass

    async def delete_prefix(self, prefix: str) -> None:
        keys_to_del = [k for k in self._memory_cache if k.startswith(prefix)]
        for k in keys_to_del:
            self._memory_cache.pop(k, None)


cache = CacheLayer()
