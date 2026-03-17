"""
Dashboard router: /api/dashboard/summary
"""
import polars as pl
from fastapi import APIRouter, Depends
from datetime import datetime, timezone
from typing import Any

from api.auth.schemas import TokenPayload
from core.dependencies import get_current_user
from services.file_processor import read_cached_df
from services.data_cache import cache_manager

router = APIRouter(tags=["Dashboard"])

@router.get("/api/dashboard/summary")
async def get_dashboard_summary(user: TokenPayload = Depends(get_current_user)):
    entry = await cache_manager.get(user.cache_id)
    if not entry or not entry.filepath:
        return {"has_data": False}

    # If multi-sheet file but no sheet selected yet
    if entry.pending_sheets and not entry.selected_sheet:
        return {"has_data": False}

    df = read_cached_df(entry.filepath, entry.selected_sheet, entry.schema_overrides)
    if df is None:
        return {"has_data": False}

    total = len(df)
    col_count = len(df.columns)

    # Numeric vs categorical
    numeric_cols = [c for c in df.columns if df[c].dtype.is_numeric()]
    categorical_cols = [c for c in df.columns if not df[c].dtype.is_numeric()]

    # Global null rate
    total_cells = total * col_count
    null_cells = sum(int(df[c].null_count()) for c in df.columns)
    null_rate = round((null_cells / total_cells) * 100, 1) if total_cells > 0 else 0

    # Column warnings — high null rate columns (> 10%)
    col_warnings = [
        c for c in df.columns
        if (int(df[c].null_count()) / total) > 0.1
    ] if total > 0 else []

    # Quality score (heuristic)
    quality_score = max(0, round(100 - null_rate - (len(col_warnings) * 2)))

    return {
        "has_data": True,
        "filename": entry.filename,
        "imported_at": entry.imported_at or datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        "file_size_mb": entry.file_size_mb,
        "row_count": total,
        "col_count": col_count,
        "numeric_count": len(numeric_cols),
        "categorical_count": len(categorical_cols),
        "null_rate": null_rate,
        "quality_score": quality_score,
        "col_warnings": col_warnings[:5],  # max 5 for UI clarity
        "anomaly_count": entry.last_anomaly_count,
    }
