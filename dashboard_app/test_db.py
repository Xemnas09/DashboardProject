import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.settings import settings
async def test():
    engine=create_async_engine(settings.async_database_url)
    async with engine.connect() as conn:
        res=await conn.execute(text("SELECT username, role, is_active FROM users"))
        print(res.fetchall())
asyncio.run(test())
