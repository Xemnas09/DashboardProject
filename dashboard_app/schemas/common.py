"""Shared response schemas."""
from pydantic import BaseModel
from typing import Any


class StatusResponse(BaseModel):
    status: str
    message: str | None = None


class ErrorResponse(BaseModel):
    status: str = "error"
    code: str
    message: str
