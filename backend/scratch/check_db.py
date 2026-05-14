import asyncio
import sys
import os

# Add current directory to path
sys.path.append(os.getcwd())

from config.database import async_session_factory
from models.knowledge_source import KnowledgeSource
from sqlalchemy import select

async def check():
    try:
        async with async_session_factory() as db:
            result = await db.execute(select(KnowledgeSource))
            sources = result.scalars().all()
            print(f"Total Sources: {len(sources)}")
            for s in sources:
                print(f"- {s.title} ({s.url}): status={s.status}, chunks={s.chunk_count}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(check())
