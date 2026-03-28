"""
Anomaly Detection Schemas — Refonte v2.0

Enriched request/response models for the anomaly detection system.
"""
from pydantic import BaseModel
from typing import Literal


class AnomalyDetectRequest(BaseModel):
    method: Literal["zscore", "iqr", "isolation_forest"] = "zscore"
    sensitivity: Literal["strict", "standard", "loose"] = "standard"
    columns: list[str] = []  # empty = all numeric


class AnomalyInterpretRequest(BaseModel):
    method_label: str
    total_rows: int
    anomaly_count: int
    anomaly_rate: float
    top_columns: list[str]
    by_severity: dict[str, int]
    col_count: int
    filename: str = "dataset"


class NormalRange(BaseModel):
    median: float | None = None
    q1: float | None = None
    q3: float | None = None


class AnomalyRow(BaseModel):
    row_index: int
    severity: str
    severity_label: str
    score: float
    score_label: str
    contributing_columns: list[str]
    values: dict
    normal_ranges: dict[str, NormalRange] = {}


class SummaryStats(BaseModel):
    by_severity: dict[str, int] = {"high": 0, "moderate": 0, "low": 0}
    top_columns: list[str] = []


class AnomalyDetectResponse(BaseModel):
    status: str = "success"
    method: str
    method_label: str
    total_rows: int
    anomaly_count: int
    anomaly_rate: float
    severity: str
    severity_label: str
    columns_analyzed: list[str]
    anomalies: list[AnomalyRow]
    summary_stats: SummaryStats
