"""
Central API Router.

Consolidates all domain-specific routers into a single Application Programming Interface entrypoint.
"""
from fastapi import APIRouter

from api.auth.router import router as auth_router
from api.users.router import router as users_router
from api.realtime.router import router as ws_router

from routers.upload import router as upload_router
from routers.database import router as database_router
from routers.reports import router as reports_router
from routers.notifications import router as notifications_router
from routers.dashboard import router as dashboard_router
from routers.anomalies import router as anomalies_router

api_router = APIRouter()

api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(ws_router)
api_router.include_router(upload_router)
api_router.include_router(database_router)
api_router.include_router(reports_router)
api_router.include_router(notifications_router)
api_router.include_router(dashboard_router)
api_router.include_router(anomalies_router)
