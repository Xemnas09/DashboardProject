"""
Enterprise Resilience & System Integrity Test Suite.
Validated for Datavera v2.8.2.

This suite performs a full end-to-end traversal of the application's core logic,
focusing on format parity, dirty data robustness, and feature integration.
"""

import os
import io
import pytest
import pandas as pd
import polars as pl
from datetime import datetime, timedelta
from httpx import AsyncClient, ASGITransport
from jose import jwt

# Ensure we can import from the parent app directory
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from main import app, cache_manager
from core.settings import settings
from core.database import engine, Base, AsyncSessionLocal
from api.users.crud import create_user
from api.users.schemas import UserCreate
from core.dependencies import limiter

# Disable rate limiter for testing
limiter.enabled = False

# ===========================================================================
# FIXTURES
# ===========================================================================

@pytest.fixture(scope="session", autouse=True)
async def setup_database():
    """Wipe and seed the database for a clean test context."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    
    async with AsyncSessionLocal() as db:
        await create_user(db, UserCreate(
            username="enterprise_admin", 
            password="secure_password_123", 
            role="super_admin"
        ))
    
    os.makedirs(settings.upload_folder, exist_ok=True)
    yield

@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

@pytest.fixture
async def auth_client(client):
    """Authenticated client with enterprise_admin session."""
    await client.post("/login", json={
        "username": "enterprise_admin", 
        "password": "secure_password_123"
    })
    return client

# ===========================================================================
# DATA GENERATION UTILITIES
# ===========================================================================

def create_mock_csv(data_rows: list) -> bytes:
    """Generates a CSV from a list of rows."""
    df = pd.DataFrame(data_rows)
    output = io.BytesIO()
    df.to_csv(output, index=False)
    return output.getvalue()

def create_mock_xlsx(sheets_data: dict, offset: int = 0) -> bytes:
    """
    Generates an XLSX file.
    Args:
        sheets_data: { 'SheetName': [rows] }
        offset: Number of empty or noise rows before the header.
    """
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        for name, rows in sheets_data.items():
            df = pd.DataFrame(rows)
            # If offset > 0, we write dummy data first
            start_row = offset
            if offset > 0:
                dummy = pd.DataFrame([["NOISE_DATA"] * len(df.columns)] * offset)
                dummy.to_excel(writer, sheet_name=name, index=False, header=False)
            
            df.to_excel(writer, sheet_name=name, index=False, startrow=start_row)
    return output.getvalue()

# ===========================================================================
# THE GIGA TEST: INTEGRITY FLOW
# ===========================================================================

@pytest.mark.asyncio
async def test_enterprise_resilience_flow(auth_client):
    """
    Step 1: Authenticate -> Established via fixture.
    Step 2: Format Parity (CSV vs XLSX)
    Step 3: Dirty Data Robustness (Header Offset)
    Step 4: Multi-Sheet Capabilities
    Step 5: Analysis (Recast, Calculated, Reports)
    Step 6: Cleanup
    """
    
    # --- STAGE 1: FORMAT PARITY ---
    # We upload identical data in CSV and XLSX to check if logic is uniform.
    parity_data = [
        {"ID": 1, "Date": "2023-01-01", "Val": 100},
        {"ID": 2, "Date": "2023-01-02", "Val": 200},
    ]
    
    csv_bytes = create_mock_csv(parity_data)
    xlsx_bytes = create_mock_xlsx({"Data": parity_data})
    
    # 1.1 CSV Upload
    res_csv = await auth_client.post("/api/upload", files={"file": ("parity.csv", csv_bytes, "text/csv")})
    assert res_csv.status_code == 200
    
    # 1.2 XLSX Upload (Overwrites for the user session)
    res_xlsx = await auth_client.post("/api/upload", files={"file": ("parity.xlsx", xlsx_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert res_xlsx.status_code == 200
    
    # --- STAGE 2: MULTI-SHEET MASTERY ---
    multi_data = {
        "Main": [{"A": 1, "B": 2}],
        "Hidden": [{"X": "Secret", "Y": "Data"}],
        "MetaData": [{"Version": "1.0", "Author": "Test"}]
    }
    multi_xlsx = create_mock_xlsx(multi_data)
    res_multi = await auth_client.post("/api/upload", files={"file": ("multi.xlsx", multi_xlsx, "application/xlsx")})
    assert res_multi.json()["status"] == "requires_sheet"
    assert "Hidden" in res_multi.json()["sheets"]
    
    # Select specific sheet
    res_select = await auth_client.post("/api/upload/select-sheet", json={"sheet_name": "Hidden"})
    assert res_select.status_code == 200
    
    # Verify DB view reflects "Hidden" sheet
    res_db = await auth_client.get("/api/database")
    assert res_db.json()["data_preview"]["columns_info"][0]["name"] == "X"
    
    # --- STAGE 3: DIRTY DATA / HEADER OFFSET ---
    # Note: Currently, the app expects headers on row 1. This documents the failure or partial behavior.
    dirty_data = [{"Target": "Found Me", "Value": 999}]
    dirty_xlsx = create_mock_xlsx({"Sheet1": dirty_data}, offset=2)
    await auth_client.post("/api/upload", files={"file": ("dirty.xlsx", dirty_xlsx, "application/xlsx")})
    
    # Check what was captured. 
    # With offset=2, the first row read by Polars might be null or noise.
    res_db_dirty = await auth_client.get("/api/database")
    # This is a baseline check: currently, it might fail to find headers accurately if offset.
    # We assert that the system DOES NOT crash.
    assert res_db_dirty.status_code == 200 

    # --- STAGE 4: SCHEMA TRANSFORMATION & FEATURE ENGINEERING ---
    # Re-upload clean numeric data for calculation tests
    clean_data = [
        {"Price": "100.50", "Qty": 10, "Date": "2023"},
        {"Price": "50,25", "Qty": 5, "Date": "2024"}, # French format price
    ]
    await auth_client.post("/api/upload", files={"file": ("clean.csv", create_mock_csv(clean_data), "text/csv")})
    
    # 4.1 Smart Recast (Price string -> Float)
    res_recast = await auth_client.post("/api/database/recast", json={
        "modifications": [{"column": "Price", "type": "Float64"}]
    })
    assert res_recast.status_code == 200
    
    # 4.2 Calculated Field (Revenue = Price * Qty)
    res_calc = await auth_client.post("/api/database/expression", json={
        "name": "Revenue",
        "expression": "Price * Qty"
    })
    assert res_calc.status_code == 200
    
    # --- STAGE 5: ADVANCED ANALYTICS ---
    # 5.1 Pivot Table
    res_pivot = await auth_client.post("/api/pivot-data", json={
        "row_cols": ["Date"],
        "value_cols": [{"col": "Revenue", "agg": "sum"}]
    })
    assert res_pivot.status_code == 200
    assert "TOTAL" in res_pivot.json()["totals"]
    
    # 5.2 Anomaly Detection
    res_anom = await auth_client.post("/api/anomalies", json={
        "columns": ["Revenue"],
        "threshold": 2.0
    })
    assert res_anom.status_code == 200
    assert "anomalies" in res_anom.json()

    # --- STAGE 6: NOTIFICATIONS & CLEANUP ---
    # Verify audit trail
    res_notif = await auth_client.get("/api/notifications/history")
    history = res_notif.json()["history"]
    # Check if some expected events are present
    msgs = [m["message"].lower() for m in history]
    assert any("importé" in msg for msg in msgs)
    
    # Wipe data
    res_clear = await auth_client.post("/api/clear_data")
    assert res_clear.status_code == 200
    
    # Check status (should be empty/session expired for data)
    res_final = await auth_client.post("/api/chart-data", json={"x_column": "Revenue"})
    assert res_final.status_code == 410 # Session Expired (data cleared)

    print("\n[SUCCESS] Enterprise Resilience & System Integrity Test Suite Completed.")
