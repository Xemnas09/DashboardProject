"""
Scientific Type Inference and Casting for Polars DataFrames.
Uses the unified semantic classifier as the "brain" for ingestion.
Ensures consistency between storage formats and analytical meanings.
"""

import polars as pl
from loguru import logger
from typing import Optional
from .column_classifier import classify_column
from .data_types_config import (
    BOOLEAN_TRUE_MARKERS,
    BOOLEAN_FALSE_MARKERS,
    MONTH_MAP
)

def smart_cast_to_boolean(col_name: str) -> pl.Expr:
    """Casts a column to Boolean using shared markers."""
    trues = [str(x).lower() for x in BOOLEAN_TRUE_MARKERS if isinstance(x, (int, float, str))]
    return (
        pl.col(col_name)
        .cast(pl.String)
        .str.to_lowercase()
        .str.strip_chars()
        .is_in(trues)
    )

def smart_cast_to_date(col_name: str) -> pl.Expr:
    """Attempts to cast a column to Date by trying multiple formats."""
    col_expr = pl.col(col_name).cast(pl.String).str.strip_chars()
    clean_expr = col_expr.str.replace_all(r"[\/\.\s]", "-")
    
    # 1. Standard Formats
    std_formats = ["%Y-%m-%d", "%d-%m-%Y", "%m-%d-%Y"]
    attempts = [clean_expr.str.to_date(fmt, strict=False) for fmt in std_formats]
    
    # 2. Text-based months (e.g., "Janvier 2023")
    try:
        mapped_expr = col_expr.str.to_lowercase()
        for m_name, m_num in MONTH_MAP.items():
            mapped_expr = mapped_expr.str.replace(rf"\b{m_name}\b", m_num, literal=False)
        clean_mapped = mapped_expr.str.replace_all(r"[\s/.]+", "-").str.strip_chars("-")
        
        attempts.extend([
            clean_mapped.str.to_date("%m-%Y-%d", strict=False),
            clean_mapped.str.to_date("%d-%m-%Y", strict=False),
            clean_mapped.str.to_date("%Y-%m-%d", strict=False),
        ])
    except: pass
    
    return pl.coalesce(attempts)

def smart_cast_to_datetime(col_name: str, has_numeric_hint: bool = False) -> pl.Expr:
    """Attempts to cast to Datetime (including Unix support)."""
    col_expr = pl.col(col_name).cast(pl.String).str.strip_chars()
    
    # 1. Unix Timestamps (if hinted by classifier)
    if has_numeric_hint:
        num_expr = pl.col(col_name).cast(pl.Int64, strict=False)
        # Heuristic: Unix seconds are ~10 digits, ms are ~13 digits.
        return pl.when(num_expr > 10**11).then(
            num_expr.cast(pl.Datetime("ms"))
        ).otherwise(
            (num_expr * 1000).cast(pl.Datetime("ms"))
        )

    # 2. String Formats
    # Be careful NOT to replace '.' globally as it's needed for microseconds
    clean_expr = col_expr.str.replace_all(r"\/", "-") 
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%d-%m-%Y %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%d %H:%M",
    ]
    attempts = [clean_expr.str.to_datetime(fmt, strict=False) for fmt in formats]
    
    return pl.coalesce(attempts)

def infer_and_cast_schema(df: pl.DataFrame) -> pl.DataFrame:
    """
    Main entry point for unified schema discovery.
    Uses classify_column to determine intent, then performs technical cast.
    """
    cast_exprs = []
    
    for col_name in df.columns:
        series = df[col_name]
        dtype = series.dtype
        
        # Don't re-infer if already cast or if all null
        if series.null_count() == len(series): continue
        if dtype in (pl.Date, pl.Datetime, pl.Boolean): continue
        
        # --- GET SEMANTIC INTENT ---
        sample = series.drop_nulls().head(2000)
        intent = classify_column(sample)
        
        # --- EXECUTE TECHNICAL CAST BASED ON INTENT ---
        cast_expr = None
        if intent == "boolean":
            cast_expr = smart_cast_to_boolean(col_name)
        elif intent == "datetime":
            is_num_timestamp = dtype.is_numeric() or (dtype == pl.String and sample.str.contains(r"^\d+$").all())
            cast_expr = smart_cast_to_datetime(col_name, has_numeric_hint=is_num_timestamp)
        elif intent == "date":
            cast_expr = smart_cast_to_date(col_name)
        elif intent in ("discrete", "continuous", "numeric"):
            if dtype in (pl.String, pl.Utf8):
                clean_num = pl.col(col_name).str.strip_chars().str.replace_all(r"[^\d.,\-]", "").str.replace(",", ".")
                if intent == "discrete":
                    cast_expr = clean_num.cast(pl.Float64, strict=False).cast(pl.Int64, strict=False)
                else:
                    cast_expr = clean_num.cast(pl.Float64, strict=False)

        # --- SAFE CASTING PATTERN ---
        if cast_expr is not None:
            try:
                # Calculate nulls before and after to prevent data loss
                original_nulls = int(series.null_count())
                casted_series = df.select(cast_expr).to_series()
                new_nulls = int(casted_series.null_count())
                
                # Rule: Only apply if it doesn't introduce more nulls than original
                if new_nulls <= original_nulls:
                    cast_exprs.append(cast_expr.alias(col_name))
                    logger.info(f"Safe cast applied to '{col_name}' -> {intent}")
                else:
                    logger.warning(f"Rejected cast for '{col_name}' (intent={intent}): would introduce {new_nulls - original_nulls} new nulls")
            except Exception as e:
                logger.warning(f"Failed safe cast check for '{col_name}': {e}")

    if cast_exprs:
        df = df.with_columns(cast_exprs)
            
    return df
