import asyncio
from config.database import async_session_factory
from sqlalchemy import select, update
from models.knowledge_source import KnowledgeSource
from datetime import datetime, timezone

async def fix_status():
    async with async_session_factory() as db:
        stmt = (
            update(KnowledgeSource)
            .where(KnowledgeSource.url == 'https://docs.oracle.com/javase/8/docs/api/')
            .values(status='indexed', chunk_count=545, last_indexed_at=datetime.now(timezone.utc))
        )
        await db.execute(stmt)
        await db.commit()
        print("Updated source status to 'indexed' with 545 chunks")

if __name__ == '__main__':
    asyncio.run(fix_status())
