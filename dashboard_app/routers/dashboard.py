"""
Dashboard router: /api/dashboard/summary
"""
import polars as pl
from fastapi import APIRouter, Depends
from datetime import datetime, timezone
from typing import Any

from api.auth.schemas import TokenPayload
from core.dependencies import get_current_user
from services.file_processor import read_cached_df, classify_column
from services.data_cache import cache_manager
from services.data_service import get_df_for_user

router = APIRouter(tags=["Dashboard"])

@router.get("/api/dashboard/summary")
async def get_dashboard_summary(user: TokenPayload = Depends(get_current_user)):
    entry = await cache_manager.get(user.cache_id)
    if not entry or not entry.filepath:
        return {"has_data": False}

    # If multi-sheet file but no sheet selected yet
    if entry.pending_sheets and not entry.selected_sheet:
        return {"has_data": False}

    # 1. Fast Path: Use pre-calculated metadata
    if entry.summary_metadata:
        return {
            "has_data": True,
            "filename": entry.filename,
            "imported_at": entry.imported_at,
            "file_size_mb": entry.file_size_mb,
            "anomaly_count": entry.last_anomaly_count,
            **entry.summary_metadata
        }

    # 2. Slow Path (Safe Fallback): Compute using RAM-Cached DF if available
    df = get_df_for_user(entry)
    
    # Optimized stats using native Polars aggregations (no Python loops)
    total = len(df)
    col_count = len(df.columns)
    null_cells = int(df.null_count().sum_horizontal().sum())
    null_rate = round((null_cells / (total * col_count)) * 100, 1) if total * col_count > 0 else 0

    # Variable counts using unified classification
    cat_count = 0
    num_count = 0
    for c in df.columns:
        if classify_column(df[c]) in ["continuous", "discrete", "numeric"]:
            num_count += 1
        else:
            cat_count += 1

    # Quick Column warnings (top 5 high null rate)
    stats = df.null_count()
    col_warnings = [
        col for col in df.columns 
        if total > 0 and (int(stats[col][0]) / total) > 0.1
    ][:5]

    # Quality score
    quality_score = max(0, round(100 - null_rate - (len(col_warnings) * 2)))
    
    # Store in cache for next hit
    entry.summary_metadata = {
        "row_count": total,
        "col_count": col_count,
        "numeric_count": num_count,
        "categorical_count": cat_count,
        "null_rate": null_rate,
        "quality_score": quality_score,
        "col_warnings": col_warnings
    }
    await cache_manager.set(user.cache_id, entry)

    return {
        "has_data": True,
        "filename": entry.filename,
        "imported_at": entry.imported_at,
        "file_size_mb": entry.file_size_mb,
        "anomaly_count": entry.last_anomaly_count,
        **entry.summary_metadata
    }
