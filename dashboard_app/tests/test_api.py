"""
Complete test suite for the Flask → FastAPI migration.
Covers all verification points from the migration plan v3.1.

Run: python -m pytest tests/test_api.py -v
"""
import os
import io
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient, ASGITransport
import jwt

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app, cache_manager
from core.settings import settings
from services.data_cache import CacheEntry
from core.database import engine, Base
from api.users.crud import create_user
from api.users.schemas import UserCreate

# Disable rate limiter for testing
from core.dependencies import limiter
limiter.enabled = False


# Fixtures are now in conftest.py


def _make_token(sub="admin", cache_id="test-cache", token_type="access", expire_minutes=30):
    import uuid
    payload = {
        "sub": sub, "cache_id": cache_id, "type": token_type,
        "role": "super_admin" if sub == "admin" else "user",
        "jti": str(uuid.uuid4()),
        "exp": datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _make_expired_token(sub="admin", cache_id="test-cache", token_type="access"):
    import uuid
    payload = {
        "sub": sub, "cache_id": cache_id, "type": token_type,
        "role": "super_admin" if sub == "admin" else "user",
        "jti": str(uuid.uuid4()),
        "exp": datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=5),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _make_csv(rows=10) -> bytes:
    lines = ["Name,Age,Score"]
    for i in range(rows):
        lines.append(f"Person{i},{20+i},{50+i*5}")
    return "\n".join(lines).encode()


# ===========================================================================
# 1. AUTH
# ===========================================================================

async def test_login_success(client):
    r = await client.post("/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200
    assert r.json()["status"] == "success"
    set_cookie = r.headers.get("set-cookie", "")
    assert "access_token" in set_cookie


async def test_login_bad_creds(client):
    r = await client.post("/login", json={"username": "admin", "password": "wrong"})
    assert r.status_code == 401
    assert r.json()["code"] == "UNAUTHORIZED"


async def test_status_no_cookie(client):
    r = await client.get("/api/status")
    assert r.status_code == 401
    assert r.json()["code"] == "UNAUTHORIZED"


async def test_status_with_cookie(auth_client):
    r = await auth_client.get("/api/status")
    assert r.status_code == 200
    b = r.json()
    assert b["user"] == "admin"
    assert "has_unread" in b
    assert "notifications" in b


async def test_expired_access_token(client):
    client.cookies.set("access_token", _make_expired_token())
    r = await client.get("/api/status")
    assert r.status_code == 401


async def test_tampered_token(client):
    client.cookies.set("access_token", "invalid.jwt.token")
    r = await client.get("/api/status")
    assert r.status_code == 401


async def test_refresh_flow(client):
    refresh = _make_token(token_type="refresh", expire_minutes=60)
    client.cookies.set("refresh_token", refresh)
    r = await client.post("/api/auth/refresh")
    assert r.status_code == 200
    assert "access_token" in r.headers.get("set-cookie", "")
    client.cookies.delete("refresh_token")


async def test_refresh_expired(client):
    expired = _make_expired_token(token_type="refresh")
    client.cookies.set("refresh_token", expired)
    r = await client.post("/api/auth/refresh")
    assert r.status_code == 401
    client.cookies.delete("refresh_token")


async def test_logout(auth_client):
    r = await auth_client.post("/logout")
    assert r.status_code == 200
    assert r.json()["status"] == "success"


# ===========================================================================
# 2. SESSION_EXPIRED + CACHE
# ===========================================================================

async def test_session_expired_410(client):
    token = _make_token(cache_id="nonexistent")
    client.cookies.set("access_token", token)
    r = await client.post("/api/chart-data", json={"x_column": "X"})
    assert r.status_code == 410
    assert r.json()["code"] == "SESSION_EXPIRED"
    assert "réimporter" in r.json()["message"].lower()


async def test_cache_eviction():
    entry = CacheEntry(filepath="/tmp/fake_evict.csv", filename="fake.csv")
    await cache_manager.set("evict-test", entry)
    # Override last_accessed AFTER the cache_manager.set (which sets it to utcnow)
    entry.last_accessed = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=10)
    evicted = await cache_manager.evict_expired(ttl_hours=1)
    assert evicted >= 1
    assert await cache_manager.get("evict-test") is None


async def test_cache_status_admin(client):
    token = _make_token(sub="admin")
    client.cookies.set("access_token", token)
    r = await client.get("/api/cache/status")
    assert r.status_code == 200
    b = r.json()
    assert "entries" in b
    assert "total_memory_mb" in b


async def test_cache_status_non_admin(client):
    token = _make_token(sub="random_user")
    client.cookies.set("access_token", token)
    r = await client.get("/api/cache/status")
    assert r.status_code == 401


# ===========================================================================
# 3. FILE UPLOAD HARDENING
# ===========================================================================

async def test_upload_csv(auth_client):
    files = {"file": ("data.csv", io.BytesIO(_make_csv(5)), "text/csv")}
    r = await auth_client.post("/upload", files=files)
    assert r.status_code == 200
    assert r.json()["status"] == "success"


async def test_upload_exe_rejected(auth_client):
    files = {"file": ("virus.exe", io.BytesIO(b"bad"), "application/octet-stream")}
    r = await auth_client.post("/upload", files=files)
    assert r.status_code == 415
    assert r.json()["code"] == "INVALID_FILE_TYPE"


async def test_upload_corrupt_xls(auth_client):
    """XLS is now allowed, so a bad file hits the parser, returning 400 instead of 415."""
    files = {"file": ("old.xls", io.BytesIO(b"bad"), "application/vnd.ms-excel")}
    r = await auth_client.post("/upload", files=files)
    assert r.status_code == 400
    assert r.json()["code"] == "VALIDATION_ERROR"
    assert "Excel" in r.json()["message"]


async def test_upload_txt_rejected(auth_client):
    files = {"file": ("readme.txt", io.BytesIO(b"text"), "text/plain")}
    r = await auth_client.post("/upload", files=files)
    assert r.status_code == 415


async def test_upload_uuid_filename(auth_client):
    files = {"file": ("personal.csv", io.BytesIO(_make_csv(3)), "text/csv")}
    r = await auth_client.post("/upload", files=files)
    assert r.status_code == 200
    saved = [f for f in os.listdir(settings.upload_folder) if f.endswith(".csv")]
    assert "personal.csv" not in saved


# ===========================================================================
# 4. EXCEPTION FORMAT
# ===========================================================================

async def test_error_format_401(client):
    r = await client.get("/api/status")
    b = r.json()
    assert b == {"status": "error", "code": "UNAUTHORIZED", "message": "Non autorisé"}


async def test_error_format_415(auth_client):
    files = {"file": ("bad.py", io.BytesIO(b"x"), "text/plain")}
    r = await auth_client.post("/upload", files=files)
    b = r.json()
    assert b["status"] == "error"
    assert b["code"] == "INVALID_FILE_TYPE"
    assert "CSV" in b["message"] and "Parquet" in b["message"]


# ===========================================================================
# 5. NEW FORMATS & CSV/EXCEL ROBUSTNESS
# ===========================================================================

async def test_upload_tsv(auth_client):
    content = b"col1\tcol2\nval1\tval2\n"
    files = {"file": ("data.tsv", io.BytesIO(content), "text/tab-separated-values")}
    r = await auth_client.post("/upload", files=files)
    assert r.status_code == 200

async def test_upload_json_array(auth_client):
    content = b'[{"id":1, "name":"A"}, {"id":2, "name":"B"}]'
    files = {"file": ("data.json", io.BytesIO(content), "application/json")}
    r = await auth_client.post("/upload", files=files)
    assert r.status_code == 200

async def test_upload_json_nested_rejected(auth_client):
    content = b'[{"id":1, "data":{"nested":true}}]'
    files = {"file": ("data.json", io.BytesIO(content), "application/json")}
    r = await auth_client.post("/upload", files=files)
    assert r.status_code == 422
    assert r.json()["code"] == "JSON_STRUCTURE_ERROR"

async def test_upload_json_not_array(auth_client):
    content = b'{"data": [{"id":1}]}'
    files = {"file": ("data.json", io.BytesIO(content), "application/json")}
    r = await auth_client.post("/upload", files=files)
    assert r.status_code == 422
    assert r.json()["code"] == "JSON_STRUCTURE_ERROR"

async def test_upload_parquet(auth_client):
    import polars as pl
    df = pl.DataFrame({"idx": [1, 2, 3]})
    buf = io.BytesIO()
    df.write_parquet(buf)
    buf.seek(0)
    files = {"file": ("data.parquet", buf, "application/octet-stream")}
    r = await auth_client.post("/upload", files=files)
    assert r.status_code == 200

async def test_upload_csv_semicolon(auth_client):
    content = b"a;b;c\n1;2;3"
    files = {"file": ("data.csv", io.BytesIO(content), "text/csv")}
    r = await auth_client.post("/upload", files=files)
    assert r.status_code == 200

async def test_upload_csv_latin1(auth_client):
    content = "café,thé\n1,2".encode("latin-1")
    files = {"file": ("data.csv", io.BytesIO(content), "text/csv")}
    r = await auth_client.post("/upload", files=files)
    assert r.status_code == 200

async def test_upload_csv_bom(auth_client):
    content = b"\xef\xbb\xbfColA,ColB\n1,2"
    files = {"file": ("data.csv", io.BytesIO(content), "text/csv")}
    r = await auth_client.post("/upload", files=files)
    assert r.status_code == 200
    
    r_db = await auth_client.get("/api/database?limit=1")
    assert r_db.status_code == 200
    assert r_db.json()["data_preview"]["columns"][0]["field"] == "ColA"  # BOM stripped

async def test_upload_csv_duplicate_cols(auth_client):
    content = b"id,id,val\n1,2,3"
    files = {"file": ("data.csv", io.BytesIO(content), "text/csv")}
    r = await auth_client.post("/upload", files=files)
    assert r.status_code == 200
    
    r_db = await auth_client.get("/api/database?limit=1")
    assert r_db.status_code == 200
    cols = [c["field"] for c in r_db.json()["data_preview"]["columns"]]
    assert cols == ["id", "id_duplicated_0", "val"]

async def test_upload_csv_empty_file(auth_client):
    files = {"file": ("empty.csv", io.BytesIO(b""), "text/csv")}
    r = await auth_client.post("/upload", files=files)
    assert r.status_code == 400
    assert r.json()["code"] == "VALIDATION_ERROR"

async def test_upload_csv_header_only(auth_client):
    files = {"file": ("header.csv", io.BytesIO(b"a,b,c\n"), "text/csv")}
    r = await auth_client.post("/upload", files=files)
    assert r.status_code == 400
    assert r.json()["code"] == "VALIDATION_ERROR"

async def test_upload_xlsx_password(auth_client):
    # Just a dummy bytes block mimicking encrypted excel or forcing Calamine password error
    # Instead of mocking Calamine, we'll just test the code branch if possible,
    # or rely on the generic corrupt file message. Let's just test that it fails 400.
    files = {"file": ("locked.xlsx", io.BytesIO(b"PK\x03\x04 encrypted"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    r = await auth_client.post("/upload", files=files)
    assert r.status_code == 400
    assert r.json()["code"] == "VALIDATION_ERROR"


# ===========================================================================
# 6. URL IMPORT
# ===========================================================================

import respx
import httpx

@respx.mock
async def test_url_import_direct_csv(auth_client):
    url = "https://example.com/data.csv"
    respx.get(url).respond(status_code=200, content=b"id,name\n1,test", headers={"Content-Type": "text/csv"})
    r = await auth_client.post("/api/upload/url", json={"url": url})
    assert r.status_code == 200
    assert r.json()["status"] == "success"

@respx.mock
async def test_url_import_invalid_url(auth_client):
    url = "https://example.com/notfound.csv"
    respx.get(url).respond(status_code=404)
    r = await auth_client.post("/api/upload/url", json={"url": url})
    assert r.status_code == 502
    assert r.json()["code"] == "URL_IMPORT_ERROR"

@respx.mock
async def test_url_import_unsupported_type(auth_client):
    url = "https://example.com/page.html"
    respx.get(url).respond(status_code=200, content=b"<html></html>", headers={"Content-Type": "text/html"})
    r = await auth_client.post("/api/upload/url", json={"url": url})
    assert r.status_code == 415
    assert r.json()["code"] == "INVALID_FILE_TYPE"

async def test_url_import_malformed_url(auth_client):
    r = await auth_client.post("/api/upload/url", json={"url": "not-a-url"})
    assert r.status_code == 422  # Pydantic validation error


# ===========================================================================
# 7. NOTIFICATIONS & DOCS
# ===========================================================================

async def test_notifications_history(auth_client):
    r = await auth_client.get("/api/notifications/history")
    assert r.status_code == 200
    assert isinstance(r.json()["history"], list)

async def test_mark_notifications_read(auth_client):
    r = await auth_client.post("/api/notifications/read")
    assert r.status_code == 200
    assert r.json()["status"] == "success"

async def test_swagger_docs(client):
    r = await client.get("/docs")
    assert r.status_code == 200



async def test_openapi_all_endpoints(client):
    r = await client.get("/openapi.json")
    assert r.status_code == 200
    paths = list(r.json()["paths"].keys())
    expected = [
        "/login", "/logout", "/api/status", "/api/auth/refresh",
        "/upload", "/api/upload/url", "/api/select-sheet", "/clear_data",
        "/api/database", "/api/database/recast",
        "/api/reports/columns", "/api/chart-data", "/api/pivot-data",
        "/api/notifications/read", "/api/notifications/history",
        "/api/cache/status",
    ]
    for ep in expected:
        assert ep in paths, f"Missing endpoint in OpenAPI: {ep}"


# ===========================================================================
# 7. FULL REGRESSION FLOW
# ===========================================================================

async def test_full_flow(client):
    """login → upload → DB → columns → chart → pivot → notifs → clear → logout"""
    # 1. Login
    r = await client.post("/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200

    # 2. Upload
    files = {"file": ("flow.csv", io.BytesIO(_make_csv(20)), "text/csv")}
    r = await client.post("/upload", files=files)
    assert r.status_code == 200
    assert r.json()["status"] == "success"

    # 3. Database view
    r = await client.get("/api/database")
    assert r.status_code == 200
    dp = r.json()["data_preview"]
    assert dp is not None
    assert dp["total_rows"] == 20
    assert len(dp["columns_info"]) == 3

    # 4. Report columns
    r = await client.get("/api/reports/columns")
    cols = r.json()["columns_info"]
    names = [c["name"] for c in cols]
    assert "Name" in names and "Age" in names and "Score" in names

    # 5. Chart (frequency)
    r = await client.post("/api/chart-data", json={"x_column": "Name", "chart_type": "bar"})
    assert r.status_code == 200
    assert r.json()["chart_type"] == "bar"
    assert len(r.json()["labels"]) == 20

    # 6. Chart (two cols)
    r = await client.post("/api/chart-data", json={
        "x_column": "Name", "y_column": "Score", "chart_type": "pie"
    })
    assert r.status_code == 200
    assert r.json()["chart_type"] == "pie"

    # 7. Pivot table
    r = await client.post("/api/pivot-data", json={
        "row_cols": ["Name"], "value_cols": [{"col": "Score", "agg": "sum"}]
    })
    assert r.status_code == 200
    pv = r.json()
    assert pv["row_count"] == 20
    assert "TOTAL" in pv["totals"]

    # 8. Notifications
    r = await client.get("/api/notifications/history")
    assert r.status_code == 200
    assert len(r.json()["history"]) > 0

    # 9. Clear
    r = await client.post("/clear_data")
    assert r.status_code == 200

    # 10. Logout
    r = await client.post("/logout")
    assert r.status_code == 200


async def test_response_shapes(client):
    """Verify response shapes match Flask originals."""
    # Login
    r = await client.post("/login", json={"username": "admin", "password": "admin123"})
    assert r.json()["status"] == "success"
    assert "access_token" in r.json()

    # Status
    r = await client.get("/api/status")
    b = r.json()
    for key in ("status", "user", "has_unread", "notifications"):
        assert key in b, f"Missing key: {key}"

    # Upload
    files = {"file": ("shape.csv", io.BytesIO(_make_csv(5)), "text/csv")}
    r = await client.post("/upload", files=files)
    b = r.json()
    for key in ("status", "message", "notification"):
        assert key in b, f"Missing key: {key}"

    # Database
    r = await client.get("/api/database")
    dp = r.json()["data_preview"]
    for key in ("columns", "columns_info", "data", "total_rows"):
        assert key in dp, f"Missing key: {key}"
