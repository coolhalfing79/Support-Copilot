import asyncio
import sys
import os
import json

sys.path.append(os.getcwd())

from config.database import async_session_factory
from models.knowledge_source import KnowledgeSource
from schemas.knowledge import KnowledgeSourceResponse
from sqlalchemy import select

async def check():
    async with async_session_factory() as db:
        result = await db.execute(select(KnowledgeSource))
        sources = result.scalars().all()
        # Simulate what the API does
        output = [KnowledgeSourceResponse.model_validate(s).model_dump() for s in sources]
        print(json.dumps(output, indent=2, default=str))

if __name__ == "__main__":
    asyncio.run(check())
