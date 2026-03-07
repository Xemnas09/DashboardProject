"""Schemas for database endpoints."""
from pydantic import BaseModel


class RecastModification(BaseModel):
    column: str
    type: str  # "String", "Int64", "Float64"


class RecastRequest(BaseModel):
    modifications: list[RecastModification]


class ExpressionRequest(BaseModel):
    name: str
    expression: str
    force: bool = False
