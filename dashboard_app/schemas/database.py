"""Schemas for database endpoints."""
from pydantic import BaseModel


class RecastModification(BaseModel):
    column: str
    type: str  # "String", "Int64", "Float64"


class RecastRequest(BaseModel):
    modifications: list[RecastModification]


class CalculatedFieldRequest(BaseModel):
    name: str
    formula: str
