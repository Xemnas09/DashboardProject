"""Schemas for report endpoints."""
from pydantic import BaseModel, Field
from typing import Any
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
    row_cols: list[str] = Field(default_factory=list)
    col_cols: list[str] = Field(default_factory=list)
    value_cols: list[PivotValueSpec] = Field(default_factory=list)
    filters: dict = {}
    # Legacy support
    value_col: str | None = None
    agg_func: str | None = None
    limit: int | None = None

class LLMInterpretRequest(BaseModel):
    chart_type: str
    x_column: str
    y_column: str | None = None
    summary: dict[str, Any]
    language: str = "fr"

class ChartRecommendation(BaseModel):
    chart_type: str
    confidence: Literal["high", "medium", "low"]
    reason: str

class RecommendRequest(BaseModel):
    x_column: str
    x_type: str | None = None
    y_column: str | None = None
    y_type: str | None = None
    row_count: int = 0
    language: str = "fr"

class RecommendResponse(BaseModel):
    status: str = "success"
    recommendations: list[ChartRecommendation]
    agg_func: str | None = None
    filters: dict = {}
