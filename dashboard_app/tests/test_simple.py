import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from settings import settings

@pytest.mark.asyncio
async def test_engine_init():
    engine = create_async_engine(settings.async_database_url)
    async with engine.connect() as conn:
        assert conn is not None
    await engine.dispose()
