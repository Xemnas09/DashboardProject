"""
Database router: /api/database, /api/database/recast, /api/calculated-field, /api/anomalies, /api/database/stats.
"""

import os
import time
import polars as pl
from fastapi import APIRouter, Request, Depends
from loguru import logger
from typing import Dict, List, Any, Optional

from api.auth.schemas import TokenPayload
from schemas.database import RecastRequest, ExpressionRequest
from schemas.anomaly import AnomalyRequest, AnomalyResponse
from core.dependencies import get_current_user, limiter
from core.exceptions import ValidationException, NotFoundException, SessionExpiredException
from services.file_processor import process_file_preview, read_cached_df, apply_filters
from services.expression_parser import parse_expression
from services.notifications import notification_store
from services.data_cache import cache_manager
from services.column_classifier import classify_column
from services.data_service import apply_recast, save_df_resilient
from services.anomaly_detector import anomaly_detector
from services.llm_interpreter import llm_interpreter

router = APIRouter(tags=["Database"])

# Global cache for statistics to avoid re-calculating on every request
_stats_cache: Optional[Dict[str, Any]] = None

def reset_stats_cache():
    """Invalidates the global statistics cache."""
    global _stats_cache
    _stats_cache = None

def _get_df(entry) -> pl.DataFrame:
    """Helper to read the full dataframe from a cache entry or raise 404."""
    df = read_cached_df(entry.filepath, entry.selected_sheet, entry.schema_overrides)
    if df is None:
        raise NotFoundException("Impossible de lire les données")
    return df

# ---------------------------------------------------------------------------
# GET /api/database
# ---------------------------------------------------------------------------
@router.get("/api/database")
async def database_view(
    request: Request,
    user: TokenPayload = Depends(get_current_user),
):
    """Returns a metadata preview of the current database state."""
    entry = await cache_manager.get(user.cache_id)
    if not entry:
        return {"status": "success", "data_preview": None}

    # Guard: If sheet selection is required but not yet done
    if entry.pending_sheets and not entry.selected_sheet:
        return {"status": "success", "data_preview": None, "requires_sheet": True}

    df = _get_df(entry)

    # Prepare Preview
    data_preview = {
        'columns': [{
            'field': c,
            'title': c,
            'dtype': str(df[c].dtype),
            'is_numeric': df[c].dtype.is_numeric(),
            'semantic_type': classify_column(df[c]),
            'is_identifier': classify_column(df[c]) == "identifier",
        } for c in df.columns],
        'data': df.head(2000).to_dicts(),
        'total_rows': len(df),
    }
    return {"status": "success", "data_preview": data_preview}

# ---------------------------------------------------------------------------
# POST /api/database/recast
# ---------------------------------------------------------------------------
@router.post("/api/database/recast")
async def database_recast(
    body: RecastRequest,
    user: TokenPayload = Depends(get_current_user),
):
    """Updates column types (casting) and persists changes to disk."""
    entry = await cache_manager.get(user.cache_id)
    if not entry:
        raise SessionExpiredException()

    filepath = entry.filepath
    selected_sheet = entry.selected_sheet

    if not filepath or not os.path.exists(filepath):
        raise NotFoundException("Fichier introuvable")

    modifications = body.modifications
    if not modifications:
        return {"status": "success", "message": "Aucune modification"}

    # 1. Load the raw dataframe
    df = read_cached_df(filepath, selected_sheet)
    if df is None:
         raise ValidationException("Impossible de charger le fichier pour le retypage")

    # 2. Apply complex recast logic (Service Layer)
    try:
        df, warnings = apply_recast(df, modifications)
    except ValueError as e:
        raise ValidationException(str(e))

    # 3. Save modifications (Atomic/Resilient)
    success = save_df_resilient(df, filepath, selected_sheet)
    if not success:
        raise ValidationException("Échec de l'enregistrement du fichier (verrouillage Windows)")

    # 4. Update session metadata and cache
    for mod in modifications:
        if mod.column in df.columns:
            entry.schema_overrides[mod.column] = mod.type

    # Refresh the preview for the frontend
    entry.preview = process_file_preview(
        filepath,
        sheet_name=selected_sheet,
        schema_overrides=entry.schema_overrides,
    )
    await cache_manager.set(user.cache_id, entry)
    reset_stats_cache()

    msg = f"{len(modifications)} variables re-typées"
    if warnings:
        msg += f" ({len(warnings)} alertes)"

    notif = notification_store.add(user.sub, msg, "warning" if warnings else "success")

    return {
        "status": "success",
        "message": msg,
        "warnings": warnings,
        "notification": notif,
    }

# ---------------------------------------------------------------------------
# POST /api/database/expression (Legacy alias: /api/calculated-field)
# ---------------------------------------------------------------------------
@router.post("/api/calculated-field")  # Backward compatibility for tests
@router.post("/api/database/expression")
@limiter.limit("20/minute")
async def create_calculated_field(
    request: Request,
    body: ExpressionRequest,
    user: TokenPayload = Depends(get_current_user),
):
    """Creates a new calculated column from a string expression."""
    entry = await cache_manager.get(user.cache_id)
    if not entry:
        raise SessionExpiredException()

    new_col_name = body.name.strip()
    expression = body.expression.strip()

    if not new_col_name:
        raise ValidationException("Nom du champ requis")
    if not expression:
        raise ValidationException("Expression requise")

    df = _get_df(entry)

    if new_col_name in df.columns:
        raise ValidationException(f'La colonne "{new_col_name}" existe déjà')

    try:
        expr = parse_expression(expression, df.columns)
        new_series = df.select(expr.alias("__temp__")).get_column("__temp__")
        
        # Mathematical Safety Check
        if not body.force:
            # Check for NaN or Inf (common for div by zero)
            total_issues = (new_series.is_null().sum() if not new_series.dtype.is_float() 
                            else (new_series.is_nan().sum() + new_series.is_infinite().sum()))
            
            if total_issues > 0:
                from fastapi.responses import JSONResponse
                return JSONResponse(
                    status_code=400,
                    content={
                        "status": "warning",
                        "error_type": "MATH_WARNING",
                        "affected_rows": int(total_issues),
                        "total_rows": len(df),
                        "message": f"{total_issues} lignes produiront des erreurs mathématiques (NaN/Inf).",
                        "details": "Cela arrive généralement lors de divisions par zéro ou d'opérations hors domaine."
                    }
                )

        if body.force and new_series.dtype.is_float():
            new_series = new_series.fill_nan(None)
            new_series = pl.when(new_series.is_infinite()).then(None).otherwise(new_series)

        df = df.with_columns(new_series.alias(new_col_name))
        
    except Exception as e:
        logger.error(f"Error parsing expression: {e}")
        raise ValidationException(f"Erreur de syntaxe ou de calcul: {str(e)}")

    # Save changes (Service Layer)
    success = save_df_resilient(df, entry.filepath, entry.selected_sheet)
    if not success:
         raise ValidationException("Échec de l'enregistrement du nouveau champ (verrouillage Windows)")

    # Refresh metadata
    entry.preview = process_file_preview(
        entry.filepath,
        sheet_name=entry.selected_sheet,
        schema_overrides=entry.schema_overrides,
    )
    await cache_manager.set(user.cache_id, entry)
    reset_stats_cache()

    notif = notification_store.add(user.sub, f'Champ calculé "{new_col_name}" créé', "success")

    return {
        "status": "success",
        "message": f'Colonne "{new_col_name}" créée',
        "notification": notif,
        "new_column": {
            "name": new_col_name,
            "dtype": str(df[new_col_name].dtype),
            "is_numeric": df[new_col_name].dtype.is_numeric(),
        },
    }

# ---------------------------------------------------------------------------
# POST /api/anomalies
# ---------------------------------------------------------------------------
@router.post("/api/anomalies", response_model=AnomalyResponse)
@limiter.limit("20/minute")
async def detect_anomalies(
    request: Request,
    body: AnomalyRequest,
    user: TokenPayload = Depends(get_current_user),
):
    """Detects statistical outliers in the specified columns."""
    entry = await cache_manager.get(user.cache_id)
    if not entry: raise SessionExpiredException()
    
    df = _get_df(entry)
    total_rows = len(df)
    
    anomalies, skipped = anomaly_detector.detect(df, body.columns, body.method, body.threshold)
    anomaly_count = len(anomalies)
    anomaly_rate = round((anomaly_count / total_rows) * 100, 2) if total_rows > 0 else 0

    # LLM Interpretation of the results
    llm_summary = None
    if anomaly_count > 0:
        freqs = {}
        for a in anomalies:
            for c in a["flagged_columns"]:
                freqs[c] = freqs.get(c, 0) + 1
        
        # Sample for the LLM
        top_anomalies = [
            {c: a["values"][c] for c in a["flagged_columns"][:3]} 
            for a in anomalies[:3]
        ]
        
        llm_summary = await llm_interpreter.summarize_anomalies(
            anomaly_count, anomaly_rate, body.method, freqs, top_anomalies, body.language
        )

    # Persist anomaly count for dashboard
    entry.last_anomaly_count = anomaly_count
    await cache_manager.set(user.cache_id, entry)

    return {
        "status": "success",
        "method_used": body.method,
        "total_rows": total_rows,
        "anomaly_count": anomaly_count,
        "anomaly_rate": anomaly_rate,
        "skipped_columns": skipped,
        "anomalies": anomalies,
        "llm_summary": llm_summary
    }

# ---------------------------------------------------------------------------
# GET /api/database/stats
# ---------------------------------------------------------------------------
@router.get("/api/database/stats")
async def get_column_stats(
    user: TokenPayload = Depends(get_current_user)
):
    """Computes distribution and descriptive statistics for all columns."""
    global _stats_cache
    
    if _stats_cache is not None:
        return {"status": "success", "stats": _stats_cache}

    entry = await cache_manager.get(user.cache_id)
    if not entry:
        return {"status": "success", "stats": {}}

    # Guard: If sheet selection is required but not yet done
    if entry.pending_sheets and not entry.selected_sheet:
        return {"status": "success", "stats": {}, "requires_sheet": True}

    df = _get_df(entry)
    stats = {}
    total_rows = len(df)

    for i, col in enumerate(df.columns):
        series = df[col]
        null_count = int(series.null_count())
        null_pct = round((null_count / total_rows) * 100, 1) if total_rows > 0 else 0
        unique_count = int(series.n_unique())
        
        # 1. Determine Semantic Type
        col_type = classify_column(series)
        
        # 2. Base metrics
        metrics = {
            "count": total_rows,
            "nulls": null_count,
            "null_pct": null_pct,
            "uniques": unique_count,
        }
        
        dist_data = []

        if col_type == "identifier":
            metrics.update({
                "min": float(series.min()) if series.dtype.is_numeric() else str(series.min()),
                "max": float(series.max()) if series.dtype.is_numeric() else str(series.max()),
            })

        elif col_type == "boolean":
            # Dynamic label detection for Boolean columns
            modalities = series.drop_nulls().unique().to_list()
            if len(modalities) == 2:
                m1, m2 = modalities[0], modalities[1]
                pos_markers = ["1", "true", "yes", "oui", "vrai", "t", "y", "o"]
                m1_str = str(m1).lower()
                m2_str = str(m2).lower()
                
                if m1_str in pos_markers or (m2_str not in pos_markers and m1_str > m2_str):
                    label_true, label_false = m1, m2
                else:
                    label_true, label_false = m2, m1
                
                true_count = int((series == label_true).sum())
                false_count = int((series == label_false).sum())
            elif len(modalities) == 1:
                label_true = modalities[0]
                label_false = "N/A"
                true_count = int((series == label_true).sum())
                false_count = 0
            else:
                label_true, label_false = "Vrai", "Faux"
                true_count = 0
                false_count = 0
            
            non_null_count = total_rows - null_count
            metrics.update({
                "label_true": str(label_true),
                "label_false": str(label_false),
                "true_count": true_count,
                "true_pct": round((true_count / non_null_count * 100), 1) if non_null_count > 0 else 0,
                "false_count": false_count,
                "false_pct": round((false_count / non_null_count * 100), 1) if non_null_count > 0 else 0,
            })

        elif col_type == "numeric":
            # Descriptive stats for measures
            metrics.update({
                "min": float(series.min()) if series.min() is not None else 0.0,
                "max": float(series.max()) if series.max() is not None else 0.0,
                "mean": float(series.mean()) if series.mean() is not None else 0.0,
                "median": float(series.median()) if series.median() is not None else 0.0,
                "std": float(series.std()) if series.std() is not None else 0.0,
                "q1": float(series.quantile(0.25)) if series.quantile(0.25) is not None else 0.0,
                "q3": float(series.quantile(0.75)) if series.quantile(0.75) is not None else 0.0,
            })
            
            # Histogram generation
            clean_series = series.drop_nulls()
            if not clean_series.is_empty() and series.min() != series.max():
                h_min, h_max = float(series.min()), float(series.max())
                step = (h_max - h_min) / 20
                bin_df = clean_series.to_frame().with_columns(
                    ((pl.col(col) - h_min) / step).floor().cast(pl.Int32).clip(0, 19).alias("bin_idx")
                )
                hist_counts = bin_df.group_by("bin_idx").len().sort("bin_idx")
                dist_map = {int(row["bin_idx"]): int(row["len"]) for row in hist_counts.to_dicts()}
                for b_idx in range(20):
                    start = h_min + b_idx * step
                    end = h_min + (b_idx + 1) * step
                    dist_data.append({
                        "name": f"{start:.2f}-{end:.2f}",
                        "range": f"{start:.1f}-{end:.1f}",
                        "count": int(dist_map.get(b_idx, 0))
                    })
            
            # Additional discrete-style stats for numeric variables
            mode_list = series.mode().to_list()
            mode_val = str(mode_list[0]) if mode_list else "—"
            metrics.update({
                "mode": mode_val,
            })
            
            # If low cardinality, also provide a categorical-style distribution
            unique_count = series.n_unique()
            if unique_count <= 20:
                counts = series.value_counts().sort(by="count", descending=True).head(10)
                non_null_count = total_rows - null_count
                for row in counts.to_dicts():
                    val = row[col]
                    if val is None: continue
                    dist_data.append({
                        "value": str(val),
                        "count": int(row["count"]),
                        "pct": round((int(row["count"]) / non_null_count * 100), 1) if non_null_count > 0 else 0
                    })
        
        elif col_type == "categorical":
            mode_list = series.mode().to_list()
            mode_val = str(mode_list[0]) if mode_list else "—"
            metrics.update({
                "mode": mode_val,
            })
            
            # Distribution: top 10 most frequent items
            counts = series.value_counts().sort(by="count", descending=True).head(10)
            non_null_count = total_rows - null_count
            for row in counts.to_dicts():
                val = row[col]
                if val is None: continue
                dist_data.append({
                    "value": str(val) if not isinstance(val, (int, float, bool)) else val,
                    "count": int(row["count"]),
                    "pct": round((int(row["count"]) / non_null_count * 100), 1) if non_null_count > 0 else 0
                })
        
        elif col_type == "date":
            # Temporal metrics
            clean_series = series.drop_nulls()
            if not clean_series.is_empty():
                min_date = clean_series.min()
                max_date = clean_series.max()
                
                min_str = min_date.strftime("%Y-%m-%d") if hasattr(min_date, 'strftime') else str(min_date)
                max_str = max_date.strftime("%Y-%m-%d") if hasattr(max_date, 'strftime') else str(max_date)
                
                try:
                    duration_days = (max_date - min_date).days
                except Exception:
                    duration_days = "N/A"
                
                metrics.update({
                    "min_date": min_str,
                    "max_date": max_str,
                    "duration_days": duration_days,
                })

                # Temporal distribution (auto-grouping by Year or Month)
                try:
                    if isinstance(duration_days, int):
                        if duration_days > 1000:
                            grouped = clean_series.dt.year().value_counts().sort("count", descending=True).head(15)
                        else:
                            grouped = clean_series.dt.strftime("%Y-%m").value_counts().sort("count", descending=True).head(15)
                            
                        non_null_count = total_rows - null_count
                        for row in grouped.to_dicts():
                            val = row[col]
                            dist_data.append({
                                "value": str(val),
                                "count": int(row["count"]),
                                "pct": round((int(row["count"]) / non_null_count * 100), 1) if non_null_count > 0 else 0
                            })
                except Exception as e:
                    logger.error(f"Failed to calculate date distribution for {col}: {e}")

        stats[col] = {
            "type": col_type,
            "metrics": metrics,
            "distribution": dist_data
        }

    _stats_cache = stats
    return {"status": "success", "stats": _stats_cache}
