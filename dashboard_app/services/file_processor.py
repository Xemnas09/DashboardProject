"""
File processing: upload validation, preview generation, DataFrame reading.
"""
import os
import uuid
from pathlib import Path

import polars as pl
from loguru import logger

from core.settings import settings
from core.exceptions import FileTooLargeException, InvalidFileTypeException


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
ALLOWED_EXTENSIONS = {".csv", ".xlsx"}
CHUNK_SIZE = 1024 * 1024  # 1 MB


# ---------------------------------------------------------------------------
# Upload validation
# ---------------------------------------------------------------------------
def validate_extension(filename: str) -> str:
    """Validates extension whitelist and returns a UUID-based safe filename."""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise InvalidFileTypeException()
    return f"{uuid.uuid4()}{ext}"


async def save_upload_chunked(upload_file, dest_path: str) -> int:
    """
    Streams the uploaded file to disk in 1MB chunks.
    Raises FileTooLargeException if cumulative size exceeds the limit.
    Never loads the full file into memory.
    Returns the total bytes written.
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
                os.remove(dest_path)  # Clean up partial file
                raise FileTooLargeException()
            f.write(chunk)

    logger.info(f"File saved: {dest_path} ({total / 1024:.0f} KB)")
    return total


# ---------------------------------------------------------------------------
# File preview generation
# ---------------------------------------------------------------------------
def process_file_preview(
    filepath: str,
    sheet_name: str | None = None,
    schema_overrides: dict | None = None,
    row_limit: int = 2000,
) -> dict | None:
    """
    Reads a CSV/XLSX file, applies schema overrides, and returns preview data
    suitable for the frontend (columns, column info, rows, total count).
    """
    try:
        # Check for multiple sheets in Excel
        if filepath.endswith(('.xlsx',)) and sheet_name is None:
            import pandas as pd
            xl = pd.ExcelFile(filepath)
            if len(xl.sheet_names) > 1:
                return {
                    'requires_sheet_selection': True,
                    'sheets': xl.sheet_names,
                }
            sheet_name = xl.sheet_names[0]

        if filepath.endswith('.csv'):
            with open(filepath, 'rb') as f:
                df = pl.read_csv(f.read(), ignore_errors=True)
        elif filepath.endswith('.xlsx'):
            if sheet_name:
                df = pl.read_excel(filepath, sheet_name=sheet_name)
            else:
                df = pl.read_excel(filepath)
        else:
            raise ValueError("Format non supporté")

        # Apply manual type overrides
        if schema_overrides:
            cast_exprs = []
            for col, target in schema_overrides.items():
                if col in df.columns:
                    current_type = str(df[col].dtype)
                    if target == 'String' and 'String' not in current_type and 'Utf8' not in current_type:
                        cast_exprs.append(pl.col(col).cast(pl.String))
                    elif target == 'Int64' and 'Int' not in current_type:
                        cast_exprs.append(pl.col(col).cast(pl.Int64, strict=False))
                    elif target == 'Float64' and 'Float' not in current_type:
                        cast_exprs.append(pl.col(col).cast(pl.Float64, strict=False))
            if cast_exprs:
                df = df.with_columns(cast_exprs)

        # Column info for the UI
        columns_info = []
        for col in df.columns:
            columns_info.append({
                'name': col,
                'dtype': str(df[col].dtype),
                'is_numeric': df[col].dtype.is_numeric(),
            })

        # Limit rows for preview
        df_preview = df.head(row_limit) if row_limit else df
        safe_df = df_preview.select(pl.all().cast(pl.String))

        return {
            'requires_sheet_selection': False,
            'columns': [{'title': col, 'field': col} for col in df.columns],
            'columns_info': columns_info,
            'data': safe_df.to_dicts(),
            'total_rows': df.height,
            'selected_sheet': sheet_name,
        }

    except Exception as e:
        logger.error(f"Error processing preview: {e}", exc_info=True)
        return None


# ---------------------------------------------------------------------------
# Read the full DataFrame from a cache entry
# ---------------------------------------------------------------------------
def read_cached_df(filepath: str, selected_sheet: str | None, overrides: dict | None) -> pl.DataFrame | None:
    """
    Reads the full DataFrame from disk, applying any schema overrides.
    Returns None on failure.
    """
    if not filepath or not os.path.exists(filepath):
        return None

    try:
        if filepath.endswith('.csv'):
            with open(filepath, 'rb') as f:
                df = pl.read_csv(f.read(), ignore_errors=True)
        elif filepath.endswith('.xlsx'):
            if selected_sheet:
                df = pl.read_excel(filepath, sheet_name=selected_sheet)
            else:
                df = pl.read_excel(filepath)
        else:
            return None

        if overrides:
            cast_exprs = []
            for col, target in overrides.items():
                if col in df.columns:
                    current_type = str(df[col].dtype)
                    if target == 'String' and 'String' not in current_type and 'Utf8' not in current_type:
                        cast_exprs.append(pl.col(col).cast(pl.String))
                    elif target == 'Int64' and 'Int' not in current_type:
                        cast_exprs.append(pl.col(col).cast(pl.Int64, strict=False))
                    elif target == 'Float64' and 'Float' not in current_type:
                        cast_exprs.append(pl.col(col).cast(pl.Float64, strict=False))
            if cast_exprs:
                df = df.with_columns(cast_exprs)

        return df

    except Exception as e:
        logger.error(f"Error reading cached df: {e}")
        return None


# ---------------------------------------------------------------------------
# Filter helper
# ---------------------------------------------------------------------------
def apply_filters(df: pl.DataFrame, filters: dict) -> pl.DataFrame:
    """Applies a dictionary of filters to a Polars DataFrame."""
    if not filters:
        return df

    for col, value in filters.items():
        if col not in df.columns:
            continue

        dtype = df[col].dtype
        try:
            if isinstance(value, list):
                if dtype.is_numeric():
                    value = [float(v) for v in value]
                df = df.filter(pl.col(col).is_in(value))
            elif value is not None:
                if dtype.is_numeric():
                    df = df.filter(pl.col(col) == float(value))
                elif dtype == pl.Boolean:
                    df = df.filter(pl.col(col) == (str(value).lower() == 'true'))
                else:
                    df = df.filter(pl.col(col) == value)
        except Exception:
            continue

    return df
