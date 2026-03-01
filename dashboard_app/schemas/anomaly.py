from pydantic import BaseModel
from typing import Literal

class AnomalyRequest(BaseModel):
    columns: list[str]
    method: Literal["zscore", "iqr", "isolation_forest"] = "zscore"
    threshold: float = 3.0
    language: str = "fr"

class AnomalyRow(BaseModel):
    row_index: int
    values: dict
    scores: dict
    flagged_columns: list[str]

class AnomalyResponse(BaseModel):
    status: str = "success"
    method_used: str
    total_rows: int
    anomaly_count: int
    anomaly_rate: float
    skipped_columns: list[str] = []
    anomalies: list[AnomalyRow]
    llm_summary: str | None = None
