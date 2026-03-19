"""
Statistical logic to classify Polars DataFrame columns into semantic types.

This module maps raw data types (Dtypes) to meaningful semantic roles:
- **identifier**: Unique or near-unique keys (IDs, UUIDs, PKs).
- **numeric**: Measures that take any value (floats or high-cardinality ints).
- **boolean**: True/False logic (detects 0/1 disguised as numeric).
- **categorical**: Shared qualitative attributes or low-cardinality numeric sets.
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
        
    if dtype == pl.Date:
        return "date"
    if dtype == pl.Datetime:
        return "datetime"

    # Numeric logic (Heuristic based)
    if is_int or is_float:
        total = len(series)
        if total == 0:
            return "numeric"
            
        non_null_series = series.drop_nulls()
        non_null_total = len(non_null_series)
        if non_null_total == 0:
            return "numeric"
            
        unique_count = non_null_series.n_unique()
        unique_ratio = unique_count / non_null_total
        
        name_lower = series.name.lower()
        
        # --- PHASE 2: Boolean (0/1) Detection ---
        if unique_count == 2:
            unique_vals = set(non_null_series.unique().to_list())
            # Handle float/int 0 and 1
            if unique_vals <= {0, 1, 0.0, 1.0}:
                return "boolean"
                
        # --- PHASE 3: Identifier Detection ---
        # IDs are usually highly unique and have specific keywords in their name.
        # IDs are NEVER floats (prices, weights, rates).
        id_keywords = ['id', 'uuid', 'ref', 'pk', 'code', 'index', 'key', 'idx', 'num', 'no']
        has_id_name = any(kw in name_lower for kw in id_keywords)
        
        # Measures/Prices should NOT be classified as IDs even if unique.
        measure_keywords = ['prix', 'price', 'age', 'valeur', 'value', 'amount', 'montant', 'taux', 'rate', 'ht', 'ttc']
        has_measure_name = any(kw in name_lower for kw in measure_keywords)

        is_id = False
        if is_int: # Only integers or strings can be IDs
            # Rule 1.1: Perfect uniqueness
            if unique_ratio == 1.0:
                if non_null_total > 50 or has_id_name:
                    is_id = True
                elif not has_measure_name and non_null_total > 5:
                     is_id = True
            
            # Rule 1.2: Near-perfect uniqueness (98%+)
            elif unique_ratio > 0.98:
                if non_null_total > 500:
                    is_id = True
                elif has_id_name and non_null_total > 50:
                    is_id = True

        if is_id:
            return "identifier"
            
        # --- PHASE 4: Cardinality-based Classification ---
        # If it's a measure (age, price), it stays numeric (NUM) even if low cardinality (rare but possible).
        if has_measure_name:
            return "numeric"
            
        # Hard Cardinality Rule: Any numeric with few unique values is Categorical.
        if unique_count <= 20:
            return "categorical"
            
        return "numeric"

    # Default fallback for String/Object columns
    return "categorical"
