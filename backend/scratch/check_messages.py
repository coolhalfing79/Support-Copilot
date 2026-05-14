
import asyncio
from sqlalchemy import select
from config.database import async_session_factory
from models.message import Message

async def check():
    async with async_session_factory() as db:
        result = await db.execute(select(Message).order_by(Message.created_at.desc()).limit(5))
        messages = result.scalars().all()
        for m in messages:
            print(f"[{m.created_at}] {m.role}: {m.content[:50]}...")

if __name__ == "__main__":
    asyncio.run(check())
