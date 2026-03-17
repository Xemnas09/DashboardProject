"""
Upload router: /upload, /api/select-sheet, /clear_data
"""
import os
import uuid

from fastapi import APIRouter, Request, Response, Depends, UploadFile, File
from loguru import logger

from core.settings import settings
from api.auth.schemas import TokenPayload
from schemas.upload import SheetSelectRequest
from core.dependencies import get_current_user, limiter
from core.exceptions import ValidationException
from services.file_processor import (
    validate_extension,
    save_upload_chunked,
    process_file_preview,
    get_sheet_previews_parallel,
)
from services.data_cache import CacheEntry
from services.notifications import notification_store
from routers.database import reset_stats_cache

router = APIRouter(tags=["Upload"])


# ---------------------------------------------------------------------------
# POST /api/upload
# ---------------------------------------------------------------------------
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

    # Stream to disk in chunks (50MB limit)
    await save_upload_chunked(file, filepath)

    # Generate preview
    preview_data = process_file_preview(filepath)
    reset_stats_cache()

    cache_id = user.cache_id
    from main import cache_manager

    entry = CacheEntry(
        filepath=filepath,
        filename=file.filename,
        schema_overrides=preview_data.get('suggested_overrides', {}) if preview_data else {},
        preview=preview_data,
        selected_sheet=preview_data.get('selected_sheet') if preview_data else None,
    )

    # Handle multi-sheet Excel
    if preview_data and preview_data.get('requires_sheet_selection'):
        previews = get_sheet_previews_parallel(filepath)
        entry.preview = None
        entry.pending_sheets = preview_data['sheets']
        await cache_manager.set(cache_id, entry)
        return {
            "status": "requires_sheet",
            "sheets": preview_data['sheets'],
            "all_previews": previews,
            "message": "Plusieurs feuilles détectées.",
        }

    await cache_manager.set(cache_id, entry)

    notif = notification_store.add(user.sub, f"Fichier {file.filename} importé", "info")
    logger.info(f"File uploaded: {file.filename} → {safe_name} [user={user.sub}]")

    return {
        "status": "success",
        "message": "Fichier reçu et traité avec succès !",
        "notification": notif,
    }


# ---------------------------------------------------------------------------
# POST /api/upload/select-sheet
# ---------------------------------------------------------------------------
@router.post("/api/upload/select-sheet")
async def select_sheet(
    body: SheetSelectRequest,
    user: TokenPayload = Depends(get_current_user),
):
    from main import cache_manager
    entry = await cache_manager.get(user.cache_id)
    if not entry:
        raise ValidationException("Aucun fichier en attente")

    if not entry.filepath:
        raise ValidationException("Chemin du fichier introuvable")

    preview_data = process_file_preview(entry.filepath, sheet_name=body.sheet_name)
    reset_stats_cache()

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
    from main import cache_manager
    entry = await cache_manager.get(user.cache_id)
    if not entry or not entry.filepath:
        raise ValidationException("Aucun fichier en attente")

    # Lightweight preview for the specific sheet
    preview_data = process_file_preview(entry.filepath, sheet_name=body.sheet_name, row_limit=10)
    
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
    from main import cache_manager
    entry = await cache_manager.get(user.cache_id)
    if entry:
        # Delete file from disk
        if entry.filepath and os.path.exists(entry.filepath):
            try:
                os.remove(entry.filepath)
            except OSError:
                pass
        await cache_manager.delete(user.cache_id)
        reset_stats_cache()
        notification_store.add(user.sub, "Données supprimées", "warning")

    return {"status": "success"}
