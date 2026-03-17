"""
Statistical logic to classify Polars DataFrame columns into semantic types.

This module maps raw data types (Dtypes) to meaningful semantic roles:
- **identifier**: Unique or near-unique keys (IDs, UUIDs, PKs).
- **continuous**: Measures that take any value (floats or high-cardinality ints).
- **discrete**: Counts or ranked values with limited unique set.
- **boolean**: True/False logic (detects 0/1 disguised as numeric).
- **categorical**: Shared qualitative attributes (strings).
- **date**: Temporal information (Date/Datetime).
"""

import polars as pl
from loguru import logger

def classify_column(series: pl.Series) -> str:
    """
    Classifies a Polars Series into a semantic type based on its data and name.
    
    Args:
        series: The Polars Series to analyze.
        
    Returns:
        A string representing the semantic category.
    """
    dtype = series.dtype
    is_int = dtype in (pl.Int8, pl.Int16, pl.Int32, pl.Int64,
                       pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64)
    is_float = dtype in (pl.Float32, pl.Float64)

    # Simple type-based mapping
    if dtype == pl.Boolean:
        return "boolean"
        
    if dtype in (pl.Date, pl.Datetime):
        return "date"

    # Numeric logic (Heuristic based)
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
        
        # --- PHASE 1: Identifier Detection ---
        # IDs are usually highly unique and have specific keywords in their name.
        id_keywords = ['id', 'uuid', 'ref', 'pk', 'code', 'index', 'key', 'idx', 'num', 'no']
        has_id_name = any(kw in name_lower for kw in id_keywords)
        
        # Measures/Prices should NOT be classified as IDs even if unique.
        measure_keywords = ['prix', 'price', 'age', 'valeur', 'value', 'amount', 'montant', 'taux', 'rate', 'ht', 'ttc']
        has_measure_name = any(kw in name_lower for kw in measure_keywords)

        is_id = False
        
        # Rule 1.1: Perfect uniqueness
        if unique_ratio == 1.0:
            if non_null_total > 50 or has_id_name:
                # Strong signal: 100% unique and either enough volume OR an explicit name
                is_id = True
            elif not has_measure_name and non_null_total > 5:
                 # Small file, no measure name, but perfectly unique: likely an ID
                 is_id = True
        
        # Rule 1.2: Near-perfect uniqueness (98%+)
        elif unique_ratio > 0.98:
            if non_null_total > 500:
                # High volume + very high uniqueness: statistically likely an ID
                is_id = True
            elif has_id_name and non_null_total > 50:
                # High uniqueness + explicit ID name: likely an ID
                is_id = True

        if is_id:
            return "identifier"
            
        # --- PHASE 2: Boolean (0/1) Disguised as Numeric ---
        # If it only has 2 unique values and they are exactly 0 and 1.
        if is_int and unique_count == 2:
            unique_vals = set(non_null_series.unique().to_list())
            if unique_vals == {0, 1}:
                return "boolean"
                
        # --- PHASE 3: Discrete vs Continuous ---
        # We consider a numeric column 'discrete' if it has limited variance (<= 20 unique values).
        # Otherwise, we treat it as continuous (likely a measure or price).
        if is_int and unique_count <= 20:
            return "discrete"
            
        return "continuous"

    # Default fallback for String/Object columns
    return "categorical"
