"""
Notifications router: /api/notifications/read, /api/notifications/history
"""
from fastapi import APIRouter, Depends

from schemas.auth import TokenPayload
from dependencies import get_current_user
from services.notifications import notification_store

router = APIRouter(tags=["Notifications"])


@router.post("/api/notifications/read")
async def mark_notifications_read(user: TokenPayload = Depends(get_current_user)):
    notification_store.mark_read(user.sub)
    return {"status": "success"}


@router.get("/api/notifications/history")
async def get_notifications_history(user: TokenPayload = Depends(get_current_user)):
    return {
        "status": "success",
        "history": notification_store.get_history(user.sub),
    }
