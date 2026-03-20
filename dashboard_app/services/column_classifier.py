"""
Scientific Variable Classifier for Polars DataFrames.
Implements a hierarchical decision tree based on statistical first principles.
Uses shared configuration constants for cross-module consistency.
"""

import polars as pl
import re
from loguru import logger
from .data_types_config import (
    BOOLEAN_TRUE_MARKERS, 
    BOOLEAN_FALSE_MARKERS, 
    CARDINALITY_THRESHOLD,
    MEASURE_KEYWORDS,
    ID_KEYWORDS
)

def classify_column(series: pl.Series) -> str:
    """
    Classifies a Polars Series into a semantic type using a 
    cardinality-first hierarchical approach.
    """
    dtype = series.dtype
    name_lower = series.name.lower()
    
    # 0. Basic Clean / Prep
    total = len(series)
    if total == 0:
        return "numeric"
        
    non_null_series = series.drop_nulls()
    non_null_total = len(non_null_series)
    if non_null_total == 0:
        return "categorical"
        
    unique_count = int(non_null_series.n_unique())
    unique_ratio = unique_count / non_null_total
    
    # --- LEVEL 1: NATIVE TYPES ---
    if dtype == pl.Boolean:
        return "boolean"
    if dtype == pl.Date:
        return "date"
    if dtype == pl.Datetime:
        return "datetime"
        
    # --- LEVEL 1.5: STRING-BASED TEMPORAL DETECTION ---
    # Even if stored as strings, they should be flagged if they look like dates
    if dtype in (pl.String, pl.Utf8):
        sample_vals = [str(x) for x in non_null_series.head(10).to_list()]
        if not sample_vals:
            return "categorical"
            
        # Simple regex for YYYY-MM-DD or DD/MM/YYYY or ISO 
        # Support for -, /, ., and space as separators
        date_pattern = r"^(\d{4}[-\/\.\s]\d{1,2}[-\/\.\s]\d{1,2})|(\d{1,2}[-\/\.\s]\d{1,2}[-\/\.\s]\d{4})$"
        time_pattern = r"\d{1,2}:\d{1,2}(:\d{1,2})?" # Has time component
        
        # New: Detection for numeric strings (likely Unix timestamps)
        is_unix_candidate = all(v.isdigit() and len(v) >= 10 for v in sample_vals if v)
        
        # Also check for month names (Janvier, etc.)
        months = ["janv", "fevr", "f\u00e9vr", "mars", "avr", "mai", "juin", "juil", "aout", "ao\u00fbt", "sept", "oct", "nov", "dec"]
        
        matches_date = all(re.search(date_pattern, v) for v in sample_vals if v)
        has_month_name = any(any(m in v.lower() for m in months) for v in sample_vals if v)
        
        if matches_date or has_month_name or is_unix_candidate:
            has_time = is_unix_candidate or any(re.search(time_pattern, v) for v in sample_vals if v)
            if has_time:
                return "datetime"
            return "date"

    # --- LEVEL 2: SEMANTIC BINARY ---
    if unique_count == 2:
        # Convert unique values to lowercase strings for marker matching
        unique_vals = {str(v).lower() for v in non_null_series.unique().to_list()}
        
        # If both values are recognized as boolean-like using shared markers
        if any(v in BOOLEAN_TRUE_MARKERS for v in unique_vals) and \
           any(v in BOOLEAN_FALSE_MARKERS for v in unique_vals):
            return "boolean"
        
    # --- LEVEL 3: QUALITATIVE / CATEGORICAL ---
    is_explicit_measure = any(kw in name_lower for kw in MEASURE_KEYWORDS)
    is_id_name = any(kw in name_lower for kw in ID_KEYWORDS)
    
    if unique_count <= CARDINALITY_THRESHOLD and not is_explicit_measure and not is_id_name:
        return "categorical"
    
    # Highly unique strings (IDs) vs Categorical strings
    if dtype in (pl.String, pl.Utf8):
        if is_explicit_measure:
            # Only suggest numeric if it actually looks like numbers (sample check)
            if any(re.search(r"\d", str(x)) for x in non_null_series.head(10).to_list()):
                return "numeric"
        
        if is_id_name:
            # IDs in strings should only be "discrete" (intended for Int64) 
            # if they are purely numeric strings. Otherwise they are categorical codes.
            if all(str(x).isdigit() for x in non_null_series.head(10).to_list()):
                return "discrete"
        
        if unique_ratio > 0.95:
            return "identifier"
        return "categorical"

    # --- LEVEL 4: QUANTITATIVE ---
    if dtype.is_integer():
        is_id_name = any(kw in name_lower for kw in ID_KEYWORDS)
        if is_id_name and unique_ratio > 0.95:
            return "identifier"
        return "discrete"

    if dtype.is_float():
        return "continuous"
        
    return "numeric"
