"""
Pydantic schemas for the Auth domain. Defines the payload structures 
for authentication requests and the layout of the signed JWT tokens.
"""
from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class LoginRequest(BaseModel):
    """Schema for login credentials submitted by the client."""
    username: str
    password: str


class TokenPayload(BaseModel):
    """
    Schema representing the decoded payload of a validated JWT.
    Provides utility properties for interacting with the token expiry.
    """
    sub: str          # Subject matches the username
    cache_id: str     # Unique identifier mapping to the user's DATA_CACHE
    exp: int          # Expiration timestamp
    iat: Optional[int] = None  # Issued at timestamp
    jti: str          # JWT ID used for explicit token revocation
    type: str         # Token role: "access" or "refresh"
    role: str = "user" # RBAC role of the authenticated user

    @property
    def expires_at(self) -> datetime:
        """Returns the token expiration as a UTC datetime object."""
        return datetime.utcfromtimestamp(self.exp)
