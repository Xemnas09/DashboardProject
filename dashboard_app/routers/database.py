"""
Database router: /api/database, /api/database/recast, /api/calculated-field
"""
import os
import shutil

import polars as pl
from fastapi import APIRouter, Request, Depends
from loguru import logger

from api.auth.schemas import TokenPayload
from schemas.database import RecastRequest, ExpressionRequest
from core.dependencies import get_current_user, limiter
from core.exceptions import ValidationException, NotFoundException, SessionExpiredException
from services.file_processor import process_file_preview, read_cached_df, apply_filters
from services.expression_parser import parse_expression
from services.notifications import notification_store

router = APIRouter(tags=["Database"])
_stats_cache = None


def reset_stats_cache():
    global _stats_cache
    _stats_cache = None


def _get_df(entry):
    """Read the full dataframe from a cache entry."""
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
    from services.data_cache import cache_manager
    entry = await cache_manager.get(user.cache_id)
    if not entry:
        return {"status": "success", "data_preview": None}

    df = _get_df(entry)

    from services.column_classifier import classify_column

    # 2. Prepare Preview
    data_preview = {
        'columns': [{'field': c, 'title': c} for c in df.columns],
        'columns_info': [{
            'name': c,
            'dtype': str(df[c].dtype),
            'is_numeric': df[c].dtype.is_numeric(),
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
    from services.data_cache import cache_manager
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

    # Load the dataframe
    if filepath.endswith('.csv'):
        with open(filepath, 'rb') as f:
            df = pl.read_csv(f.read(), ignore_errors=True)
    elif filepath.endswith('.xlsx'):
        if selected_sheet:
            df = pl.read_excel(filepath, sheet_name=selected_sheet)
        else:
            df = pl.read_excel(filepath)
    else:
        raise ValidationException("Format non supporté")

    # Build cast expressions
    expressions = []
    for mod in modifications:
        col_name = mod.column
        target_type = mod.type
        if col_name in df.columns:
            if target_type == 'String':
                expressions.append(pl.col(col_name).cast(pl.String))
            elif target_type in ('Int64', 'Float64'):
                # Aggressive numeric cleaning only for numeric targets
                clean_expr = pl.col(col_name).cast(pl.String).str.strip_chars().str.replace_all(r"[^\d.,\-]", "").str.replace(r",", ".")
                if target_type == 'Int64':
                    expressions.append(clean_expr.cast(pl.Float64, strict=False).cast(pl.Int64, strict=False))
                else:
                    expressions.append(clean_expr.cast(pl.Float64, strict=False))
            elif target_type == 'Date':
                from services.type_inference import smart_cast_to_date
                expressions.append(smart_cast_to_date(col_name, df))
            elif target_type == 'Boolean':
                from services.type_inference import smart_cast_to_boolean
                expressions.append(smart_cast_to_boolean(col_name))

    if not expressions:
        raise ValidationException("Types non supportés")

    # Dry-run validation
    test_df = df.with_columns(expressions)

    for mod in modifications:
        col = mod.column
        if col in df.columns:
            before_count = df[col].n_unique() - (1 if df[col].null_count() > 0 else 0)
            after_count = test_df[col].n_unique() - (1 if test_df[col].null_count() > 0 else 0)
            if before_count > 0 and after_count == 0:
                raise ValidationException(
                    f"Conversion impossible pour '{col}' : toutes les données seraient perdues."
                )

    df = test_df

    # Update schema overrides
    for mod in modifications:
        if mod.column in df.columns:
            entry.schema_overrides[mod.column] = mod.type

    # Check for partial data loss warnings
    warnings = []
    for mod in modifications:
        col = mod.column
        if col in df.columns and df[col].null_count() > (df.height * 0.5):
            warnings.append(f"Attention: >50% de données nulles dans '{col}' après conversion.")

    # Save back to file (atomic)
    temp_filepath = filepath + ".tmp"
    if filepath.endswith('.csv'):
        df.write_csv(temp_filepath)
    elif filepath.endswith('.xlsx'):
        df.write_excel(temp_filepath, worksheet=selected_sheet or 'Sheet1')

    # Atomic replacement
    backup_path = filepath + ".old"
    if os.path.exists(backup_path):
        os.remove(backup_path)
    os.rename(filepath, backup_path)
    os.rename(temp_filepath, filepath)
    os.remove(backup_path)

    # Refresh preview
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
# POST /api/database/expression
# ---------------------------------------------------------------------------
@router.post("/api/database/expression")
@limiter.limit("20/minute")
async def create_expression(
    request: Request,
    body: ExpressionRequest,
    user: TokenPayload = Depends(get_current_user),
):
    from services.data_cache import cache_manager
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
        
        # --- Mathematical Safety Check ---
        if not body.force:
            # Check for NaN or Inf (common for div by zero or domain errors)
            null_count = new_series.is_null().sum()
            nan_count = new_series.is_nan().sum() if new_series.dtype.is_float() else 0
            inf_count = new_series.is_infinite().sum() if new_series.dtype.is_float() else 0
            
            total_issues = nan_count + inf_count
            
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
                        "details": "Cela arrive généralement lors de divisions par zéro ou d'opérations hors domaine (SQRT négatif, LOG(0))."
                    }
                )

        # If force=True or no issues, proceed
        if body.force:
            # Replace NaN/Inf with null for consistency
            if new_series.dtype.is_float():
                new_series = new_series.fill_nan(None)
                # Polars doesn't have a direct fill_inf, but we can use when/then
                new_series = pl.when(new_series.is_infinite()).then(None).otherwise(new_series)

        df = df.with_columns(new_series.alias(new_col_name))
        
    except Exception as e:
        logger.error(f"Error parsing expression: {e}")
        raise ValidationException(f"Erreur de syntaxe ou de calcul: {str(e)}")

    # Save back to file
    filepath = entry.filepath
    if filepath.endswith('.csv'):
        df.write_csv(filepath)
    elif filepath.endswith('.xlsx'):
        df.write_excel(filepath)

    # Refresh preview
    entry.preview = process_file_preview(
        filepath,
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
from schemas.anomaly import AnomalyRequest, AnomalyResponse
from services.anomaly_detector import anomaly_detector
from services.llm_interpreter import llm_interpreter

@router.post("/api/anomalies", response_model=AnomalyResponse)
@limiter.limit("20/minute")
async def detect_anomalies(
    request: Request,
    body: AnomalyRequest,
    user: TokenPayload = Depends(get_current_user),
):
    from services.data_cache import cache_manager
    entry = await cache_manager.get(user.cache_id)
    if not entry: raise SessionExpiredException()
    
    df = _get_df(entry)
    total_rows = len(df)
    
    anomalies, skipped = anomaly_detector.detect(df, body.columns, body.method, body.threshold)
    anomaly_count = len(anomalies)
    anomaly_rate = round((anomaly_count / total_rows) * 100, 2) if total_rows > 0 else 0

    # Préparation pour le LLM
    llm_summary = None
    if anomaly_count > 0:
        freqs = {}
        for a in anomalies:
            for c in a["flagged_columns"]:
                freqs[c] = freqs.get(c, 0) + 1
        
        # Correction : Limiter aux 3 premières colonnes flaggées par ligne
        top_anomalies = [
            {c: a["values"][c] for c in a["flagged_columns"][:3]} 
            for a in anomalies[:3]
        ]
        
        llm_summary = await llm_interpreter.summarize_anomalies(
            anomaly_count, anomaly_rate, body.method, freqs, top_anomalies, body.language
        )

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
    global _stats_cache
    
    if _stats_cache is not None:
        return {"status": "success", "stats": _stats_cache}

    from services.data_cache import cache_manager
    entry = await cache_manager.get(user.cache_id)
    if not entry:
        return {"status": "success", "stats": {}}

    df = _get_df(entry)

    stats = {}
    total_rows = len(df)

    from services.column_classifier import classify_column
    
    for i, col in enumerate(df.columns):
        series = df[col]
        null_count = int(series.null_count())
        null_pct = round((null_count / total_rows) * 100, 1) if total_rows > 0 else 0
        unique_count = int(series.n_unique())
        
        # 1. Determine Type using unified logic
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
            # No dist needed for ID as per prompt

        elif col_type == "boolean":
            # Dynamic label detection
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

        elif col_type == "continuous":
            metrics.update({
                "min": float(series.min()) if series.min() is not None else 0.0,
                "max": float(series.max()) if series.max() is not None else 0.0,
                "mean": float(series.mean()) if series.mean() is not None else 0.0,
                "median": float(series.median()) if series.median() is not None else 0.0,
                "std": float(series.std()) if series.std() is not None else 0.0,
                "q1": float(series.quantile(0.25)) if series.quantile(0.25) is not None else 0.0,
                "q3": float(series.quantile(0.75)) if series.quantile(0.75) is not None else 0.0,
            })
            
            # Histogram
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
        
        elif col_type in ["discrete", "categorical"]:
            mode_list = series.mode().to_list()
            mode_val = str(mode_list[0]) if mode_list else "—"
            metrics.update({
                "mode": mode_val,
            })
            
            # Distribution Top 10
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
            clean_series = series.drop_nulls()
            if not clean_series.is_empty():
                min_date = clean_series.min()
                max_date = clean_series.max()
                
                # Format for display
                min_str = min_date.strftime("%Y-%m-%d") if hasattr(min_date, 'strftime') else str(min_date)
                max_str = max_date.strftime("%Y-%m-%d") if hasattr(max_date, 'strftime') else str(max_date)
                
                # Try to calculate duration in days
                try:
                    duration_days = (max_date - min_date).days
                except Exception:
                    duration_days = "N/A"
                
                metrics.update({
                    "min_date": min_str,
                    "max_date": max_str,
                    "duration_days": duration_days,
                })

                # Distribution: group by year or month depending on duration
                try:
                    if isinstance(duration_days, int):
                        if duration_days > 1000:
                            # Group by Year
                            grouped = clean_series.dt.year().value_counts().sort("count", descending=True).head(15)
                        else:
                            # Group by Year-Month
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
