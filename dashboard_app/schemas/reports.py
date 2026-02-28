"""Schemas for report endpoints."""
from pydantic import BaseModel
from typing import Literal


class ChartDataRequest(BaseModel):
    x_column: str
    y_column: str | None = None
    chart_type: str = "bar"
    filters: dict = {}


class PivotValueSpec(BaseModel):
    col: str
    agg: Literal["sum", "mean", "count", "min", "max"] = "sum"


class PivotDataRequest(BaseModel):
    row_cols: list[str]
    col_cols: list[str] = []
    value_cols: list[PivotValueSpec] = []
    value_col: str | None = None      # backwards compat
    agg_func: str | None = None       # backwards compat
    filters: dict = {}
