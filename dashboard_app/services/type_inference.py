"""
Advanced automatic type inference and casting for Polars DataFrames during file parsing.
Detects disguised numeric, boolean, and temporal columns.
"""
import polars as pl
from loguru import logger
import re

MONTH_MAP = {
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
    """Returns a Polars expression to cast a column to Boolean using semantic heuristics."""
    bool_trues = {'oui', 'vrai', 'yes', 'true', '1', 'm'}
    return pl.col(col_name).cast(pl.String).str.to_lowercase().str.strip_chars().is_in(list(bool_trues))

def smart_cast_to_date(col_name: str, df: pl.DataFrame | None = None) -> pl.Expr:
    """
    Returns a Polars expression to cast a column to Date.
    If df is provided, it performs statistical analysis to pick the best format / partial padding.
    If df is None, it returns a best-effort expression.
    """
    series = pl.col(col_name) if df is None else df[col_name]
    if isinstance(series, pl.Series):
        non_null_series = series.drop_nulls()
        total_non_null = len(non_null_series)
        if total_non_null == 0:
            return pl.col(col_name).cast(pl.Date, strict=False)

        # 1. Try standard formats
        date_formats = ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"]
        for fmt in date_formats:
            parsed = series.str.to_date(format=fmt, strict=False)
            if parsed.drop_nulls().len() > (total_non_null * 0.8):
                return pl.col(col_name).str.to_date(format=fmt, strict=False)

        # 2. Try Partial Dates
        partial_date_patterns = [
            (r"^\d{4}[\-\/\.\s]\d{1,2}$", "%Y-%m", True),
            (r"^\d{1,2}[\-\/\.\s]\d{4}$", "%m-%Y", False),
            (r"^\d{2}[\-\/\.\s]\d{1,2}$", "%y-%m", True),
            (r"^\d{1,2}[\-\/\.\s]\d{2}$", "%m-%y", False)
        ]
        for regex, fmt, year_first in partial_date_patterns:
            if series.str.contains(regex).sum() > (total_non_null * 0.8):
                norm_col = pl.col(col_name).str.replace_all(r"[\/\.\s]", "-")
                if year_first:
                    return (norm_col + "-01").str.to_date(format=fmt + "-%d", strict=False)
                else:
                    return (pl.lit("01-") + norm_col).str.to_date(format="%d-" + fmt, strict=False)

        # 3. Try Text-based dates
        try:
            mapped_expr = pl.col(col_name).str.to_lowercase()
            for m_name, m_num in MONTH_MAP.items():
                mapped_expr = mapped_expr.str.replace(rf"\b{m_name}\b", m_num)
            mapped_expr = mapped_expr.str.replace(r"\b1er\b", "01")
            clean_mapped = mapped_expr.str.replace_all(r"[\s/.]+", "-").str.strip_chars("-")

            for fmt in ["%m-%Y", "%d-%m-%Y", "%Y-%m-%d"]:
                test_parsed = clean_mapped.str.to_date(format=fmt, strict=False)
                if test_parsed.drop_nulls().len() > (total_non_null * 0.7):
                    if fmt == "%m-%Y":
                        return (clean_mapped + "-01").str.to_date(format="%m-%Y-%d", strict=False)
                    return test_parsed
        except Exception:
            pass

    # Fallback to standard cast
    return pl.col(col_name).str.to_date(strict=False)

def infer_and_cast_schema(df: pl.DataFrame) -> pl.DataFrame:
    """
    Analyzes all columns of type String/Utf8 and attempts to cast them
    to correct statistical types based on structural patterns.
    """
    cast_exprs = []
    
    for col_name in df.columns:
        series = df[col_name]
        dtype = series.dtype

        if dtype != pl.String and dtype != pl.Utf8:
            continue

        non_null_series = series.drop_nulls()
        total_non_null = len(non_null_series)
        
        if total_non_null == 0:
            continue 

        # Try Boolean
        unique_vals = [str(x).lower().strip() for x in non_null_series.unique().to_list()]
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

        # Try Date
        date_expr = smart_cast_to_date(col_name, df)
        # Check if the expression actually did anything useful (at least one non-null result)
        test_cast = df.select(date_expr.alias("test"))["test"]
        if test_cast.drop_nulls().len() > (total_non_null * 0.7):
            cast_exprs.append(date_expr.alias(col_name))
            logger.info(f"Inferred {col_name} as Date")
            continue

        # Try Numeric
        # Clean up common European formatting and remove ALL non-numeric characters
        clean_col = pl.col(col_name).str.replace_all(r"[^\d.,\-]", "").str.replace(",", ".")
        try:
            float_series = df.select(clean_col.cast(pl.Float64, strict=False))[col_name]
            float_non_null = float_series.drop_nulls()
            
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

    if cast_exprs:
        df = df.with_columns(cast_exprs)
        
    return df

