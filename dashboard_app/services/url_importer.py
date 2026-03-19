"""
URL Importer Service.

Handles downloading files from remote URLs for data import.

Features:
  - Google Sheets public URL detection and auto-conversion to CSV export URL
  - Streaming download via httpx (no RAM spike for large files)
  - Content-Type MIME → extension sniffing
  - Extension fallback from URL path
  - Comprehensive error handling (network, HTTP, timeout, redirect, MIME type)
"""

import os
import uuid
import re
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse, urlunparse, urlencode, parse_qs, urljoin
from typing import Tuple

import httpx
from loguru import logger

from core.exceptions import UrlImportException, UrlContentTypeException
from services.file_processor import ALLOWED_EXTENSIONS, MIME_TO_EXT


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
# Timeout: 30s to connect, 120s to read the full response
_CONNECT_TIMEOUT = 30.0
_READ_TIMEOUT = 120.0

# Google Sheets URL pattern
_SHEETS_PATTERN = re.compile(
    r"https://docs\.google\.com/spreadsheets/d/([A-Za-z0-9_\-]+)"
)

# Maximum file size for URL imports (no hard limit per spec, but log a warning above 50 MB)
_SOFT_LIMIT_BYTES = 50 * 1024 * 1024


# ---------------------------------------------------------------------------
# Google Sheets helpers
# ---------------------------------------------------------------------------
def is_google_sheets_url(url: str) -> bool:
    """Return True if the URL points to a Google Sheets document."""
    return bool(_SHEETS_PATTERN.search(url))


def convert_google_sheets_to_csv_url(url: str) -> str:
    """
    Convert a Google Sheets share/edit URL to its CSV export URL.

    Supports:
      - https://docs.google.com/spreadsheets/d/{ID}/edit...
      - https://docs.google.com/spreadsheets/d/{ID}/pub...
      - https://docs.google.com/spreadsheets/d/{ID}  (bare)

    Args:
        url: Original Google Sheets URL.

    Returns:
        Direct CSV export URL.

    Raises:
        UrlImportException: If the spreadsheet ID cannot be extracted.
    """
    match = _SHEETS_PATTERN.search(url)
    if not match:
        raise UrlImportException(
            "Impossible d'extraire l'identifiant de la feuille Google Sheets depuis l'URL fournie."
        )
    sheet_id = match.group(1)
    # Extract optional gid (sheet tab) from query string
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    gid = qs.get("gid", [None])[0]

    export_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"
    if gid:
        export_url += f"&gid={gid}"
    logger.info(f"Google Sheets URL converted: {url!r} → {export_url!r}")
    return export_url


# ---------------------------------------------------------------------------
# MIME sniffing
# ---------------------------------------------------------------------------
def _guess_extension_from_mime(content_type: str) -> str:
    """
    Map a Content-Type header to a file extension.

    Args:
        content_type: The raw Content-Type header value (may include charset etc.)

    Returns:
        File extension (e.g. '.csv') or '' if unknown.
    """
    mime = content_type.split(";")[0].strip().lower()
    return MIME_TO_EXT.get(mime, "")


def _guess_extension_from_url(url: str) -> str:
    """
    Extract the file extension from the URL path as a fallback.

    Args:
        url: The request URL.

    Returns:
        File extension (e.g. '.csv') or '' if none.
    """
    path = PurePosixPath(urlparse(url).path)
    return path.suffix.lower()


# ---------------------------------------------------------------------------
# Main importer
# ---------------------------------------------------------------------------
async def import_from_url(url: str, upload_folder: str) -> Tuple[str, str]:
    """
    Download a file from a remote URL and save it to the upload folder.

    Performs:
      1. Google Sheets URL detection + conversion
      2. Streaming HTTP GET with timeout
      3. Content-Type → extension sniffing (fallback: URL path extension)
      4. Extension validation against ALLOWED_EXTENSIONS
      5. Stream to disk (avoids loading everything into RAM)

    Args:
        url: The source URL (supports direct file links and Google Sheets public URLs).
        upload_folder: Local directory where the file will be saved.

    Returns:
        Tuple of (absolute_filepath, detected_filename).

    Raises:
        UrlImportException: On network, HTTP, or timeout errors.
        UrlContentTypeException: If the URL content is not a supported format.
    """
    original_url = url

    # ── Step 1: Google Sheets conversion ────────────────────────────────────
    if is_google_sheets_url(url):
        url = convert_google_sheets_to_csv_url(url)

    # ── Step 2: HTTP download ────────────────────────────────────────────────
    logger.info(f"Importing from URL: {url!r}")
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            max_redirects=10,
            timeout=120.0,
            headers={"User-Agent": "Datavera/0.3 (data-import)"},
        ) as client:
            async with client.stream("GET", url) as response:

                # ── HTTP error detection ─────────────────────────────────────
                if response.status_code == 403 and is_google_sheets_url(original_url):
                    raise UrlImportException(
                        "La feuille Google Sheets n'est pas accessible publiquement. "
                        "Vérifiez que le partage est réglé sur 'Tout le monde avec le lien'."
                    )
                if response.status_code >= 400:
                    raise UrlImportException(
                        f"Le serveur a répondu avec une erreur HTTP {response.status_code} "
                        f"pour l'URL : {original_url}"
                    )

                # ── Extension detection ──────────────────────────────────────
                content_type = response.headers.get("content-type", "")
                ext = _guess_extension_from_mime(content_type)

                if not ext:
                    # Fallback: guess from the final (possibly redirected) URL
                    final_url = str(response.url)
                    ext = _guess_extension_from_url(final_url)

                if not ext:
                    ext = _guess_extension_from_url(original_url)

                if not ext or ext not in ALLOWED_EXTENSIONS:
                    # Special case: application/octet-stream with known ext from URL
                    if ext and ext in ALLOWED_EXTENSIONS:
                        pass  # valid
                    else:
                        raise UrlContentTypeException()

                # ── Stream to disk ───────────────────────────────────────────
                safe_name = f"{uuid.uuid4()}{ext}"
                dest_path = os.path.join(upload_folder, safe_name)
                total_bytes = 0

                os.makedirs(upload_folder, exist_ok=True)

                with open(dest_path, "wb") as f:
                    async for chunk in response.aiter_bytes(chunk_size=1024 * 1024):
                        f.write(chunk)
                        total_bytes += len(chunk)

                if total_bytes > _SOFT_LIMIT_BYTES:
                    logger.warning(
                        f"URL import: file size {total_bytes / 1024 / 1024:.1f} MB "
                        f"exceeds soft limit of {_SOFT_LIMIT_BYTES // 1024 // 1024} MB"
                    )

                # Detect a readable filename from the URL for display purposes
                parsed_final = urlparse(str(response.url))
                url_filename = PurePosixPath(parsed_final.path).name or f"import{ext}"

                logger.success(
                    f"URL import complete: {url!r} → {dest_path} ({total_bytes / 1024:.0f} KB)"
                )
                return dest_path, url_filename

    except UrlImportException:
        raise  # already structured
    except UrlContentTypeException:
        raise  # already structured
    except httpx.ConnectTimeout:
        raise UrlImportException(
            f"Délai de connexion dépassé ({_CONNECT_TIMEOUT:.0f}s) pour : {original_url}"
        )
    except httpx.ReadTimeout:
        raise UrlImportException(
            f"Délai de téléchargement dépassé ({_READ_TIMEOUT:.0f}s) pour : {original_url}"
        )
    except httpx.TooManyRedirects:
        raise UrlImportException(
            f"Trop de redirections (max 10) pour : {original_url}"
        )
    except httpx.ConnectError:
        raise UrlImportException(
            f"Impossible de se connecter à l'URL : {original_url} "
            "(vérifiez que l'URL est accessible)"
        )
    except httpx.HTTPError as e:
        raise UrlImportException(f"Erreur réseau lors du téléchargement : {e}")
    except Exception as e:
        raise UrlImportException(f"Erreur inattendue lors de l'import depuis l'URL : {e}")
