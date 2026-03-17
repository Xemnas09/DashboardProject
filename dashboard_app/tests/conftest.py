import os
from pathlib import Path
import pytest
from httpx import AsyncClient, ASGITransport
from main import app
from core.database import engine, Base, AsyncSessionLocal
from api.users.crud import create_user
from api.users.schemas import UserCreate
from core.settings import settings

# Disable rate limiter for testing
from core.dependencies import limiter
limiter.enabled = False

# Fixtures for testing. Note: Using the default database configured in .env.
# To avoid data loss, always point DATABASE_URL to a test file when running tests manually.

@pytest.fixture(scope="session", autouse=True)
async def setup_database():
    """Ensure tables exist. We NO LONGER drop_all to prevent accidental loss of dev data."""
    async with engine.begin() as conn:
        # await conn.run_sync(Base.metadata.drop_all) # REMOVED for safety
        await conn.run_sync(Base.metadata.create_all)
    
    async with AsyncSessionLocal() as db:
        try:
            # Create admin for tests
            await create_user(db, UserCreate(
                username="admin", 
                password="admin123", 
                role="super_admin"
            ))
        except Exception:
            # User already exists or other DB error, ignore in setup_database
            pass
    
    os.makedirs(settings.upload_folder, exist_ok=True)
    yield

@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

@pytest.fixture
async def auth_client(client: AsyncClient):
    await client.post("/login", json={"username": "admin", "password": "admin123"})
    yield client
