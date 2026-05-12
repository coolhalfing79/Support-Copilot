import asyncio
from config.database import engine
from sqlalchemy import text

async def main():
    try:
        async with engine.begin() as conn:
            await conn.execute(text('ALTER TABLE knowledge_sources ADD COLUMN max_pages INTEGER NOT NULL DEFAULT 200;'))
            print('Migration Success')
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
