"""Schemas for upload endpoints."""
from pydantic import BaseModel


class SheetSelectRequest(BaseModel):
    sheet_name: str
