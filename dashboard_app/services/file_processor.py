"""
File processing services: upload validation, preview generation, and lock-free reading.

This module handles:
1. Validating file extensions and sizes during upload.
2. Generating interactive previews (with automatic type inference).
3. Reading cached datasets into Polars DataFrames using memory-buffers
   to avoid file locking issues on Windows.
4. Robust handling of CSV/TSV encoding, separator detection, BOM stripping.
5. Processing of JSON, Parquet, and TSV formats.

Mandatory pipeline order in process_file_preview() and read_cached_df():
  1. read_format()            — load bytes from file by extension
  2. clean_column_names()     — strip BOM/whitespace, deduplicate
  3. validate_dataframe()     — reject empty files / 0-row datasets
  4. clean_excel_errors()     — Excel only: fix formula errors (#N/A etc.)
  5. flatten_parquet_types()  — Parquet only: cast nested types to String
  6. infer_and_cast_schema()  — type inference (unchanged, always last)
"""

import os
import uuid
import json as _json
import polars as pl
import pandas as pd
from pathlib import Path
from loguru import logger
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from typing import Dict, List, Optional, Any, Tuple
from python_calamine import CalamineWorkbook

from core.settings import settings
from core.exceptions import (
    FileTooLargeException,
    InvalidFileTypeException,
    ValidationException,
    JsonStructureException,
)
from services.type_inference import infer_and_cast_schema, smart_cast_to_boolean, smart_cast_to_date
from services.column_classifier import classify_column


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
ALLOWED_EXTENSIONS = {".csv", ".tsv", ".xlsx", ".xls", ".json", ".parquet"}
CHUNK_SIZE = 1024 * 1024  # 1 MB

# MIME type → file extension mapping for URL imports
MIME_TO_EXT: Dict[str, str] = {
    "text/csv": ".csv",
    "text/tab-separated-values": ".tsv",
    "application/json": ".json",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-excel": ".xls",
    "application/x-parquet": ".parquet",
    "application/octet-stream": "",  # fallback: guess from URL path
}


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


# ---------------------------------------------------------------------------
# Encoding & separator detection helpers
# ---------------------------------------------------------------------------
def detect_encoding(raw: bytes) -> str:
    """
    Detect file encoding using chardet on the first 4 KB.
    Falls back to 'utf-8' if detection is inconclusive.
    Also strips BOM from UTF-8 encoded content.

    Args:
        raw: Raw bytes from the file (first 4096 bytes recommended).

    Returns:
        Encoding name string suitable for `.decode()`.
    """
    try:
        import chardet
        sample = raw[:4096]
        result = chardet.detect(sample)
        detected = result.get("encoding") or "utf-8"
        confidence = result.get("confidence", 0)
        # Low confidence → fall back to utf-8
        if confidence < 0.5:
            detected = "utf-8"
        # Normalize common aliases
        detected = detected.lower().replace("-", "_")
        if detected in ("utf_8_sig", "utf_8"):
            detected = "utf-8"
        return detected
    except Exception:
        return "utf-8"


def strip_bom(raw: bytes) -> bytes:
    """Strip UTF-8, UTF-16 LE/BE BOMs if present."""
    for bom in (b"\xef\xbb\xbf", b"\xff\xfe", b"\xfe\xff"):
        if raw.startswith(bom):
            return raw[len(bom):]
    return raw


def detect_separator(sample_text: str) -> str:
    """
    Detect the CSV column separator by counting occurrences in the first 5 lines.

    Candidates: comma, semicolon, pipe, tab.
    Returns the separator with the highest average count per line.
    Defaults to comma if ambiguous.

    Args:
        sample_text: First few lines of the CSV file as decoded text.

    Returns:
        Single-character separator string.
    """
    candidates = [",", ";", "|", "\t"]
    lines = [l for l in sample_text.splitlines()[:5] if l.strip()]
    if not lines:
        return ","

    scores: Dict[str, float] = {}
    for sep in candidates:
        counts = [line.count(sep) for line in lines]
        avg = sum(counts) / len(counts) if counts else 0
        scores[sep] = avg

    best = max(scores, key=lambda s: scores[s])
    if scores[best] == 0:
        return ","
    return best


# ---------------------------------------------------------------------------
# Column name cleaning
# ---------------------------------------------------------------------------
def clean_column_names(df: pl.DataFrame) -> pl.DataFrame:
    """
    Step 2 of the pipeline (always called after read_format).

    - Strips BOM character (\\ufeff) from column names
    - Strips leading/trailing whitespace from column names
    - Deduplicates column names by appending _1, _2 etc.

    Args:
        df: Raw DataFrame immediately after loading.

    Returns:
        DataFrame with sanitized column names.
    """
    seen: Dict[str, int] = {}
    new_names = []
    for col in df.columns:
        # Strip BOM and whitespace
        clean = col.replace("\ufeff", "").strip()
        if not clean:
            clean = "column"
        # Deduplicate
        if clean in seen:
            seen[clean] += 1
            new_names.append(f"{clean}_{seen[clean]}")
        else:
            seen[clean] = 0
            new_names.append(clean)
    return df.rename(dict(zip(df.columns, new_names)))


# ---------------------------------------------------------------------------
# DataFrame validation
# ---------------------------------------------------------------------------
def validate_dataframe(df: pl.DataFrame, filename: str) -> None:
    """
    Step 3 of the pipeline (always called after clean_column_names).

    Raises ValidationException for:
    - 0 columns
    - 0 rows (no data)
    - All columns are empty (all null)

    Args:
        df: The cleaned DataFrame.
        filename: Original filename, used in error messages.

    Raises:
        ValidationException: If the DataFrame is unusable.
    """
    if df.width == 0:
        raise ValidationException(f"Le fichier '{filename}' ne contient aucune colonne.")
    if df.height == 0:
        raise ValidationException(
            f"Le fichier '{filename}' ne contient aucune ligne de données "
            "(uniquement des en-têtes ou fichier vide)."
        )
    # Check if ALL columns are entirely null
    all_null = all(df[col].null_count() == df.height for col in df.columns)
    if all_null:
        raise ValidationException(
            f"Le fichier '{filename}' semble vide : toutes les colonnes sont nulles."
        )


# ---------------------------------------------------------------------------
# Excel error cleanup
# ---------------------------------------------------------------------------
def clean_excel_errors(df: pl.DataFrame) -> pl.DataFrame:
    """
    Step 4 of the pipeline (Excel only: .xlsx and .xls).

    Replaces common Excel formula error strings with null so that
    type inference can proceed cleanly.

    Error strings replaced: #N/A, #VALUE!, #REF!, #DIV/0!, #NUM!, #NAME?, #NULL!

    Args:
        df: DataFrame freshly loaded from an Excel file.

    Returns:
        DataFrame with Excel error strings replaced by null.
    """
    excel_errors = {"#N/A", "#VALUE!", "#REF!", "#DIV/0!", "#NUM!", "#NAME?", "#NULL!"}
    cast_exprs = []
    for col in df.columns:
        if df[col].dtype == pl.String or df[col].dtype == pl.Utf8:
            expr = (
                pl.when(pl.col(col).is_in(list(excel_errors)))
                .then(pl.lit(None, dtype=pl.String))
                .otherwise(pl.col(col))
                .alias(col)
            )
            cast_exprs.append(expr)
    if cast_exprs:
        df = df.with_columns(cast_exprs)
    return df


# ---------------------------------------------------------------------------
# Parquet type flattening
# ---------------------------------------------------------------------------
def flatten_parquet_types(df: pl.DataFrame) -> pl.DataFrame:
    """
    Step 5 of the pipeline (Parquet only).

    Parquet files can contain nested types (List, Struct, Array) that
    cannot be displayed in the UI table. This function casts them to
    String so they can be inspected as text.

    Args:
        df: DataFrame loaded from a Parquet file.

    Returns:
        DataFrame with complex-typed columns cast to String.
    """
    complex_types = (pl.List, pl.Struct, pl.Array)
    cast_exprs = []
    for col in df.columns:
        if isinstance(df[col].dtype, complex_types):
            cast_exprs.append(pl.col(col).cast(pl.String).alias(col))
    if cast_exprs:
        df = df.with_columns(cast_exprs)
    return df


# ---------------------------------------------------------------------------
# Header heuristic
# ---------------------------------------------------------------------------
def first_row_looks_like_data(df: pl.DataFrame) -> bool:
    """
    Returns True ONLY if ALL column names are purely numeric/symbolic
    (no alphabetic character at all). This avoids false positives on
    financial datasets where headers are years (2020, 2021, 2022...).

    Used to display a UI warning suggesting the user toggle has_header off.

    Args:
        df: DataFrame whose column names are checked.

    Returns:
        True if the first row appears to be data rather than headers.
    """
    for col_name in df.columns:
        if any(c.isalpha() for c in col_name):
            return False  # At least one letter → genuine header
    return True


# ---------------------------------------------------------------------------
# Core format reader
# ---------------------------------------------------------------------------
def read_format(filepath: str, content: bytes, sheet_name: Optional[str] = None) -> Tuple[pl.DataFrame, Optional[List[str]]]:
    """
    Step 1 of the pipeline.

    Reads the file bytes into a Polars DataFrame based on file extension.
    For CSV/TSV: auto-detects encoding and separator.
    For JSON: expects a flat array of objects (list of rows).
    For Parquet: reads directly.
    For Excel: handles sheet selection.

    Args:
        filepath: Path to the file (used only to determine extension).
        content: Raw file bytes.
        sheet_name: Excel sheet name to read (None = first sheet or prompt user).

    Returns:
        Tuple of (DataFrame, sheet_names_if_excel_else_None).

    Raises:
        ValidationException: On parse errors.
        JsonStructureException: On non-tabular JSON.
    """
    ext = Path(filepath).suffix.lower()

    if ext in (".csv", ".tsv"):
        # Detect encoding and strip BOM
        raw = strip_bom(content)
        encoding = detect_encoding(raw)
        try:
            text = raw.decode(encoding, errors="replace")
        except Exception:
            text = raw.decode("utf-8", errors="replace")

        if ext == ".tsv":
            sep = "\t"
        else:
            sep = detect_separator(text)

        try:
            df = pl.read_csv(
                BytesIO(text.encode("utf-8")),
                separator=sep,
                ignore_errors=True,
                infer_schema_length=1000,
                null_values=["", "NA", "N/A", "null", "NULL", "None"],
            )
        except Exception as e:
            raise ValidationException(f"Impossible de lire le fichier CSV/TSV : {e}")
        return df, None

    elif ext in (".xlsx", ".xls"):
        try:
            workbook = CalamineWorkbook.from_object(BytesIO(content))
            sheet_names = workbook.sheet_names
        except Exception as e:
            msg = str(e).lower()
            if "password" in msg or "encrypt" in msg or "protected" in msg:
                raise ValidationException(
                    "Le fichier Excel est protégé par un mot de passe et ne peut pas être lu."
                )
            raise ValidationException(f"Fichier Excel corrompu ou illisible : {e}")

        # Multi-sheet: ask user to pick
        if sheet_name is None and len(sheet_names) > 1:
            return pl.DataFrame(), sheet_names  # Signal: requires sheet selection

        active_sheet = sheet_name if sheet_name else sheet_names[0]
        try:
            df = pl.read_excel(content, sheet_name=active_sheet, engine="calamine")
        except Exception as e:
            raise ValidationException(f"Erreur de lecture de la feuille '{active_sheet}' : {e}")

        # Forward-fill merged header cells: any column named like "Unnamed: X" from calamine -> ffill
        new_cols = []
        last_valid = None
        for col in df.columns:
            if col.startswith("Unnamed:") or col.strip() == "":
                new_cols.append(last_valid or col)
            else:
                last_valid = col
                new_cols.append(col)
        if new_cols != df.columns:
            df = df.rename(dict(zip(df.columns, new_cols)))

        return df, None

    elif ext == ".json":
        try:
            parsed = _json.loads(content.decode("utf-8", errors="replace"))
        except Exception as e:
            raise ValidationException(f"JSON invalide ou non décodable : {e}")

        if not isinstance(parsed, list):
            raise JsonStructureException(
                "Le fichier JSON doit être un tableau (liste) d'objets. "
                f"Type reçu : {type(parsed).__name__}."
            )

        if len(parsed) == 0:
            raise ValidationException("Le fichier JSON est un tableau vide.")

        # Check that all elements are flat dicts (not nested lists/dicts in values)
        first_item = parsed[0]
        if not isinstance(first_item, dict):
            raise JsonStructureException(
                "Le fichier JSON doit être un tableau d'objets (dictionnaires). "
                f"Le premier élément est de type : {type(first_item).__name__}."
            )

        has_nested = any(isinstance(v, (dict, list)) for v in first_item.values())
        if has_nested:
            raise JsonStructureException(
                "Le fichier JSON contient des objets imbriqués (valeurs de type liste ou objet). "
                "Veuillez aplatir le fichier avant de l'importer."
            )

        try:
            # Try Polars native JSON reader (expects NDJSON by default)
            df = pl.from_dicts(parsed)
        except Exception as e:
            raise ValidationException(f"Impossible de convertir le JSON en tableau : {e}")

        return df, None

    elif ext == ".parquet":
        try:
            df = pl.read_parquet(BytesIO(content))
        except Exception as e:
            raise ValidationException(f"Fichier Parquet corrompu ou illisible : {e}")
        return df, None

    else:
        raise InvalidFileTypeException()


# ---------------------------------------------------------------------------
# Column classifier (local copy — kept for backward compat)
# ---------------------------------------------------------------------------
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

    Pipeline (mandatory order):
      1. read_format()           — load by extension
      2. clean_column_names()    — strip BOM/whitespace, deduplicate
      3. validate_dataframe()    — reject empty/headerless files
      4. clean_excel_errors()    — Excel only
      5. flatten_parquet_types() — Parquet only
      6. infer_and_cast_schema() — type inference

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
        # Read file content into memory (lock-free strategy)
        if not os.path.exists(filepath):
            logger.error(f"File not found: {filepath}")
            return None

        if os.path.getsize(filepath) == 0:
            raise ValidationException(
                f"Le fichier '{Path(filepath).name}' est vide (0 octet)."
            )

        with open(filepath, "rb") as f:
            content = f.read()

        filename = Path(filepath).name

        # ── Step 1: Read ────────────────────────────────────────────────────
        df, sheet_names = read_format(filepath, content, sheet_name)

        # Handle multi-sheet Excel: signal to UI
        if sheet_names is not None:
            return {
                'requires_sheet_selection': True,
                'sheets': sheet_names,
            }

        # ── Step 2: Clean column names ───────────────────────────────────────
        df = clean_column_names(df)

        # ── Step 3: Validate ─────────────────────────────────────────────────
        validate_dataframe(df, filename)

        # ── Step 4: Excel error cleanup ──────────────────────────────────────
        ext = Path(filepath).suffix.lower()
        if ext in (".xlsx", ".xls"):
            df = clean_excel_errors(df)

        # ── Step 5: Parquet type flattening ──────────────────────────────────
        if ext == ".parquet":
            df = flatten_parquet_types(df)

        # ── Step 6: Type inference ───────────────────────────────────────────
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
            elif new_type != original_schema.get(col, ""):
                suggested_overrides[col] = "String"

        # ── Apply manual user overrides ──────────────────────────────────────
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
                            cast_exprs.append(pl.col(col).cast(getattr(pl, target), strict=False).alias(col))
                    elif target == 'String' and 'String' not in current_type and 'Utf8' not in current_type:
                        cast_exprs.append(pl.col(col).cast(pl.String))
                    elif target == 'Boolean':
                        cast_exprs.append(smart_cast_to_boolean(col).alias(col))
                    elif target == 'Date':
                        cast_exprs.append(smart_cast_to_date(col, df).alias(col))
            if cast_exprs:
                df = df.with_columns(cast_exprs)

        # ── Format for UI response ───────────────────────────────────────────
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

        # Heuristic warning for header detection
        header_warning = first_row_looks_like_data(df)

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
            'header_warning': header_warning,  # True = first row might be data
        }
        logger.success(f"Preview generated: {len(df.columns)} cols, {df.height} rows")
        return result

    except (ValidationException, JsonStructureException):
        raise  # Re-raise structured exceptions so the router can handle them
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

    Uses the same mandatory pipeline as process_file_preview:
      1. read_format()
      2. clean_column_names()
      3. validate_dataframe()
      4. clean_excel_errors()     (Excel only)
      5. flatten_parquet_types()  (Parquet only)
      6. schema overrides (if provided)

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
        with open(filepath, "rb") as f:
            content = f.read()

        filename = Path(filepath).name
        ext = Path(filepath).suffix.lower()

        # ── Step 1: Read ─────────────────────────────────────────────────────
        df, sheet_names = read_format(filepath, content, selected_sheet)

        # If Excel needs sheet selection but none provided, use first sheet
        if sheet_names is not None:
            df, _ = read_format(filepath, content, sheet_names[0])

        # ── Step 2: Clean column names ────────────────────────────────────────
        df = clean_column_names(df)

        # ── Step 3: Validate ──────────────────────────────────────────────────
        validate_dataframe(df, filename)

        # ── Step 4: Excel error cleanup ───────────────────────────────────────
        if ext in (".xlsx", ".xls"):
            df = clean_excel_errors(df)

        # ── Step 5: Parquet type flattening ───────────────────────────────────
        if ext == ".parquet":
            df = flatten_parquet_types(df)

        # ── Apply schema overrides ────────────────────────────────────────────
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

    except (ValidationException, JsonStructureException):
        raise
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

    Args:
        filepath: Path to the .xlsx or .xls file.
        max_rows: Sample rows to extract per sheet.

    Returns:
        A map where keys are sheet names and values are preview dictionaries.
    """
    ext = Path(filepath).suffix.lower()
    if ext not in (".xlsx", ".xls"):
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
