from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from api.users.crud import (
    get_all_users, get_user_by_username, create_user,
    delete_user, update_password, update_role, rename_user
)
from api.users.schemas import UserRead, UserCreate, UserUpdatePassword, UserUpdateRole, UserRename
from api.auth.schemas import TokenPayload
from core.dependencies import require_admin, require_super_admin
from core.settings import settings
from api.realtime.connection_manager import connection_manager

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# User management
# ---------------------------------------------------------------------------

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
) -> None:
    """Delete a user — super_admin only."""
    if username == settings.super_admin_username:
        raise HTTPException(status_code=403, detail="Cannot delete the super admin account")
    if username == current.sub:
        raise HTTPException(status_code=403, detail="Cannot delete your own account")
    user = await get_user_by_username(db, username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Disconnect before deletion so the user is ejected in real-time
    await connection_manager.force_disconnect_user(
        username,
        reason="Your account has been deleted."
    )
    await delete_user(db, user)


@router.patch("/users/{username}/password", status_code=200)
async def reset_password(
    username: str,
    body: UserUpdatePassword,
    _: TokenPayload = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Reset a user's password — super_admin only."""
    user = await get_user_by_username(db, username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await update_password(db, user, body.new_password)
    # Force-disconnect so the user must log in again with the new password
    await connection_manager.force_disconnect_user(
        username,
        reason="Your password has been reset by an administrator."
    )
    return {"status": "success"}


@router.patch("/users/{username}/role", status_code=200)
async def change_role(
    username: str,
    body: UserUpdateRole,
    _: TokenPayload = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Change a user's role — super_admin only."""
    if username == settings.super_admin_username:
        raise HTTPException(status_code=403, detail="Cannot change the super admin's role")
    user = await get_user_by_username(db, username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await update_role(db, user, body.new_role)
    # Notify the user about their new role via WebSocket (no forced disconnect)
    await connection_manager.send_to_user(username, {
        "event": "ROLE_CHANGED",
        "payload": {"new_role": body.new_role},
        "timestamp": datetime.utcnow().isoformat(),
    })
    return {"status": "success", "new_role": body.new_role}


@router.patch("/users/{username}/rename", status_code=200)
async def rename_existing_user(
    username: str,
    body: UserRename,
    _: TokenPayload = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
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
) -> dict[str, str]:
    """Any authenticated user can rename themselves."""
    user = await get_user_by_username(db, current.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    existing = await get_user_by_username(db, body.new_username)
    if existing:
        raise HTTPException(status_code=409, detail=f"Username '{body.new_username}' already taken")
    await rename_user(db, user, body.new_username)
    return {"status": "success", "new_username": body.new_username}


# ---------------------------------------------------------------------------
# Broadcast — Phase 2 WebSocket
# ---------------------------------------------------------------------------

class BroadcastRequest(BaseModel):
    message: str
    title: str = "Notification"
    category: str = "info"   # info | success | warning | error
    target: str = "all"      # "all" | specific username


@router.post("/broadcast")
async def broadcast_message(
    body: BroadcastRequest,
    current: TokenPayload = Depends(require_admin),
) -> dict[str, str]:
    """Send a real-time notification to all users or a specific one."""
    payload = {
        "event": "NOTIFICATION",
        "payload": {
            "message": body.message,
            "title": body.title,
            "category": body.category,
            "from": current.sub,
        },
        "timestamp": datetime.utcnow().isoformat(),
    }
    if body.target == "all":
        # Use broadcast_except to avoid sending back to the admin's own WS sessions.
        # The admin already gets confirmation via the REST response / frontend toast.
        # Sending to the admin's own sessions can crash flaky dual-proxy connections
        # (e.g. HF Spaces) and trigger cascade disconnects.
        await connection_manager.broadcast_except(current.sub, payload)
    else:
        await connection_manager.send_to_user(body.target, payload)

    return {"status": "success", "sent_to": body.target}
