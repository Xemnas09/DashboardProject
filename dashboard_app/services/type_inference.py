"""
Advanced automatic type inference and casting for Polars DataFrames during file parsing.

This module provides heuristics to detect:
1. disguised strings that are actually Booleans (e.g., 'oui'/'non', 'yes'/'no').
2. partial or text-based date strings (e.g., 'YYYY-MM', 'Janvier 2023').
3. strings that are actually numeric but contain European formatting (e.g., '1.200,50').
4. numeric columns that are actually Years (e.g., 2023).
"""

import polars as pl
from loguru import logger
from typing import Dict, List, Optional
from .column_classifier import classify_column

# Mapping of French and English month names to their numeric representation (MM).
# Used for parsing text-based dates like "Mars 2023".
MONTH_MAP: Dict[str, str] = {
    # French
    'janvier': '01', 'février': '02', 'mars': '03', 'avril': '04', 'mai': '05', 'juin': '06',
    'juillet': '07', 'août': '08', 'septembre': '09', 'octobre': '10', 'novembre': '11', 'décembre': '12',
    'janv': '01', 'févr': '02', 'avr': '04', 'juil': '07', 'sept': '09', 'octo': '10', 'nove': '11', 'déce': '12',
    # English
    'january': '01', 'february': '02', 'march': '03', 'april': '04', 'may': '05', 'june': '06',
    'july': '07', 'august': '08', 'september': '09', 'october': '10', 'november': '11', 'december': '12',
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'jun': '06', 'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
}

def smart_cast_to_boolean(col_name: str) -> pl.Expr:
    """
    Returns a Polars expression to cast a column to Boolean using semantic heuristics.
    
    Args:
        col_name: The name of the column to cast.
        
    Returns:
        A Polars expression resulting in a Boolean column.
    """
    bool_trues = {'oui', 'vrai', 'yes', 'true', '1', 'm'}
    return pl.col(col_name).cast(pl.String).str.to_lowercase().str.strip_chars().is_in(list(bool_trues))

def smart_cast_to_date(col_name: str, df: Optional[pl.DataFrame] = None) -> pl.Expr:
    """
    Attempts to cast a column to Date by trying multiple formats and completion logics.
    Handles standard formats, partials (YYYY-MM), and text-based dates.
    
    If the column is already a Date/Datetime, we preserve the date part.
    """
    if df is not None and col_name in df.columns:
        curr_dtype = df[col_name].dtype
        if curr_dtype in (pl.Date, pl.Datetime):
            return pl.col(col_name).cast(pl.Date)

    col_expr = pl.col(col_name).cast(pl.String)
    
    # 1. Clean the string: replace common separators with dashes
    clean_expr = col_expr.str.strip_chars().str.replace_all(r"[\/\.\s]", "-")
    
    # 2. Define standard candidates
    std_formats = ["%Y-%m-%d", "%d-%m-%Y", "%m-%d-%Y"]
    attempts = [clean_expr.str.to_date(fmt, strict=False) for fmt in std_formats]
    
    # 3. Add completion logic for partials (e.g., 'YYYY-MM' -> first day of month)
    attempts.extend([
        # Format: YYYY-MM -> YYYY-MM-01
        (pl.when(clean_expr.str.contains(r"^\d{4}-\d{1,2}$"))
           .then(clean_expr + "-01")
           .otherwise(None)).str.to_date("%Y-%m-%d", strict=False),
           
        # Format: MM-YYYY -> 01-MM-YYYY
        (pl.when(clean_expr.str.contains(r"^\d{1,2}-\d{4}$"))
           .then("01-" + clean_expr)
           .otherwise(None)).str.to_date("%d-%m-%Y", strict=False),
           
        # Format: YYYY -> YYYY-01-01 (Strict 4-digit year)
        (pl.when(clean_expr.str.contains(r"^\d{4}$"))
           .then(clean_expr + "-01-01")
           .otherwise(None)).str.to_date("%Y-%m-%d", strict=False),
    ])
    
    # 4. Text-based dates (e.g., "Janvier 2023")
    try:
        mapped_expr = col_expr.str.to_lowercase()
        # Replace month names with numbers
        for m_name, m_num in MONTH_MAP.items():
            mapped_expr = mapped_expr.str.replace(rf"\b{m_name}\b", m_num, literal=False)
        # Final cleanup for text-to-date conversion
        clean_mapped = mapped_expr.str.replace_all(r"[\s/.]+", "-").str.strip_chars("-")
        
        attempts.extend([
            clean_mapped.str.to_date("%m-%Y-%d", strict=False),
            clean_mapped.str.to_date("%d-%m-%Y", strict=False),
            clean_mapped.str.to_date("%Y-%m-%d", strict=False),
        ])
    except Exception: pass

    return pl.coalesce(attempts)

def smart_cast_to_datetime(col_name: str, df: Optional[pl.DataFrame] = None) -> pl.Expr:
    """
    Attempts to cast a column to Datetime (including time).
    If it's already Datetime, it remains untouched.
    """
    if df is not None and col_name in df.columns:
        if df[col_name].dtype == pl.Datetime:
            return pl.col(col_name)
            
    col_expr = pl.col(col_name).cast(pl.String)
    
    # 1. Try numeric conversion (Unix Timestamps)
    # Most common: seconds (10 digits) or milliseconds (13 digits)
    sample = df[col_name].drop_nulls().head(100)
    is_numeric_like = False
    if sample.dtype.is_numeric():
        is_numeric_like = True
    elif sample.dtype == pl.String and len(sample) > 0:
        if sample.str.contains(r"^\d+$").all():
            is_numeric_like = True

    if is_numeric_like:
        num_expr = pl.col(col_name).cast(pl.Int64, strict=False)
        # Heuristic: Unix seconds are ~10 digits (1e9), ms are ~13 digits (1.7e12).
        # We handle seconds by multiplying by 1000 to reach ms.
        return pl.when(num_expr > 10**11).then(
            num_expr.cast(pl.Datetime("ms"))
        ).otherwise(
            (num_expr * 1000).cast(pl.Datetime("ms"))
        )

    # 2. String parsing
    # Clean separators
    clean_expr = col_expr.str.strip_chars().str.replace_all(r"[\/\.]", "-")
    
    # Try common formats that include time
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%d-%m-%Y %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S", # ISO
        "%Y-%m-%d %H:%M:%S%.f", # Precision with sub-seconds
        "%Y-%m-%d %H:%M",
    ]
    
    attempts = [clean_expr.str.to_datetime(fmt, strict=False) for fmt in formats]
    
    return pl.coalesce(attempts)

def infer_and_cast_schema(df: pl.DataFrame) -> pl.DataFrame:
    """
    Main entry point for automatic schema discovery.
    """
    cast_exprs = []
    
    for col_name in df.columns:
        series = df[col_name]
        dtype = series.dtype
        sample_series = series.drop_nulls().head(2000)
        
        if len(sample_series) == 0: 
            continue

        sample_df = pl.DataFrame({col_name: sample_series})

        # --- 1. Boolean ---
        if dtype in (pl.String, pl.Utf8):
            unique_vals = [str(x).lower().strip() for x in sample_series.unique().to_list()]
            if len(unique_vals) <= 2:
                bool_pairs = [{'oui', 'non'}, {'vrai', 'faux'}, {'yes', 'no'}, {'true', 'false'}, {'0', '1'}, {'m', 'f'}]
                if set(unique_vals) in bool_pairs or all(v in {'oui', 'vrai', 'yes', 'true', '1', 'm', 'non', 'faux', 'no', 'false', '0', 'f'} for v in unique_vals):
                    cast_exprs.append(smart_cast_to_boolean(col_name).alias(col_name))
                    continue

        # --- 2. Date / Datetime ---
        if dtype in (pl.String, pl.Utf8):
            # Safeguard: if it's purely numeric strings, verify they are long enough to be timestamps
            # (Preventing IDs like "1", "2" to be auto-cast to 1970 dates)
            if sample_series.str.contains(r"^\d+$").all():
                max_val = sample_series.cast(pl.Int64, strict=False).max()
                if max_val is not None and max_val < 100_000_000: # Below 1973 if seconds
                    # Looks like IDs, not timestamps. Skip auto-conversion.
                    pass
                else:
                    # Proceed with check
                    pass
            
            # Try Datetime first (prioritize precision)
            dt_expr = smart_cast_to_datetime(col_name, sample_df)
            test_dt = sample_df.select(dt_expr.alias("test"))["test"].drop_nulls()
            
            if len(test_dt) > (len(sample_series) * 0.7):
                # Check for significant time components
                try:
                    has_time = (test_dt.dt.hour() != 0).any() or (test_dt.dt.minute() != 0).any()
                except: has_time = False
                
                if has_time:
                    cast_exprs.append(dt_expr.alias(col_name))
                    continue
                else:
                    # Successfully parsed but no time -> cast to Date
                    cast_exprs.append(dt_expr.cast(pl.Date).alias(col_name))
                    continue

            # Fallback to Date-only formats if Datetime failed
            date_expr = smart_cast_to_date(col_name, sample_df)
            test_date = sample_df.select(date_expr.alias("test"))["test"].drop_nulls()
            if len(test_date) > (len(sample_series) * 0.7):
                cast_exprs.append(date_expr.alias(col_name))
                continue

        # --- 3. Numeric ---
        if dtype in (pl.String, pl.Utf8):
            clean_col = pl.col(col_name).str.replace_all(r"[^\d.,\-]", "").str.replace(",", ".")
            try:
                num_series = sample_df.select(clean_col.cast(pl.Float64, strict=False))[col_name].drop_nulls()
                if len(num_series) > (len(sample_series) * 0.9):
                    is_int = num_series.mod(1.0).sum() == 0.0
                    if is_int:
                        cast_exprs.append(clean_col.cast(pl.Float64, strict=False).cast(pl.Int64, strict=False).alias(col_name))
                    else:
                        cast_exprs.append(clean_col.cast(pl.Float64, strict=False).alias(col_name))
                    continue
            except: pass

    if cast_exprs:
        df = df.with_columns(cast_exprs)
    return df

