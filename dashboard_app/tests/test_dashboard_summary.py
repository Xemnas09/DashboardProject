import pytest
from httpx import AsyncClient
from main import app
from services.data_cache import cache_manager, CacheEntry
from datetime import datetime, timezone
import os

@pytest.mark.asyncio
async def test_dashboard_summary_no_data(auth_client: AsyncClient):
    """Test summary when no data is uploaded."""
    response = await auth_client.get("/api/dashboard/summary")
    assert response.status_code == 200
    data = response.json()
    assert data["has_data"] is False

@pytest.mark.asyncio
async def test_dashboard_summary_with_data(client: AsyncClient, tmp_path):
    """Test summary after uploading data."""
    from main import settings
    import jwt
    
    # 1. Login to get a real session/cache_id
    login_res = await client.post("/login", json={"username": "admin", "password": "admin123"})
    assert login_res.status_code == 200
    
    # 2. Extract cache_id from token
    token = client.cookies.get("access_token")
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    cache_id = payload["cache_id"]
    
    # 3. Mock a cache entry
    csv_path = tmp_path / "test_summary.csv"
    csv_path.write_text("Name,Age,Score\nAlice,30,85\nBob,25,90\nCharlie,35,")
    
    entry = CacheEntry(
        filepath=str(csv_path),
        filename="test_summary.csv",
        imported_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        file_size_mb=0.1
    )
    await cache_manager.set(cache_id, entry)
    
    # 4. Request summary
    response = await client.get("/api/dashboard/summary")
    assert response.status_code == 200
    data = response.json()
    
    assert data["has_data"] is True
    assert data["filename"] == "test_summary.csv"
    assert data["row_count"] == 3
    assert data["col_count"] == 3
    assert data["numeric_count"] >= 1
    assert data["null_rate"] > 0
    assert data["quality_score"] > 0
