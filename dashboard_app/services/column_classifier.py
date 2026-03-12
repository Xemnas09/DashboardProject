"""
Statistical logic to classify Polars DataFrame columns into specific semantic types:
- identifier
- continuous
- discrete
- boolean
- categorical
- date
"""
import polars as pl
from loguru import logger

def classify_column(series: pl.Series) -> str:
    """
    Classifies a single Polars Series into a semantic type.
    """
    dtype = series.dtype
    is_int = dtype in (pl.Int8, pl.Int16, pl.Int32, pl.Int64,
                       pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64)
    is_float = dtype in (pl.Float32, pl.Float64)

    if dtype == pl.Boolean:
        return "boolean"
        
    if dtype in (pl.Date, pl.Datetime):
        return "date"

    if is_int or is_float:
        total = len(series)
        if total == 0:
            return "continuous"
            
        non_null_series = series.drop_nulls()
        non_null_total = len(non_null_series)
        if non_null_total == 0:
            return "continuous"
            
        unique_count = non_null_series.n_unique()
        unique_ratio = unique_count / non_null_total
        
        name_lower = series.name.lower()
        name_hints = any(kw in name_lower for kw in
                         ['id', 'index', 'idx', 'key', 'code', 'num', 'no', 'ref'])
                         
        # Rule 1: Identifier detection
        if unique_ratio > 0.95 or (unique_ratio > 0.80 and name_hints):
            return "identifier"
            
        # Rule 2: Boolean (0/1) disguised as numeric
        # If it only has 2 unique values and they are 0 and 1
        if is_int and unique_count == 2:
            unique_vals = set(non_null_series.unique().to_list())
            if unique_vals == {0, 1}:
                return "boolean"
                
        # Rule 3: Discrete vs Continuous
        if is_int and unique_count <= 20:
            return "discrete"
            
        return "continuous"

    # String/Categorical fallback
    return "categorical"
