"""
Advanced automatic type inference and casting for Polars DataFrames during file parsing.
Detects disguised numeric, boolean, and temporal columns.
"""
import polars as pl
from loguru import logger

def infer_and_cast_schema(df: pl.DataFrame) -> pl.DataFrame:
    """
    Analyzes all columns of type String/Utf8 and attempts to cast them
    to correct statistical types based on structural patterns.
    """
    cast_exprs = []
    
    for col_name in df.columns:
        series = df[col_name]
        dtype = series.dtype

        # Only process string/Utf8 columns (which is what CSV readers default to)
        if dtype != pl.String and dtype != pl.Utf8:
            continue

        non_null_series = series.drop_nulls()
        total_non_null = len(non_null_series)
        
        if total_non_null == 0:
            continue # Leave as String if completely empty

        # Try Boolean (Cardinality exactly 2 + specific values)
        # OR Single value (Cardinality exactly 1, but represents a boolean true)
        unique_vals = [str(x).lower().strip() for x in non_null_series.unique().to_list()]
        unique_count = len(unique_vals)
        
        bool_pairs = [{'oui', 'non'}, {'vrai', 'faux'}, {'yes', 'no'}, {'true', 'false'}, {'0', '1'}, {'m', 'f'}]
        bool_trues = {'oui', 'vrai', 'yes', 'true', '1', 'm'}
        bool_falses = {'non', 'faux', 'no', 'false', '0', 'f'}
        
        if unique_count == 2:
            if set(unique_vals) in bool_pairs:
                # Build a mapping expression
                mapper = pl.col(col_name).str.to_lowercase().str.strip_chars()
                is_true = mapper.is_in(list(bool_trues))
                cast_exprs.append(is_true.alias(col_name))
                logger.info(f"Inferred {col_name} as Boolean (Pair: {unique_vals})")
                continue
        elif unique_count == 1:
            if unique_vals[0] in bool_trues or unique_vals[0] in bool_falses:
                mapper = pl.col(col_name).str.to_lowercase().str.strip_chars()
                is_true = mapper.is_in(list(bool_trues))
                cast_exprs.append(is_true.alias(col_name))
                logger.info(f"Inferred {col_name} as Boolean (Single value: {unique_vals})")
                continue

        # Try Date
        # Polars str.to_date(strict=False) returns null if parsing fails
        # Try a few common formats in order of strictness
        date_formats = ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"]
        date_detected = False
        
        for fmt in date_formats:
            try:
                # Attempt to cast
                parsed = series.str.to_date(format=fmt, strict=False)
                parsed_non_null = parsed.drop_nulls()
                
                # If > 90% of the non-null string values parse successfully, it's a date
                if len(parsed_non_null) > (total_non_null * 0.9):
                    cast_exprs.append(pl.col(col_name).str.to_date(format=fmt, strict=False).alias(col_name))
                    logger.info(f"Inferred {col_name} as Date (Format: {fmt})")
                    date_detected = True
                    break
            except Exception:
                continue
                
        if date_detected:
            continue
            
        # Try Partial Dates (YYYY-MM or MM-YYYY) which fail strict to_date without a day
        partial_date_formats = {
            "%Y-%m": r"^\d{4}-\d{2}$",
            "%Y/%m": r"^\d{4}/\d{2}$",
            "%m-%Y": r"^\d{2}-\d{4}$",
            "%m/%Y": r"^\d{2}/\d{4}$"
        }
        
        for fmt, regex in partial_date_formats.items():
            try:
                # Check how many match the exact partial pattern
                matches = series.str.contains(regex).sum()
                if matches > (total_non_null * 0.9):
                    # We need to append a standard day "-01" to make Polars happy
                    if fmt.startswith("%Y"):
                        padded_col = pl.col(col_name) + "-01"
                        cast_fmt = fmt + "-%d"
                    else:
                        padded_col = pl.lit("01-") + pl.col(col_name)
                        cast_fmt = "%d-" + fmt
                        
                    cast_exprs.append(padded_col.str.to_date(format=cast_fmt, strict=False).alias(col_name))
                    logger.info(f"Inferred {col_name} as Partial Date (Format: {fmt}, padded with -01)")
                    date_detected = True
                    break
            except Exception:
                continue

        if date_detected:
            continue

        # Try Numeric (Float64 / Int64)
        # Clean up common European formatting (1 000,50 -> 1000.50)
        clean_col = pl.col(col_name).str.replace_all(" ", "").str.replace(",", ".")
        try:
            float_series = df.select(clean_col.cast(pl.Float64, strict=False))[col_name]
            float_non_null = float_series.drop_nulls()
            
            if len(float_non_null) > (total_non_null * 0.95):
                # Is it actually an Int? (all decimals are .0)
                # modulo 1 gives the decimal part. If sum is very close to 0, it's Int.
                is_int = False
                if len(float_non_null) > 0:
                    dec_sum = float_non_null.mod(1.0).sum()
                    if dec_sum == 0.0:
                        is_int = True
                
                if is_int:
                    cast_exprs.append(clean_col.cast(pl.Float64, strict=False).cast(pl.Int64, strict=False).alias(col_name))
                    logger.info(f"Inferred {col_name} as Int64")
                else:
                    cast_exprs.append(clean_col.cast(pl.Float64, strict=False).alias(col_name))
                    logger.info(f"Inferred {col_name} as Float64")
                continue
        except Exception:
            pass

    if cast_exprs:
        df = df.with_columns(cast_exprs)
        
    return df

