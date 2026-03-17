"""
Central API Router.

Consolidates all domain-specific routers into a single Application Programming Interface entrypoint.
"""
from fastapi import APIRouter

from routers import upload, database, reports, notifications
from api.auth.router import router as auth_router
from api.users.router import router as users_router
from api.realtime.router import router as ws_router

api_router = APIRouter()

api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(ws_router)
api_router.include_router(upload.router)
api_router.include_router(database.router)
api_router.include_router(reports.router)
api_router.include_router(notifications.router)
