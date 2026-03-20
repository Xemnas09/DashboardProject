"""
Upload router: /upload, /api/upload, /api/upload/url, /api/select-sheet, /clear_data
"""
import os
import uuid
import asyncio

from fastapi import APIRouter, Request, Response, Depends, UploadFile, File
from starlette.requests import ClientDisconnect
from loguru import logger

from core.settings import settings
from api.auth.schemas import TokenPayload
from schemas.upload import SheetSelectRequest, UrlImportRequest
from core.dependencies import get_current_user, limiter
from core.exceptions import ValidationException
from datetime import datetime, timezone
from services.file_processor import (
    validate_extension,
    save_upload_chunked,
    process_file_preview,
    get_sheet_previews_parallel,
)
from services.data_cache import CacheEntry
from services.notifications import notification_store

router = APIRouter(tags=["Upload"])


# ---------------------------------------------------------------------------
# POST /api/upload
# ---------------------------------------------------------------------------
@router.post("/upload")
@limiter.limit("10/minute")
async def upload_file_legacy(
    request: Request,
    file: UploadFile = File(...),
    user: TokenPayload = Depends(get_current_user),
):
    """Legacy endpoint for backward compatibility with tests."""
    return await upload_file(request, file, user)


@router.post("/api/upload")
@limiter.limit("10/minute")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    user: TokenPayload = Depends(get_current_user),
):
    if not file.filename:
        raise ValidationException("Nom de fichier vide")

    # Validate extension + generate safe UUID name
    safe_name = validate_extension(file.filename)
    filepath = os.path.join(settings.upload_folder, safe_name)

    upload_success = False
    try:
        # Stream to disk in chunks (50MB limit)
        await save_upload_chunked(file, filepath)

        # Generate preview & Hydrate RAM Cache
        preview_data = await process_file_preview(user.cache_id, filepath)

        # Get file size in MB
        file_size_mb = 0.0
        if os.path.exists(filepath):
            file_size_mb = round(os.path.getsize(filepath) / (1024 * 1024), 1)

        cache_id = user.cache_id
        from services.data_cache import cache_manager

        entry = CacheEntry(
            id=cache_id,
            filepath=filepath,
            filename=file.filename,
            schema_overrides=preview_data.get('suggested_overrides', {}) if preview_data else {},
            preview=preview_data,
            selected_sheet=preview_data.get('selected_sheet') if preview_data else None,
            imported_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            file_size_mb=file_size_mb
        )

        # Handle multi-sheet Excel
        if preview_data and preview_data.get('requires_sheet_selection'):
            previews = get_sheet_previews_parallel(filepath)
            entry.preview = None
            entry.pending_sheets = preview_data['sheets']
            await cache_manager.set(cache_id, entry)
            upload_success = True
            return {
                "status": "requires_sheet",
                "sheets": preview_data['sheets'],
                "all_previews": previews,
                "message": "Plusieurs feuilles détectées.",
            }

        await cache_manager.set(cache_id, entry)

        notif = notification_store.add(user.sub, f"Fichier {file.filename} importé", "info")
        logger.info(f"File uploaded: {file.filename} → {safe_name} [user={user.sub}]")

        upload_success = True
        return {
            "status": "success",
            "message": "Fichier reçu et traité avec succès !",
            "notification": notif,
        }
    except (asyncio.CancelledError, ClientDisconnect):
        logger.warning(f"Upload annulé par le client : {file.filename}")
        raise
    except Exception as e:
        logger.error(f"Erreur inattendue durant l'upload de {file.filename}: {e}")
        raise
    finally:
        # Nettoyage du fichier incomplet / corrompu s'il y a eu un problème (ex: annulation)
        if not upload_success and os.path.exists(filepath):
            try:
                os.remove(filepath)
                if os.path.exists(f"{filepath}.ipc"):
                    os.remove(f"{filepath}.ipc")
                logger.info(f"Fichier partiel supprimé suite à l'annulation : {filepath}")
            except OSError:
                pass


# ---------------------------------------------------------------------------
# POST /api/upload/select-sheet (Legacy alias: /api/select-sheet)
# ---------------------------------------------------------------------------
@router.post("/api/select-sheet")  # Backward compatibility for tests
@router.post("/api/upload/select-sheet")
async def select_sheet(
    body: SheetSelectRequest,
    user: TokenPayload = Depends(get_current_user),
):
    from services.data_cache import cache_manager
    entry = await cache_manager.get(user.cache_id)
    if not entry:
        raise ValidationException("Aucun fichier en attente")

    if not entry.filepath:
        raise ValidationException("Chemin du fichier introuvable")

    preview_data = await process_file_preview(user.cache_id, entry.filepath, sheet_name=body.sheet_name)

    setattr(entry, 'stats_cache', None)  # Invalidate stats
    setattr(entry, 'db_preview', None)   # Invalidate database view cache
    entry.preview = preview_data
    entry.selected_sheet = body.sheet_name
    # Populate overrides from the new sheet's inference if high confidence
    if preview_data and preview_data.get('suggested_overrides'):
        entry.schema_overrides.update(preview_data['suggested_overrides'])
    
    entry.pending_sheets = None
    await cache_manager.set(user.cache_id, entry)

    notif = notification_store.add(user.sub, f"Feuille '{body.sheet_name}' chargée", "info")

    return {
        "status": "success",
        "message": "Feuille chargée avec succès !",
        "notification": notif,
    }


# ---------------------------------------------------------------------------
# POST /api/upload/sheet-preview
# ---------------------------------------------------------------------------
@router.post("/api/upload/sheet-preview")
async def sheet_preview(
    body: SheetSelectRequest,
    user: TokenPayload = Depends(get_current_user),
):
    from services.data_cache import cache_manager
    entry = await cache_manager.get(user.cache_id)
    if not entry or not entry.filepath:
        raise ValidationException("Aucun fichier en attente")

    # Lightweight preview for the specific sheet
    preview_data = await process_file_preview(user.cache_id, entry.filepath, sheet_name=body.sheet_name, row_limit=10)
    
    if not preview_data:
        raise ValidationException("Impossible de générer l'aperçu de la feuille")

    # Important: Don't persist yet, just return to the UI
    return {
        "status": "success",
        "preview": {
            "columns": preview_data['columns'],
            "data": preview_data['data'],
            "total_rows": preview_data['total_rows']
        }
    }


# ---------------------------------------------------------------------------
# POST /clear_data
# ---------------------------------------------------------------------------
@router.post("/clear_data")
@router.post("/api/clear_data")  # Add alias for consistency
async def clear_data(user: TokenPayload = Depends(get_current_user)):
    from services.data_cache import cache_manager
    entry = await cache_manager.get(user.cache_id)
    if entry:
        # Delete file from disk
        if entry.filepath and os.path.exists(entry.filepath):
            try:
                os.remove(entry.filepath)
            except OSError:
                pass
        await cache_manager.delete(user.cache_id)
        notification_store.add(user.sub, "Données supprimées", "warning")

    return {"status": "success"}


# ---------------------------------------------------------------------------
# POST /api/upload/url
# ---------------------------------------------------------------------------
@router.post("/api/upload/url")
@limiter.limit("5/minute")
async def upload_from_url(
    request: Request,
    body: UrlImportRequest,
    user: TokenPayload = Depends(get_current_user),
):
    """
    Import a dataset from a remote URL.

    Supports:
      - Direct file links (CSV, TSV, XLSX, XLS, JSON, Parquet)
      - Public Google Sheets URLs (auto-converted to CSV export)

    Rate-limited to 5 requests per minute (URL downloads are heavier than uploads).
    """
    from services.url_importer import import_from_url
    from services.data_cache import cache_manager

    # Download from URL → save to uploads/ folder
    filepath = None
    upload_success = False
    try:
        filepath, detected_filename = await import_from_url(
            url=str(body.url),
            upload_folder=settings.upload_folder,
        )

        # Generate preview using the same pipeline as a normal upload
        preview_data = await process_file_preview(user.cache_id, filepath)

        file_size_mb = 0.0
        if os.path.exists(filepath):
            file_size_mb = round(os.path.getsize(filepath) / (1024 * 1024), 1)

        cache_id = user.cache_id
        entry = CacheEntry(
            id=cache_id,
            filepath=filepath,
            filename=detected_filename,
            schema_overrides=preview_data.get('suggested_overrides', {}) if preview_data else {},
            preview=preview_data,
            selected_sheet=preview_data.get('selected_sheet') if preview_data else None,
            imported_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            file_size_mb=file_size_mb,
        )

        # Handle multi-sheet Excel returned from URL
        if preview_data and preview_data.get('requires_sheet_selection'):
            from services.file_processor import get_sheet_previews_parallel
            previews = get_sheet_previews_parallel(filepath)
            entry.preview = None
            entry.pending_sheets = preview_data['sheets']
            await cache_manager.set(cache_id, entry)
            upload_success = True
            return {
                "status": "requires_sheet",
                "sheets": preview_data['sheets'],
                "all_previews": previews,
                "message": "Plusieurs feuilles détectées.",
            }

        await cache_manager.set(cache_id, entry)

        notif = notification_store.add(
            user.sub,
            f"Fichier importé depuis URL : {detected_filename}",
            "info",
        )
        logger.info(f"URL import completed: {detected_filename} [user={user.sub}]")

        upload_success = True
        return {
            "status": "success",
            "message": "Fichier importé et traité avec succès !",
            "notification": notif,
        }
    except (asyncio.CancelledError, ClientDisconnect):
        logger.warning(f"Importation URL annulée par le client : {body.url}")
        raise
    except Exception as e:
        logger.error(f"Erreur inattendue durant l'import URL {body.url}: {e}")
        raise
    finally:
        if not upload_success and filepath and os.path.exists(filepath):
            try:
                os.remove(filepath)
                if os.path.exists(f"{filepath}.ipc"):
                    os.remove(f"{filepath}.ipc")
                logger.info(f"Fichier URL partiel supprimé suite à l'annulation : {filepath}")
            except OSError:
                pass
