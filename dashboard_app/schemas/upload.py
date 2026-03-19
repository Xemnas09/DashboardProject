"""Schemas for upload endpoints."""
from pydantic import BaseModel, HttpUrl


class SheetSelectRequest(BaseModel):
    sheet_name: str


class UrlImportRequest(BaseModel):
    """Request body for importing data from a remote URL."""
    url: HttpUrl
