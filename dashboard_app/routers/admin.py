from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from crud.user import (
    get_all_users, get_user_by_username, create_user,
    delete_user, update_password, update_role, rename_user
)
from schemas.user import UserRead, UserCreate, UserUpdatePassword, UserUpdateRole, UserRename
from routers.auth import TokenPayload
from dependencies import require_admin, require_super_admin
from settings import settings

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=list[UserRead])
async def list_users_api(
    _: TokenPayload = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all users — accessible by admin and super_admin."""
    return await get_all_users(db)


@router.post("/users", response_model=UserRead, status_code=201)
async def create_new_user(
    body: UserCreate,
    _: TokenPayload = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new user — accessible by admin and super_admin."""
    existing = await get_user_by_username(db, body.username)
    if existing:
        raise HTTPException(status_code=409, detail=f"Username '{body.username}' already exists")
    return await create_user(db, body)


@router.delete("/users/{username}", status_code=204)
async def delete_existing_user(
    username: str,
    current: TokenPayload = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a user — super_admin only."""
    if username == settings.super_admin_username:
        raise HTTPException(status_code=403, detail="Cannot delete the super admin account")
    if username == current.sub: # TokenPayload uses 'sub' for username
        raise HTTPException(status_code=403, detail="Cannot delete your own account")
    user = await get_user_by_username(db, username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await delete_user(db, user)


@router.patch("/users/{username}/password", status_code=200)
async def reset_password(
    username: str,
    body: UserUpdatePassword,
    _: TokenPayload = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Reset a user's password — super_admin only."""
    user = await get_user_by_username(db, username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await update_password(db, user, body.new_password)
    return {"status": "success"}


@router.patch("/users/{username}/role", status_code=200)
async def change_role(
    username: str,
    body: UserUpdateRole,
    _: TokenPayload = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Change a user's role — super_admin only."""
    if username == settings.super_admin_username:
        raise HTTPException(status_code=403, detail="Cannot change the super admin's role")
    user = await get_user_by_username(db, username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await update_role(db, user, body.new_role)
    return {"status": "success", "new_role": body.new_role}


@router.patch("/users/{username}/rename", status_code=200)
async def rename_existing_user(
    username: str,
    body: UserRename,
    _: TokenPayload = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Rename a user — super_admin only."""
    if username == settings.super_admin_username:
        raise HTTPException(status_code=403, detail="Cannot rename the super admin account")
    user = await get_user_by_username(db, username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    existing = await get_user_by_username(db, body.new_username)
    if existing:
        raise HTTPException(status_code=409, detail=f"Username '{body.new_username}' already taken")
    await rename_user(db, user, body.new_username)
    return {"status": "success", "new_username": body.new_username}


@router.patch("/users/me/rename", status_code=200)
async def rename_self(
    body: UserRename,
    current: TokenPayload = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Any authenticated user can rename themselves."""
    user = await get_user_by_username(db, current.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    existing = await get_user_by_username(db, body.new_username)
    if existing:
        raise HTTPException(status_code=409, detail=f"Username '{body.new_username}' already taken")
    await rename_user(db, user, body.new_username)
    return {"status": "success", "new_username": body.new_username}
