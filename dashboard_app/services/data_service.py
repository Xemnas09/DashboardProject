"""
Data processing service: encapsulates complex DataFrame operations
to keep routers thin and maintainable.
"""

import os
import time
import polars as pl
from loguru import logger
from typing import List, Dict, Any, Optional, Tuple

from services.type_inference import smart_cast_to_date, smart_cast_to_boolean
from services.column_classifier import classify_column
from services.file_processor import read_cached_df
from core.exceptions import NotFoundException

def get_df_for_user(entry) -> pl.DataFrame:
    """
    Infrastructure helper to get the DataFrame for a cache entry with RAM-first priority.
    """
    if entry.df is not None:
        return entry.df
    
    df = read_cached_df(entry.filepath, entry.selected_sheet, entry.schema_overrides)
    if df is None:
        raise NotFoundException("Données introuvables ou session expirée")
    
    # Hydrate RAM cache for next time
    entry.df = df
    return df

def compute_column_stats(df: pl.DataFrame) -> Dict[str, Any]:
    """
    Domain logic: Calculates scientific statistics for all columns.
    """
    stats = {}
    total_rows = len(df)
    
    for col in df.columns:
        series = df[col]
        null_count = int(series.null_count())
        null_pct = round((null_count / total_rows) * 100, 1) if total_rows > 0 else 0
        unique_count = int(series.drop_nulls().n_unique())
        
        col_type = classify_column(series)
        is_identifier = col_type == "identifier"
        
        metrics = {
            "count": total_rows,
            "nulls": null_count,
            "null_pct": null_pct,
            "uniques": unique_count,
            "type": col_type,
            "is_identifier": is_identifier,
        }
        
        dist_data = []
        if col_type == "identifier":
            metrics.update({
                "min": float(series.min()) if series.dtype.is_numeric() else str(series.min()),
                "max": float(series.max()) if series.dtype.is_numeric() else str(series.max()),
            })
        elif col_type == "boolean":
            # Dynamic label detection logic...
            modalities = series.drop_nulls().unique().to_list()
            if len(modalities) == 2:
                m1, m2 = modalities[0], modalities[1]
                pos_markers = ["1", "true", "yes", "oui", "vrai", "t", "y", "o"]
                m1_str, m2_str = str(m1).lower(), str(m2).lower()
                if m1_str in pos_markers or (m2_str not in pos_markers and m1_str > m2_str):
                    label_true, label_false = m1, m2
                else:
                    label_true, label_false = m2, m1
                true_count = int((series == label_true).sum())
                false_count = int((series == label_false).sum())
            else:
                label_true, label_false = modalities[0] if modalities else "Vrai", "N/A"
                true_count = int((series == label_true).sum()) if modalities else 0
                false_count = 0
            
            non_null_count = total_rows - null_count
            metrics.update({
                "label_true": str(label_true), "label_false": str(label_false),
                "true_count": true_count, "false_count": false_count,
                "true_pct": round((true_count / non_null_count * 100), 1) if non_null_count > 0 else 0,
                "false_pct": round((false_count / non_null_count * 100), 1) if non_null_count > 0 else 0,
            })
        elif col_type in ["continuous", "discrete"]:
            metrics.update({
                "min": float(series.min()) if series.min() is not None else 0.0,
                "max": float(series.max()) if series.max() is not None else 0.0,
                "mean": float(series.mean()) if series.mean() is not None else 0.0,
                "median": float(series.median()) if series.median() is not None else 0.0,
            })
            # Histogram bins (20 bins)
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
                    lbl = f"{start:.1f}-{end:.1f}"
                    cnt = int(dist_map.get(b_idx, 0))
                    dist_data.append({"value": lbl, "count": cnt, "pct": round((cnt/(total_rows-null_count)*100),1) if total_rows>null_count else 0})

        elif col_type in ["date", "datetime"]:
            metrics.update({"min": str(series.min()), "max": str(series.max())})
            # Temporal bins (20 bins)
            clean_series = series.drop_nulls()
            if not clean_series.is_empty() and series.min() != series.max():
                # Ensure consistent millisecond precision for labels
                ms_series = clean_series.dt.timestamp("ms")
                ms_min, ms_max = int(ms_series.min()), int(ms_series.max())
                ms_step = (ms_max - ms_min) // 20
                if ms_step > 0:
                    hist_counts = ms_series.to_frame().with_columns(
                        ((pl.col("ts" if col=="ts" else col) - ms_min) / ms_step).floor().cast(pl.Int32).clip(0, 19).alias("bin_idx")
                    ).group_by("bin_idx").len().sort("bin_idx")
                    dist_map = {int(row["bin_idx"]): int(row["len"]) for row in hist_counts.to_dicts()}
                    import datetime
                    for b_idx in range(20):
                        b_ms = ms_min + b_idx * ms_step
                        try:
                            dt = datetime.datetime.fromtimestamp(b_ms / 1000, datetime.timezone.utc)
                            lbl = dt.strftime("%Y-%m-%d %H:%M")
                        except: lbl = str(b_ms)
                        cnt = int(dist_map.get(b_idx, 0))
                        dist_data.append({"value": lbl, "count": cnt, "pct": round((cnt/(total_rows-null_count)*100),1) if total_rows>null_count else 0})

        elif col_type == "categorical":
            counts = series.value_counts().sort(by="count", descending=True).head(10)
            non_null_count = total_rows - null_count
            for row in counts.to_dicts():
                if row[col] is None: continue
                dist_data.append({
                    "value": str(row[col]), "count": int(row["count"]),
                    "pct": round((int(row["count"]) / non_null_count * 100), 1) if non_null_count > 0 else 0
                })

        stats[col] = {"type": col_type, "metrics": metrics, "distribution": dist_data}
    return stats

def apply_recast(df: pl.DataFrame, modifications: List[Any]) -> Tuple[pl.DataFrame, List[str]]:
    """
    Applies type casting to a DataFrame based on a list of modifications.
    Includes validation to prevent 100% data loss and generates warnings for partial loss.
    
    Args:
        df: The source Polars DataFrame.
        modifications: List of RecastRequest objects (column, type).
        
    Returns:
        Tuple of (Processed DataFrame, List of warning strings).
        
    Raises:
        ValueError: If a conversion would result in 100% data loss for a column.
    """
    expressions = []
    for mod in modifications:
        col_name = mod.column
        target_type = mod.type
        if col_name in df.columns:
            if target_type == 'String':
                expressions.append(pl.col(col_name).cast(pl.String).alias(col_name))
            elif target_type in ('Int64', 'Float64'):
                # Aggressive numeric cleaning: remove European separators, etc.
                clean_expr = pl.col(col_name).cast(pl.String).str.strip_chars().str.replace_all(r"[^\d.,\-]", "").str.replace(r",", ".")
                if target_type == 'Int64':
                    expressions.append(clean_expr.cast(pl.Float64, strict=False).cast(pl.Int64, strict=False).alias(col_name))
                else:
                    expressions.append(clean_expr.cast(pl.Float64, strict=False).alias(col_name))
            elif target_type == 'Date':
                expressions.append(smart_cast_to_date(col_name, df).alias(col_name))
            elif target_type == 'Boolean':
                expressions.append(smart_cast_to_boolean(col_name).alias(col_name))

    if not expressions:
        return df, []

    # 1. Validation: Dry-run for 100% data loss
    test_df = df.with_columns(expressions)
    for mod in modifications:
        col = mod.column
        if col in df.columns:
            before_count = df[col].n_unique() - (1 if df[col].null_count() > 0 else 0)
            after_count = test_df[col].n_unique() - (1 if test_df[col].null_count() > 0 else 0)
            if before_count > 0 and after_count == 0:
                raise ValueError(f"Conversion impossible pour '{col}' : toutes les données seraient perdues.")

    # 2. Check for partial loss warnings (>50% nulls)
    warnings = []
    for mod in modifications:
        col = mod.column
        if col in test_df.columns and test_df[col].null_count() > (test_df.height * 0.5):
            warnings.append(f"Attention: >50% de données nulles dans '{col}' après conversion.")

def detect_anomalies_service(df: pl.DataFrame) -> List[Dict[str, Any]]:
    """
    Domain logic: Detects outliers and anomalies across numeric columns.
    Uses Scientific Quadrants to apply appropriate math (IQR for continuous, 
    Frequency for discrete).
    """
    anomalies = []
    for col in df.columns:
        series = df[col]
        col_type = classify_column(series)
        
        if col_type in ["continuous", "discrete"] and series.dtype.is_numeric():
            # Drop nulls for math
            clean = series.drop_nulls()
            if clean.is_empty(): continue
            
            q1 = float(clean.quantile(0.25))
            q3 = float(clean.quantile(0.75))
            iqr = q3 - q1
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
            
            # Identify outliers
            outliers = (series < lower) | (series > upper)
            count = int(outliers.sum())
            if count > 0:
                anomalies.append({
                    "column": col,
                    "type": col_type,
                    "count": count,
                    "pct": round((count / len(series)) * 100, 1),
                    "severity": "high" if count > (len(series) * 0.05) else "medium"
                })
    return anomalies

def save_df_resilient(df: pl.DataFrame, filepath: str, sheet_name: Optional[str] = None) -> bool:
    """
    Saves a DataFrame to disk using an atomic temp-file swap with retries for Windows locks.
    
    Args:
        df: The Polars DataFrame to save.
        filepath: Absolute path to the target file.
        sheet_name: Specific Excel worksheet name.
        
    Returns:
        True if successful, False otherwise.
    """
    temp_filepath = filepath + ".tmp"
    backup_path = filepath + ".old"
    
    try:
        # 1. Write to temp file
        if filepath.endswith('.csv'):
            df.write_csv(temp_filepath)
        elif filepath.endswith('.xlsx'):
            df.write_excel(temp_filepath, worksheet=sheet_name or 'Sheet1')
        else:
            return False

        # 2. Resilient swap (Atomic-ish for Windows)
        max_retries = 5
        retry_delay = 0.5
        
        for i in range(max_retries):
            try:
                if os.path.exists(backup_path):
                    os.remove(backup_path)
                
                # Move current to backup, temp to current
                os.rename(filepath, backup_path)
                os.rename(temp_filepath, filepath)
                
                # Clean up backup
                if os.path.exists(backup_path):
                    os.remove(backup_path)
                return True
            except PermissionError:
                if i == max_retries - 1:
                    logger.error(f"Failed to save file after {max_retries} retries (Lock persistence)")
                    if os.path.exists(temp_filepath): os.remove(temp_filepath)
                    return False
                time.sleep(retry_delay)
    except Exception as e:
        logger.error(f"Unexpected error during resilient save: {e}")
        return False
    
    return False
