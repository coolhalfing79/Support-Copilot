import asyncio
from sqlalchemy import text
from config.database import engine

async def repair_database():
    print("Starting Database Repair...")
    try:
        async with engine.begin() as conn:
            # Check if metadata column exists in messages table
            print("Checking 'messages' table...")
            await conn.execute(text("""
                ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB;
            """))
            print("DONE: 'metadata' column added/verified in 'messages' table.")
            
            # Also check if session has status column (just in case)
            await conn.execute(text("""
                ALTER TABLE sessions ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'active';
            """))
            print("DONE: 'status' column verified in 'sessions' table.")
            
        print("Database Repair Complete!")
    except Exception as e:
        print(f"Error during repair: {e}")
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(repair_database())
