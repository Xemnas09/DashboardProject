"""
Reports router: /api/reports/columns, /api/chart-data, /api/pivot-data
"""
import math

import polars as pl
from fastapi import APIRouter, Request, Depends
from loguru import logger

from api.auth.schemas import TokenPayload
from schemas.reports import ChartDataRequest, PivotDataRequest, LLMInterpretRequest, RecommendRequest, RecommendResponse
from core.dependencies import get_current_user, limiter
from core.exceptions import ValidationException, NotFoundException, SessionExpiredException
from services.file_processor import read_cached_df, apply_filters
from services.llm_interpreter import llm_interpreter

router = APIRouter(tags=["Reports"])


def _get_df(entry):
    df = read_cached_df(entry.filepath, entry.selected_sheet, entry.schema_overrides)
    if df is None:
        raise NotFoundException("Impossible de lire les données")
    return df


# ---------------------------------------------------------------------------
# GET /api/reports/columns
# ---------------------------------------------------------------------------
@router.get("/api/reports/columns")
async def reports_columns(user: TokenPayload = Depends(get_current_user)):
    from services.data_cache import cache_manager
    entry = await cache_manager.get(user.cache_id)
    columns_info = []

    row_count = 0
    if entry:
        df = _get_df(entry)
        row_count = len(df)
        for col in df.columns:
            columns_info.append({
                'name': col,
                'dtype': str(df[col].dtype),
                'is_numeric': df[col].dtype.is_numeric(),
            })

    return {"status": "success", "columns_info": columns_info, "row_count": row_count}


# ---------------------------------------------------------------------------
# GET /api/reports/unique-values
# ---------------------------------------------------------------------------
@router.get("/api/reports/unique-values")
async def unique_values(column: str, user: TokenPayload = Depends(get_current_user)):
    from services.data_cache import cache_manager
    entry = await cache_manager.get(user.cache_id)
    if not entry:
        raise SessionExpiredException()
    
    df = _get_df(entry)
    if column not in df.columns:
        raise ValidationException(f"Colonne '{column}' introuvable")
    
    # Get unique values, sorted, limited to 1000 for safety
    unique_vals = df[column].unique().drop_nulls().sort().head(1000).to_list()
    
    # Sanitize for JSON (handle NaN, Inf)
    def sanitize(v):
        if isinstance(v, float):
            if math.isnan(v) or math.isinf(v):
                return None
        return v

    return {
        "status": "success",
        "column": column,
        "values": [sanitize(v) for v in unique_vals],
        "total_unique": df[column].n_unique()
    }


# ---------------------------------------------------------------------------
# POST /api/chart-data
# ---------------------------------------------------------------------------
@router.post("/api/chart-data")
@limiter.limit("30/minute")
async def chart_data(
    request: Request,
    body: ChartDataRequest,
    user: TokenPayload = Depends(get_current_user),
):
    from services.data_cache import cache_manager
    entry = await cache_manager.get(user.cache_id)
    if not entry:
        raise SessionExpiredException()

    if not entry.filepath:
        raise NotFoundException("Fichier introuvable")

    x_col = body.x_column
    y_col = body.y_column
    chart_type = body.chart_type
    filters = body.filters

    if not x_col:
        raise ValidationException("Veuillez sélectionner au moins la variable X")

    df = _get_df(entry)
    df = apply_filters(df, filters)

    if len(df) == 0:
        return {
            "status": "success",
            "data": [],
            "message": "Aucune donnée pour ces filtres",
            "labels": [],
            "values": [],
        }

    if x_col not in df.columns:
        raise ValidationException(f'Colonne "{x_col}" introuvable')
    if y_col and y_col not in df.columns:
        raise ValidationException(f'Colonne "{y_col}" introuvable')

    x_is_numeric = df[x_col].dtype.is_numeric()
    y_is_numeric = df[y_col].dtype.is_numeric() if y_col else False
    limit = 5000

    # === FREQUENCY MODE (no Y column) ===
    if not y_col:
        df = df.drop_nulls(subset=[x_col])
        freq_df = df.group_by(x_col).agg(pl.len().alias('count'))
        freq_df = freq_df.sort('count', descending=True).head(limit)
        labels = [str(row[x_col]) for row in freq_df.to_dicts()]
        values = [int(row['count']) for row in freq_df.to_dicts()]

        if chart_type == 'pie':
            return {
                "status": "success",
                "chart_type": "pie",
                "title": f"Fréquence de {x_col}",
                "data": [{"name": l, "value": v} for l, v in zip(labels, values)],
            }
        return {
            "status": "success",
            "chart_type": chart_type,
            "x_name": x_col,
            "y_name": "Nombre d'occurrences",
            "labels": labels,
            "values": values,
        }

    # === TWO COLUMNS MODE ===
    df = df.drop_nulls(subset=[x_col, y_col])

    # BOXPLOT
    if chart_type == 'boxplot':
        if not y_is_numeric:
            raise ValidationException("Le boxplot nécessite une variable Y numérique")
        categories = df[x_col].cast(pl.Utf8).unique().sort().to_list()[:30]
        boxplot_data = []
        outliers_data = []
        for i, cat in enumerate(categories):
            subset = df.filter(pl.col(x_col).cast(pl.Utf8) == cat)[y_col].drop_nulls()
            if subset.len() == 0:
                continue
            q1 = float(subset.quantile(0.25))
            q2 = float(subset.quantile(0.5))
            q3 = float(subset.quantile(0.75))
            iqr = q3 - q1
            lower_fence = q1 - 1.5 * iqr
            upper_fence = q3 + 1.5 * iqr
            within = subset.filter((subset >= lower_fence) & (subset <= upper_fence))
            whisker_low = float(within.min()) if within.len() > 0 else float(subset.min())
            whisker_high = float(within.max()) if within.len() > 0 else float(subset.max())
            boxplot_data.append([whisker_low, q1, q2, q3, whisker_high])
            outlier_vals = subset.filter((subset < lower_fence) | (subset > upper_fence)).to_list()
            for val in outlier_vals[:50]:
                outliers_data.append([i, float(val)])

        return {
            "status": "success",
            "chart_type": "boxplot",
            "x_name": x_col,
            "y_name": y_col,
            "categories": categories,
            "data": boxplot_data,
            "outliers": outliers_data,
        }

    # SCATTER
    if chart_type == 'scatter':
        scatter_df = df.select([x_col, y_col]).head(5000)
        scatter_data = []
        for row in scatter_df.to_dicts():
            x_val = float(row[x_col]) if x_is_numeric else str(row[x_col])
            y_val = float(row[y_col]) if y_is_numeric else str(row[y_col])
            scatter_data.append([x_val, y_val])
        return {
            "status": "success",
            "chart_type": "scatter",
            "x_name": x_col,
            "y_name": y_col,
            "data": scatter_data,
        }

    # PIE
    if chart_type == 'pie':
        if y_is_numeric:
            agg_df = df.group_by(x_col).agg(pl.col(y_col).sum().alias('value'))
        else:
            agg_df = df.group_by(x_col).agg(pl.col(y_col).len().alias('value'))
        agg_df = agg_df.sort('value', descending=True).head(20)
        pie_data = [
            {"name": str(row[x_col]), "value": float(row['value'])}
            for row in agg_df.to_dicts()
        ]
        return {
            "status": "success",
            "chart_type": "pie",
            "title": f"{y_col} par {x_col}",
            "data": pie_data,
        }

    # BAR / LINE / AREA
    if y_is_numeric:
        agg_df = df.group_by(x_col).agg(pl.col(y_col).sum().alias('value'))
    else:
        agg_df = df.group_by(x_col).agg(pl.col(y_col).count().alias('value'))
    agg_df = agg_df.sort('value', descending=True).head(50)
    labels = [str(row[x_col]) for row in agg_df.to_dicts()]
    values = [float(row['value']) for row in agg_df.to_dicts()]

    return {
        "status": "success",
        "chart_type": chart_type,
        "x_name": x_col,
        "y_name": y_col,
        "labels": labels,
        "values": values,
    }


# ---------------------------------------------------------------------------
# POST /api/pivot-data
# ---------------------------------------------------------------------------
@router.post("/api/pivot-data")
@limiter.limit("30/minute")
async def pivot_data(
    request: Request,
    body: PivotDataRequest,
    user: TokenPayload = Depends(get_current_user),
):
    from services.data_cache import cache_manager
    entry = await cache_manager.get(user.cache_id)
    if not entry:
        raise SessionExpiredException()

    if not entry.filepath:
        raise NotFoundException("Fichier introuvable")

    row_cols = body.row_cols
    col_cols = body.col_cols
    value_cols = body.value_cols
    filters = body.filters

    # Backwards compatibility
    if not value_cols and body.value_col:
        from schemas.reports import PivotValueSpec
        value_cols = [PivotValueSpec(col=body.value_col, agg=body.agg_func or "sum")]

    if not row_cols or not value_cols:
        raise ValidationException("Sélectionnez au moins une ligne et une valeur")

    df = _get_df(entry)
    df = apply_filters(df, filters)

    if len(df) == 0:
        return {
            "status": "success",
            "headers": [],
            "rows": [],
            "totals": [],
            "row_count": 0,
            "message": "Filtres trop restrictifs",
        }

    def sanitize(v):
        if isinstance(v, float):
            if math.isnan(v) or math.isinf(v):
                return None
            return round(v, 2)
        return v

    # Build aggregation expressions
    agg_exprs = []
    for v in value_cols:
        c, a = v.col, v.agg
        curr = pl.col(c)
        if a in ['sum', 'mean', 'max', 'min']:
            curr = curr.cast(pl.Float64, strict=False)

        if a == 'sum': e = curr.sum()
        elif a == 'mean': e = curr.mean()
        elif a == 'count': e = pl.col(c).len()
        elif a == 'min': e = curr.min()
        elif a == 'max': e = curr.max()
        else: e = curr.sum()

        alias = f"{a}({c})" if len(value_cols) > 1 or col_cols else c
        agg_exprs.append(e.alias(alias))

    if col_cols:
        # Multi-column pivot key
        if len(col_cols) > 1:
            col_key = "_pivot_col_key_"
            df = df.with_columns(
                pl.concat_str([pl.col(c).cast(pl.String) for c in col_cols], separator=" | ").alias(col_key)
            )
            pivot_on = col_key
        else:
            pivot_on = col_cols[0]

        card = df[pivot_on].n_unique()
        if card > 200:
            raise ValidationException(f"Trop de colonnes ({card})")

        grouped = df.group_by(row_cols + [pivot_on]).agg(agg_exprs)
        pivoted = grouped.pivot(
            on=pivot_on,
            index=row_cols,
            values=[e.meta.output_name() for e in agg_exprs],
        )

        if row_cols:
            pivoted = pivoted.sort(row_cols[0])

        headers = list(pivoted.columns)
        rows = [[sanitize(d.get(h)) for h in headers] for d in pivoted.to_dicts()]

        totals = []
        for i, h in enumerate(headers):
            if h in row_cols:
                totals.append('TOTAL' if i == 0 else '')
            else:
                vals = [r[i] for r in rows if isinstance(r[i], (int, float)) and r[i] is not None]
                totals.append(sanitize(sum(vals)) if vals else '')
    else:
        summary = df.group_by(row_cols).agg(agg_exprs)
        if row_cols:
            summary = summary.sort(row_cols[0])

        headers = list(summary.columns)
        rows = [[sanitize(d.get(h)) for h in headers] for d in summary.to_dicts()]

        totals = []
        for i, h in enumerate(headers):
            if h in row_cols:
                totals.append('TOTAL' if i == 0 else '')
            else:
                vals = [r[i] for r in rows if isinstance(r[i], (int, float)) and r[i] is not None]
                totals.append(sanitize(sum(vals)) if vals else '')

    return {
        "status": "success",
        "headers": [str(h) for h in headers],
        "rows": rows,
        "totals": totals,
        "row_count": len(rows),
    }

@router.post("/api/chart-data/recommend", response_model=RecommendResponse)
@limiter.limit("20/minute")
async def recommend_chart_type(
    request: Request,
    body: RecommendRequest,
    user: TokenPayload = Depends(get_current_user)
):
    """
    Recommande le meilleur type de graphique selon les colonnes sélectionnées via IA.
    """
    recommendations = await llm_interpreter.recommend(
        x_col=body.x_column,
        x_type=body.x_type or "unknown",
        y_col=body.y_column or "",
        y_type=body.y_type or "unknown",
        row_count=body.row_count,
        language=body.language
    )
    
    return {"status": "success", "recommendations": recommendations}


@router.post("/api/chart-data/interpret")
@limiter.limit("20/minute")
async def interpret_chart_data(
    request: Request,
    body: LLMInterpretRequest,
    user: TokenPayload = Depends(get_current_user)
):
    """
    Appelle Gemini Flash Lite pour interpréter un résumé de données de graphique en langage naturel.
    """
    interpretation = await llm_interpreter.interpret_chart(
        chart_type=body.chart_type,
        x_column=body.x_column,
        y_column=body.y_column,
        summary=body.summary,
        language=body.language
    )
    
    return {
        "status": "success",
        "interpretation": interpretation
    }
