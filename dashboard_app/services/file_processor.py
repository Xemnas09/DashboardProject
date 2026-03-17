"""
File processing services: upload validation, preview generation, and lock-free reading.

This module handles:
1. Validating file extensions and sizes during upload.
2. Generating interactive previews (with automatic type inference).
3. Reading cached datasets into Polars DataFrames using memory-buffers
   to avoid file locking issues on Windows.
"""

import os
import uuid
import polars as pl
import pandas as pd
from pathlib import Path
from loguru import logger
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from typing import Dict, List, Optional, Any, Tuple
from python_calamine import CalamineWorkbook

from core.settings import settings
from core.exceptions import FileTooLargeException, InvalidFileTypeException
from services.type_inference import infer_and_cast_schema, smart_cast_to_boolean, smart_cast_to_date
from services.column_classifier import classify_column


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
ALLOWED_EXTENSIONS = {".csv", ".xlsx"}
CHUNK_SIZE = 1024 * 1024  # 1 MB


# ---------------------------------------------------------------------------
# Upload validation
# ---------------------------------------------------------------------------
def validate_extension(filename: str) -> str:
    """
    Validates the file against the extension whitelist and generates a safe UUID filename.
    
    Args:
        filename: Original filename from the user.
        
    Returns:
        A unique string filename (UUID + extension).
        
    Raises:
        InvalidFileTypeException: If extension is not allowed.
    """
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise InvalidFileTypeException()
    return f"{uuid.uuid4()}{ext}"


async def save_upload_chunked(upload_file, dest_path: str) -> int:
    """
    Streams an uploaded file to disk in manageable chunks.
    Monitors total size to prevent Disk-Full or DoS attacks.
    
    Args:
        upload_file: The starlette/fastapi UploadFile object.
        dest_path: System path where the file should be saved.
        
    Returns:
        Total bytes written.
        
    Raises:
        FileTooLargeException: If file exceeds configured limits.
    """
    max_bytes = settings.max_upload_size_bytes
    total = 0

    with open(dest_path, "wb") as f:
        while True:
            chunk = await upload_file.read(CHUNK_SIZE)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                f.close()
                if os.path.exists(dest_path):
                    os.remove(dest_path)
                raise FileTooLargeException()
            f.write(chunk)

    logger.info(f"File saved: {dest_path} ({total / 1024:.0f} KB)")
    return total


def classify_column(series: pl.Series) -> str:
    """
    Unified classification rule for column types.
    Identifies 'identifier' based on uniqueness and naming hints.
    """
    dtype = series.dtype
    is_int = dtype in (pl.Int8, pl.Int16, pl.Int32, pl.Int64,
                       pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64)
    is_float = dtype in (pl.Float32, pl.Float64)

    if is_int or is_float:
        total = len(series)
        if total == 0:
            return "continuous"
        unique_ratio = series.n_unique() / total
        name_lower = series.name.lower()
        name_hints = any(kw in name_lower for kw in
                         ['id', 'index', 'idx', 'key', 'code', 'num', 'no'])
        # Identifier if: near-unique values OR name strongly suggests ID
        if unique_ratio > 0.95 or (unique_ratio > 0.80 and name_hints):
            return "identifier"
        if is_int and series.n_unique() <= 20:
            return "discrete"
        return "continuous"

    if dtype == pl.Boolean:
        return "boolean"
    return "categorical"


# ---------------------------------------------------------------------------
# Schema Inference & Application
# ---------------------------------------------------------------------------
def process_file_preview(
    filepath: str,
    sheet_name: Optional[str] = None,
    schema_overrides: Optional[Dict[str, str]] = None,
    row_limit: int = 2000,
) -> Optional[Dict[str, Any]]:
    """
    Generate a high-level preview of a dataset for UI display.
    
    This function:
    1. Loads a sample/subset of the data.
    2. Runs advanced type inference (detecting dates, booleans, and formats).
    3. Merges automated inference with manual user overrides.
    4. Formats columns and data for the frontend table.
    
    Args:
        filepath: Absolute path to the dataset on disk.
        sheet_name: Specific Excel sheet to target.
        schema_overrides: Mapping of column names to target Polars types.
        row_limit: Maximum number of rows to return in the preview.
        
    Returns:
        A dictionary with sheet metadata, column info, and preview rows, 
        or None if processing fails.
    """
    logger.info(f"Generating preview for: {filepath} (sheet={sheet_name}, limit={row_limit})")
    try:
        # 1. Read the raw data into a DataFrame
        if filepath.endswith('.xlsx'):
            with open(filepath, "rb") as f:
                content = f.read()
            
            # Use Calamine to inspect structure without loading full data
            workbook = CalamineWorkbook.from_object(BytesIO(content))
            sheet_names = workbook.sheet_names
            
            # Multi-sheet enforcement: ask user which one to use if multiple exist
            if sheet_name is None and len(sheet_names) > 1:
                return {
                    'requires_sheet_selection': True,
                    'sheets': sheet_names,
                }
            
            active_sheet = sheet_name if sheet_name else sheet_names[0]
            df = pl.read_excel(content, sheet_name=active_sheet)
            sheet_name = active_sheet
            
        elif filepath.endswith('.csv'):
            with open(filepath, 'rb') as f:
                df = pl.read_csv(f.read(), ignore_errors=True)
        else:
            raise ValueError("Unsupported format")
            
        # 2. Schema Discovery & Inference
        original_schema = {col: str(dtype) for col, dtype in zip(df.columns, df.dtypes)}
        df = infer_and_cast_schema(df)
        
        suggested_overrides = {}
        for col in df.columns:
            new_type = str(df[col].dtype)
            if "Date" in new_type or "Datetime" in new_type:
                suggested_overrides[col] = "Date"
            elif "Bool" in new_type:
                suggested_overrides[col] = "Boolean"
            elif "Int" in new_type:
                suggested_overrides[col] = "Int64"
            elif "Float" in new_type:
                suggested_overrides[col] = "Float64"
            elif new_type != original_schema[col]:
                suggested_overrides[col] = "String"

        # 3. Apply manual User Overrides
        if schema_overrides:
            cast_exprs = []
            for col, target in schema_overrides.items():
                if col in df.columns:
                    current_type = str(df[col].dtype)
                    if target in ('Int64', 'Float64'):
                        if current_type in ('String', 'Utf8'):
                            clean_expr = pl.col(col).str.replace_all(r"[^\d.,\-]", "").str.replace(",", ".")
                            if target == 'Int64':
                                cast_exprs.append(clean_expr.cast(pl.Float64, strict=False).cast(pl.Int64, strict=False).alias(col))
                            else:
                                cast_exprs.append(clean_expr.cast(pl.Float64, strict=False).alias(col))
                        else:
                            # Already numeric or other type, just cast directly
                            cast_exprs.append(pl.col(col).cast(getattr(pl, target), strict=False).alias(col))
                    elif target == 'String' and 'String' not in current_type and 'Utf8' not in current_type:
                        cast_exprs.append(pl.col(col).cast(pl.String))
                    elif target == 'Boolean':
                        cast_exprs.append(smart_cast_to_boolean(col).alias(col))
                    elif target == 'Date':
                        cast_exprs.append(smart_cast_to_date(col, df).alias(col))
            if cast_exprs:
                df = df.with_columns(cast_exprs)

        # 4. Format for UI response
        columns_info = []
        for col in df.columns:
            series = df[col]
            col_type = classify_column(series)
            columns_info.append({
                'name': col,
                'dtype': str(series.dtype),
                'is_numeric': series.dtype.is_numeric(),
                'is_identifier': col_type == "identifier",
                'type': col_type
            })

        df_preview = df.head(row_limit)
        safe_df = df_preview.select(pl.all().cast(pl.String))

        result = {
            'requires_sheet_selection': False,
            'columns': [{
                'field': col,
                'title': col,
                'dtype': str(df[col].dtype),
                'is_numeric': df[col].dtype.is_numeric(),
                'semantic_type': classify_column(df[col]),
                'is_identifier': classify_column(df[col]) == "identifier",
            } for col in df.columns],
            'data': safe_df.to_dicts(),
            'total_rows': df.height,
            'selected_sheet': sheet_name,
            'suggested_overrides': suggested_overrides,
        }
        logger.success(f"Preview generated: {len(df.columns)} cols, {df.height} rows")
        return result

    except Exception as e:
        logger.error(f"Error processing preview: {e}", exc_info=True)
        return None


# ---------------------------------------------------------------------------
# Core Reading & Filtering
# ---------------------------------------------------------------------------
def read_cached_df(
    filepath: str, 
    selected_sheet: Optional[str] = None, 
    overrides: Optional[Dict[str, str]] = None
) -> Optional[pl.DataFrame]:
    """
    Read the full dataset from disk into a Polars DataFrame.
    
    This function implements a "Lock-Free" reading strategy by loading 
    file contents into memory before parsing. This avoids permission errors
    and file locking issues on Windows systems.
    
    Args:
        filepath: Absolute path to the file.
        selected_sheet: Name of the sheet to read (for Excel files).
        overrides: Column casting rules to apply immediately after loading.
        
    Returns:
        A fully typed Polars DataFrame, or None if the file is missing or corrupt.
    """
    if not filepath or not os.path.exists(filepath):
        return None

    try:
        # Standardize loading: Read bytes -> Load from bytes
        if filepath.endswith('.csv'):
            with open(filepath, 'rb') as f:
                df = pl.read_csv(f.read(), ignore_errors=True)
        elif filepath.endswith('.xlsx'):
            with open(filepath, 'rb') as f:
                xlsx_content = f.read()
            
            # Defaults to first sheet if not specified
            if not selected_sheet:
                with pd.ExcelFile(BytesIO(xlsx_content)) as xl:
                    selected_sheet = xl.sheet_names[0]
            
            df = pl.read_excel(xlsx_content, sheet_name=selected_sheet, engine="calamine")
        else:
            return None

        # Apply schema overrides if provided
        if overrides:
            cast_exprs = []
            for col, target in overrides.items():
                if col in df.columns:
                    current_type = str(df[col].dtype)
                    if target in ('Int64', 'Float64'):
                        if 'String' in current_type or 'Utf8' in current_type:
                            clean_expr = pl.col(col).str.replace_all(r"[^\d.,\-]", "").str.replace(",", ".")
                            if target == 'Int64':
                                cast_exprs.append(clean_expr.cast(pl.Float64, strict=False).cast(pl.Int64, strict=False).alias(col))
                            else:
                                cast_exprs.append(clean_expr.cast(pl.Float64, strict=False).alias(col))
                        else:
                            cast_exprs.append(pl.col(col).cast(getattr(pl, target), strict=False))
                    elif target == 'String' and 'String' not in current_type:
                        cast_exprs.append(pl.col(col).cast(pl.String))
                    elif target == 'Boolean':
                        cast_exprs.append(smart_cast_to_boolean(col).alias(col))
                    elif target == 'Date':
                        cast_exprs.append(smart_cast_to_date(col, df).alias(col))
            if cast_exprs:
                df = df.with_columns(cast_exprs)

        return df

    except Exception as e:
        logger.error(f"Error reading dataset: {e}")
        return None


def apply_filters(df: pl.DataFrame, filters: Dict[str, Any]) -> pl.DataFrame:
    """
    Apply a set of inclusive filters to a DataFrame.
    
    Args:
        df: The source Polars DataFrame.
        filters: A map of column names to values. Supports boolean string parsing.
        
    Returns:
        The filtered DataFrame.
    """
    if not filters:
        return df
    
    for col, val in filters.items():
        if col in df.columns:
            if df[col].dtype == pl.Boolean:
                val = str(val).lower() in ['true', '1', 'yes', 'oui']
            df = df.filter(pl.col(col) == val)
            
    return df


def get_sheet_previews_parallel(filepath: str, max_rows: int = 10) -> Dict[str, Any]:
    """
    Inspect all sheets in an Excel workbook in parallel.
    
    This is used to provide the user with a quick overview of all sheets
    when a multi-sheet workbook is uploaded. It extracts headers and a small
    sample of data from each sheet.
    
    Args:
        filepath: Path to the .xlsx file.
        max_rows: Samples rows to extract per sheet.
        
    Returns:
        A map where keys are sheet names and values are preview dictionaries.
    """
    if not filepath.endswith('.xlsx'):
        return {}

    logger.info(f"Parallel inspection for: {filepath}")
    
    def read_sheet_info(sheet_name: str) -> Tuple[str, Optional[Dict]]:
        try:
            with open(filepath, 'rb') as f:
                content = f.read()
            wb = CalamineWorkbook.from_object(BytesIO(content))
            sheet = wb.get_sheet_by_name(sheet_name)
            
            rows_iter = sheet.iter_rows()
            try:
                header = next(rows_iter)
            except StopIteration:
                return sheet_name, None

            data = []
            header_list = [str(h) for h in header]
            header_len = len(header_list)

            for i, row in enumerate(rows_iter):
                if i >= max_rows:
                    break
                row_dict = {}
                for j, val in enumerate(row):
                    if j < header_len:
                        row_dict[header_list[j]] = str(val)
                data.append(row_dict)
            
            return sheet_name, {
                "columns": [{"title": h, "field": h} for h in header_list],
                "data": data,
                "total_rows": 0
            }
        except Exception as e:
            logger.error(f"Failed to inspect sheet {sheet_name}: {e}")
            return sheet_name, None

    try:
        with open(filepath, 'rb') as f:
            content = f.read()
        wb = CalamineWorkbook.from_object(BytesIO(content))
        sheet_names = wb.sheet_names
        
        with ThreadPoolExecutor(max_workers=min(len(sheet_names), 8)) as executor:
            results_list = list(executor.map(read_sheet_info, sheet_names))
            
        return {name: info for name, info in results_list if info is not None}
    except Exception as e:
        logger.error(f"Global inspection failed: {e}")
        return {}
