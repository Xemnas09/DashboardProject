"""Pydantic schemas for authentication endpoints."""
from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


from datetime import datetime

class TokenPayload(BaseModel):
    """Decoded JWT payload."""
    sub: str          # username
    cache_id: str     # links to DATA_CACHE
    exp: int          # expiry timestamp
    iat: int | None = None
    jti: str
    type: str         # "access" or "refresh"
    role: str = "user"

    @property
    def expires_at(self) -> datetime:
        return datetime.utcfromtimestamp(self.exp)
