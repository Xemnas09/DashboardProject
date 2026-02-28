"""Pydantic schemas for authentication endpoints."""
from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenPayload(BaseModel):
    """Decoded JWT payload."""
    sub: str          # username
    cache_id: str     # links to DATA_CACHE
    exp: int          # expiry timestamp
    type: str         # "access" or "refresh"
