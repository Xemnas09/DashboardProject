"""
Pydantic schemas for the Users domain. Specifies strict validation 
rules for input serialization and output formatting of user entities.
"""
from datetime import datetime
from pydantic import BaseModel, field_validator


class UserRead(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "user"

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in ("super_admin", "admin", "user"):
            raise ValueError("role must be super_admin, admin, or user")
        return v

    @field_validator("username")
    @classmethod
    def validate_username(cls, v):
        v = v.strip().lower()
        if len(v) < 2 or len(v) > 50:
            raise ValueError("username must be between 2 and 50 characters")
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("username can only contain letters, numbers, _ and -")
        return v


class UserUpdatePassword(BaseModel):
    new_password: str


class UserUpdateRole(BaseModel):
    new_role: str

    @field_validator("new_role")
    @classmethod
    def validate_role(cls, v):
        if v not in ("super_admin", "admin", "user"):
            raise ValueError("role must be super_admin, admin, or user")
        return v


class UserRename(BaseModel):
    new_username: str

    @field_validator("new_username")
    @classmethod
    def validate_username(cls, v):
        v = v.strip().lower()
        if len(v) < 2 or len(v) > 50:
            raise ValueError("username must be between 2 and 50 characters")
        return v
