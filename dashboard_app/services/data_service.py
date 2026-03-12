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

    return test_df, warnings

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
