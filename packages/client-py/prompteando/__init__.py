"""Cliente oficial de Prompteando para Python. Sin dependencias."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

__all__ = ["Client", "PrompteandoError"]

_DEFAULT_BASE_URL = "https://prompteando.online"
_DEFAULT_TTL = 60.0


class PrompteandoError(Exception):
    def __init__(self, message: str, status: int, body: Any) -> None:
        super().__init__(message)
        self.status = status
        self.body = body


class Client:
    """Consume prompts versionados desde tu instancia de Prompteando."""

    def __init__(
        self,
        api_key: str,
        base_url: str = _DEFAULT_BASE_URL,
        cache_ttl: float = _DEFAULT_TTL,
    ) -> None:
        if not api_key:
            raise ValueError("api_key is required")
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._ttl = cache_ttl
        self._cache: dict[str, tuple[float, dict[str, Any]]] = {}
        self._last_good: dict[str, dict[str, Any]] = {}

    def get_prompt(
        self,
        slug: str,
        label: Optional[str] = None,
        version: Optional[int] = None,
    ) -> dict[str, Any]:
        """Trae un prompt; cachea por ``cache_ttl`` y hace fallback al
        último valor bueno ante errores de red / 5xx."""
        key = f"{slug}|{label or ''}|{version or ''}"
        now = time.monotonic()
        cached = self._cache.get(key)
        if cached and cached[0] > now:
            return cached[1]

        query = f"?label={urllib.parse.quote(label)}" if label else ""
        url = f"{self._base_url}/v1/prompts/{urllib.parse.quote(slug)}{query}"
        try:
            value = self._request("GET", url)
            self._cache[key] = (now + self._ttl, value)
            self._last_good[key] = value
            return value
        except PrompteandoError as err:
            fallback = self._last_good.get(key)
            if fallback is not None and err.status >= 500:
                return fallback
            raise
        except urllib.error.URLError:
            fallback = self._last_good.get(key)
            if fallback is not None:
                return fallback
            raise

    def render(
        self,
        slug: str,
        vars: Optional[dict[str, str]] = None,
        label: Optional[str] = None,
        version: Optional[int] = None,
        placeholders: Optional[dict[str, list[dict[str, Any]]]] = None,
    ) -> dict[str, Any]:
        """Renderiza un prompt template/chat con las variables dadas."""
        url = f"{self._base_url}/v1/prompts/{urllib.parse.quote(slug)}/render"
        body: dict[str, Any] = {"vars": vars or {}}
        if version is not None:
            body["version"] = version
        if label is not None:
            body["label"] = label
        if placeholders is not None:
            body["placeholders"] = placeholders
        return self._request("POST", url, body)

    def _request(
        self, method: str, url: str, body: Optional[dict[str, Any]] = None
    ) -> dict[str, Any]:
        data = json.dumps(body).encode() if body is not None else None
        headers = {"authorization": f"Bearer {self._api_key}"}
        if data is not None:
            headers["content-type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read().decode() or "null")
        except urllib.error.HTTPError as err:
            raw = err.read().decode() or "null"
            parsed = json.loads(raw) if raw else None
            message = (parsed or {}).get("error", f"HTTP {err.code}")
            raise PrompteandoError(message, err.code, parsed) from err
