"""
Database router: /api/database, /api/database/recast, /api/calculated-field
"""
import os
import shutil

import polars as pl
from fastapi import APIRouter, Request, Depends
from loguru import logger

from schemas.auth import TokenPayload
from schemas.database import RecastRequest, CalculatedFieldRequest
from dependencies import get_current_user, limiter
from exceptions import ValidationException, NotFoundException
from services.file_processor import process_file_preview, read_cached_df, apply_filters
from services.formula_parser import parse_formula
from services.notifications import notification_store

router = APIRouter(tags=["Database"])


def _get_df(entry):
    """Read the full dataframe from a cache entry."""
    df = read_cached_df(entry.filepath, entry.selected_sheet, entry.schema_overrides)
    if df is None:
        raise NotFoundException("Impossible de lire les données")
    return df


# ---------------------------------------------------------------------------
# GET /api/database
# ---------------------------------------------------------------------------
@router.get("/api/database")
async def database_view(
    request: Request,
    user: TokenPayload = Depends(get_current_user),
):
    from main import cache_manager
    entry = await cache_manager.get(user.cache_id)
    if not entry:
        return {"status": "success", "data_preview": None}

    df = _get_df(entry)

    # Optional filtering via header
    header_filters = request.headers.get('X-Apply-Filters') == 'true'
    if header_filters:
        # Could be extended to read filters from a per-user store
        pass

    data_preview = {
        'columns': [{'field': c, 'title': c} for c in df.columns],
        'columns_info': [{
            'name': c,
            'dtype': str(df[c].dtype),
            'is_numeric': df[c].dtype.is_numeric(),
        } for c in df.columns],
        'data': df.head(2000).to_dicts(),
        'total_rows': len(df),
    }
    return {"status": "success", "data_preview": data_preview}


# ---------------------------------------------------------------------------
# POST /api/database/recast
# ---------------------------------------------------------------------------
@router.post("/api/database/recast")
async def database_recast(
    body: RecastRequest,
    user: TokenPayload = Depends(get_current_user),
):
    from main import cache_manager
    entry = await cache_manager.get(user.cache_id)
    if not entry:
        raise NotFoundException("Aucune donnée disponible")

    filepath = entry.filepath
    selected_sheet = entry.selected_sheet

    if not filepath or not os.path.exists(filepath):
        raise NotFoundException("Fichier introuvable")

    modifications = body.modifications
    if not modifications:
        return {"status": "success", "message": "Aucune modification"}

    # Load the dataframe
    if filepath.endswith('.csv'):
        with open(filepath, 'rb') as f:
            df = pl.read_csv(f.read(), ignore_errors=True)
    elif filepath.endswith('.xlsx'):
        if selected_sheet:
            df = pl.read_excel(filepath, sheet_name=selected_sheet)
        else:
            df = pl.read_excel(filepath)
    else:
        raise ValidationException("Format non supporté")

    # Build cast expressions
    expressions = []
    for mod in modifications:
        col_name = mod.column
        target_type = mod.type
        if col_name in df.columns:
            clean_col = pl.col(col_name).cast(pl.String).str.strip_chars()
            clean_col = clean_col.str.replace_all(r"[^\d.,\-]", "")
            clean_col = clean_col.str.replace(r",", ".")

            if target_type == 'String':
                expressions.append(pl.col(col_name).cast(pl.String))
            elif target_type == 'Int64':
                expressions.append(clean_col.cast(pl.Float64, strict=False).cast(pl.Int64, strict=False))
            elif target_type == 'Float64':
                expressions.append(clean_col.cast(pl.Float64, strict=False))

    if not expressions:
        raise ValidationException("Types non supportés")

    # Dry-run validation
    test_df = df.with_columns(expressions)

    for mod in modifications:
        col = mod.column
        if col in df.columns:
            before_count = df[col].n_unique() - (1 if df[col].null_count() > 0 else 0)
            after_count = test_df[col].n_unique() - (1 if test_df[col].null_count() > 0 else 0)
            if before_count > 0 and after_count == 0:
                raise ValidationException(
                    f"Conversion impossible pour '{col}' : toutes les données seraient perdues."
                )

    df = test_df

    # Update schema overrides
    for mod in modifications:
        if mod.column in df.columns:
            entry.schema_overrides[mod.column] = mod.type

    # Check for partial data loss warnings
    warnings = []
    for mod in modifications:
        col = mod.column
        if col in df.columns and df[col].null_count() > (df.height * 0.5):
            warnings.append(f"Attention: >50% de données nulles dans '{col}' après conversion.")

    # Save back to file (atomic)
    temp_filepath = filepath + ".tmp"
    if filepath.endswith('.csv'):
        df.write_csv(temp_filepath)
    elif filepath.endswith('.xlsx'):
        df.write_excel(temp_filepath, worksheet=selected_sheet or 'Sheet1')

    # Atomic replacement
    backup_path = filepath + ".old"
    if os.path.exists(backup_path):
        os.remove(backup_path)
    os.rename(filepath, backup_path)
    os.rename(temp_filepath, filepath)
    os.remove(backup_path)

    # Refresh preview
    entry.preview = process_file_preview(
        filepath,
        sheet_name=selected_sheet,
        schema_overrides=entry.schema_overrides,
    )
    await cache_manager.set(user.cache_id, entry)

    msg = f"{len(modifications)} variables re-typées"
    if warnings:
        msg += f" ({len(warnings)} alertes)"

    notif = notification_store.add(user.sub, msg, "warning" if warnings else "success")

    return {
        "status": "success",
        "message": msg,
        "warnings": warnings,
        "notification": notif,
    }


# ---------------------------------------------------------------------------
# POST /api/calculated-field
# ---------------------------------------------------------------------------
@router.post("/api/calculated-field")
@limiter.limit("20/minute")
async def calculated_field(
    request: Request,
    body: CalculatedFieldRequest,
    user: TokenPayload = Depends(get_current_user),
):
    from main import cache_manager
    entry = await cache_manager.get(user.cache_id)
    if not entry:
        raise NotFoundException("Aucune donnée disponible")

    new_col_name = body.name.strip()
    formula = body.formula.strip()

    if not new_col_name:
        raise ValidationException("Nom du champ requis")
    if not formula:
        raise ValidationException("Formule requise")

    df = _get_df(entry)

    if new_col_name in df.columns:
        raise ValidationException(f'La colonne "{new_col_name}" existe déjà')

    try:
        expr = parse_formula(formula, df.columns)
        df = df.with_columns(expr.alias(new_col_name))
    except ValueError as ve:
        raise ValidationException(f"Erreur de formule: {str(ve)}")

    # Save back to file
    filepath = entry.filepath
    if filepath.endswith('.csv'):
        df.write_csv(filepath)
    elif filepath.endswith('.xlsx'):
        df.write_excel(filepath)

    # Refresh preview
    entry.preview = process_file_preview(
        filepath,
        sheet_name=entry.selected_sheet,
        schema_overrides=entry.schema_overrides,
    )
    await cache_manager.set(user.cache_id, entry)

    notif = notification_store.add(user.sub, f'Champ calculé "{new_col_name}" créé', "success")

    return {
        "status": "success",
        "message": f'Colonne "{new_col_name}" créée',
        "notification": notif,
        "new_column": {
            "name": new_col_name,
            "dtype": str(df[new_col_name].dtype),
            "is_numeric": df[new_col_name].dtype.is_numeric(),
        },
    }
