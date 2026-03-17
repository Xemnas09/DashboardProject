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
    
    Args:
        col_name: The name of the column to cast.
        df: Optional reference DataFrame for context (not currently used for logic, but kept for interface consistency).
        
    Returns:
        A Polars expression resulting in a Date column (with nulls for unparseable rows).
    """
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
        # Handle French "1er" (first)
        mapped_expr = mapped_expr.str.replace(r"\b1er\b", "01", literal=False)
        # Final cleanup for text-to-date conversion
        clean_mapped = mapped_expr.str.replace_all(r"[\s/.]+", "-").str.strip_chars("-")
        
        attempts.extend([
            clean_mapped.str.to_date("%m-%Y-%d", strict=False),
            clean_mapped.str.to_date("%d-%m-%Y", strict=False),
            clean_mapped.str.to_date("%Y-%m-%d", strict=False),
            (clean_mapped + "-01").str.to_date("%m-%Y-%d", strict=False), # Month-Year -> Month-Year-01
            (clean_mapped + "-01").str.to_date("%Y-%m-%d", strict=False),
        ])
    except Exception:
        # Ignore errors during regex building
        pass

    # Coalesce all attempts: take the first non-null result
    final_expr = pl.coalesce(attempts)
    
    # Final fallback attempt using default Polars heuristic if all explicit formats failed
    return pl.when(final_expr.is_null()).then(col_expr.str.to_date(format="%Y-%m-%d", strict=False)).otherwise(final_expr)

def infer_and_cast_schema(df: pl.DataFrame) -> pl.DataFrame:
    """
    Main entry point for automatic schema discovery.
    Iterates through all columns and applies casting expressions if a high-confidence match is found.
    
    Args:
        df: The source Polars DataFrame.
        
    Returns:
        A new DataFrame with inferred types applied to its columns.
    """
    cast_exprs = []
    
    for col_name in df.columns:
        series = df[col_name]
        dtype = series.dtype

        # --- 1. Automatic Boolean Detection ---
        # Only checks String columns.
        if dtype == pl.String or dtype == pl.Utf8:
            non_null_series = series.drop_nulls()
            total_non_null = len(non_null_series)
            if total_non_null == 0: continue

            unique_vals = [str(x).lower().strip() for x in non_null_series.unique().to_list()]
            # Known pairs that represent binary states
            bool_pairs = [{'oui', 'non'}, {'vrai', 'faux'}, {'yes', 'no'}, {'true', 'false'}, {'0', '1'}, {'m', 'f'}]
            bool_trues = {'oui', 'vrai', 'yes', 'true', '1', 'm'}
            bool_falses = {'non', 'faux', 'no', 'false', '0', 'f'}
            
            is_bool = False
            if len(unique_vals) == 2 and set(unique_vals) in bool_pairs:
                is_bool = True
            elif len(unique_vals) == 1 and (unique_vals[0] in bool_trues or unique_vals[0] in bool_falses):
                is_bool = True
                
            if is_bool:
                cast_exprs.append(smart_cast_to_boolean(col_name).alias(col_name))
                logger.info(f"Inferred {col_name} as Boolean")
                continue

        # --- 2. Automatic Date Detection ---
        # Checks String columns OR numeric columns that look like Years (e.g. 2023).
        is_potential_date = False
        if dtype in (pl.String, pl.Utf8):
            is_potential_date = True
        elif dtype.is_numeric():
            # Year range check: 1800 to 2100 is likely a Year, not just a random ID or count.
            try:
                non_null = series.drop_nulls()
                if len(non_null) > 0:
                    min_val = non_null.min()
                    max_val = non_null.max()
                    if min_val >= 1800 and max_val <= 2100:
                        is_potential_date = True
            except:
                pass

        if is_potential_date:
            date_expr = smart_cast_to_date(col_name, df)
            test_cast = df.select(date_expr.alias("test"))["test"]
            total_non_null = series.drop_nulls().len()
            
            # Confidence threshold: 70% of rows must successfully convert to be considered a Date column.
            if total_non_null > 0 and test_cast.drop_nulls().len() > (total_non_null * 0.7):
                cast_exprs.append(date_expr.alias(col_name))
                logger.info(f"Inferred {col_name} as Date")
                continue

        # --- 3. Smart Category/ID alignment (Refined Rule 4) ---
        # Align with statistics tool logic: cast codes to String to prevent averaging.
        semantic_type = classify_column(series)
        name_lower = col_name.lower()
        id_hints = ('id', 'code', 'zip', 'cp', 'num', 'key')
        
        if semantic_type == "identifier":
             cast_exprs.append(pl.col(col_name).cast(pl.String).alias(col_name))
             logger.info(f"Inferred {col_name} as Identifier (Casted to String)")
             continue
        elif semantic_type == "categorical" and any(h in name_lower for h in id_hints):
             cast_exprs.append(pl.col(col_name).cast(pl.String).alias(col_name))
             logger.info(f"Inferred {col_name} as Categorical Code (Casted to String)")
             continue

        # --- 4. Numeric refinement ---
        # Only for strings that contain numbers with optional European separators.
        if dtype == pl.String or dtype == pl.Utf8:
            non_null_series = series.drop_nulls()
            total_non_null = len(non_null_series)
            if total_non_null == 0: continue

            # Deep cleaning: remove everything except digits, dots, commas, and dashes.
            # Convert comma to dot for float parsing.
            clean_col = pl.col(col_name).str.replace_all(r"[^\d.,\-]", "").str.replace(",", ".")
            try:
                float_series = df.select(clean_col.cast(pl.Float64, strict=False))[col_name]
                float_non_null = float_series.drop_nulls()
                
                # Confidence threshold: 90% of rows must be numeric.
                if len(float_non_null) > (total_non_null * 0.90) and len(float_non_null) > 0:
                    is_int = float_non_null.mod(1.0).sum() == 0.0
                    if is_int:
                        cast_exprs.append(clean_col.cast(pl.Float64, strict=False).cast(pl.Int64, strict=False).alias(col_name))
                    else:
                        cast_exprs.append(clean_col.cast(pl.Float64, strict=False).alias(col_name))
                    logger.info(f"Inferred {col_name} as Numeric")
                    continue
            except Exception:
                pass

    # Apply all collected casting expressions at once (lazy-parallelized by Polars).
    if cast_exprs:
        df = df.with_columns(cast_exprs)
        
    return df

