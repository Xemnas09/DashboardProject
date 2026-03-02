"""
FastAPI application entry point.
Sets up CORS, lifespan (cache cleanup), global exception handler, and request logging middleware.
"""
import asyncio
import time
import sys
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from jose import jwt, JWTError
from loguru import logger
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from settings import settings
from exceptions import AppException

# ---------------------------------------------------------------------------
# Loguru configuration
# ---------------------------------------------------------------------------
logger.remove()

if settings.log_format == "json":
    logger.add(
        sys.stderr,
        serialize=True,
        level="DEBUG",
        backtrace=False,
        diagnose=False,
    )
else:
    logger.add(
        sys.stderr,
        format="<green>{time:HH:mm:ss}</green> | <level>{level:<7}</level> | <cyan>{message}</cyan>",
        level="DEBUG",
        colorize=True,
        backtrace=True,
        diagnose=True,
    )


# ---------------------------------------------------------------------------
# Cache manager
# ---------------------------------------------------------------------------
from services.data_cache import cache_manager  # noqa: E402


# ---------------------------------------------------------------------------
# Lifespan: background cache cleanup task
# ---------------------------------------------------------------------------
async def _cache_cleanup_loop():
    while True:
        await asyncio.sleep(settings.cache_cleanup_interval_minutes * 60)
        evicted = await cache_manager.evict_expired(settings.cache_ttl_hours)
        if evicted:
            logger.info(f"Cache cleanup: evicted {evicted} expired entries")
        else:
            logger.debug("Cache cleanup: nothing to evict")


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.upload_folder, exist_ok=True)
    logger.info(f"Datavera API starting (env={settings.environment})")
    logger.info(f"Upload folder: {settings.upload_folder} | Max size: {settings.max_upload_size_mb}MB")
    logger.info(f"Cache TTL: {settings.cache_ttl_hours}h | Cleanup interval: {settings.cache_cleanup_interval_minutes}min")
    logger.info(f"CORS origins: {settings.origins_list}")

    cleanup_task = asyncio.create_task(_cache_cleanup_loop())
    yield
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    logger.info("Datavera API stopped")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Datavera API",
    description="Backend API for the Datavera data analytics dashboard.",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------
from dependencies import limiter  # noqa: E402

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ---------------------------------------------------------------------------
# Global exception handler
# ---------------------------------------------------------------------------
@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    logger.log(
        "WARNING" if exc.status_code < 500 else "ERROR",
        f"AppException {exc.code}: {exc.message} [{request.method} {request.url.path}]",
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "code": exc.code,
            "message": exc.message,
        },
    )


# ---------------------------------------------------------------------------
# Request logging middleware
# ---------------------------------------------------------------------------
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000

    user = "anonymous"
    token = request.cookies.get("access_token")
    if token:
        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=[settings.jwt_algorithm],
            )
            user = payload.get("sub", "unknown")
        except JWTError:
            user = "invalid_token"

    if response.status_code < 400:
        level = "INFO"
    elif response.status_code < 500:
        level = "WARNING"
    else:
        level = "ERROR"

    logger.log(
        level,
        f"{request.method} {request.url.path} → {response.status_code} ({duration_ms:.0f}ms) [user={user}]",
    )
    return response


# ---------------------------------------------------------------------------
# Register routers
# ---------------------------------------------------------------------------
from routers import auth, upload, database, reports, notifications  # noqa: E402

app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(database.router)
app.include_router(reports.router)
app.include_router(notifications.router)


# ---------------------------------------------------------------------------
# Serve React frontend (doit être en DERNIER pour ne pas intercepter les routes API)
# ---------------------------------------------------------------------------
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
ASSETS_DIR = os.path.join(STATIC_DIR, "assets")
INDEX_FILE = os.path.join(STATIC_DIR, "index.html")

# On vérifie que le build React est complet (index.html + assets/)
FRONTEND_READY = os.path.exists(ASSETS_DIR) and os.path.exists(INDEX_FILE)

if FRONTEND_READY:
    # Sert les assets Vite (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")

    @app.get("/", include_in_schema=False)
    async def serve_index():
        return FileResponse(INDEX_FILE)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_react(full_path: str):
        return FileResponse(INDEX_FILE)
else:
    # Fallback si le frontend n'est pas buildé (dev local)
    @app.get("/", include_in_schema=False)
    async def root():
        return {"status": "ok", "app": "Datavera API", "version": "2.0.0"}
