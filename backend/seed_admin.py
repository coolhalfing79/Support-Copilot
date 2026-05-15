import asyncio
from config.database import async_session_factory
from services.auth_service import AuthService
from models.enums import UserRole

async def seed_admin():
    async with async_session_factory() as db:
        auth_service = AuthService()
        existing = await auth_service.get_user_by_email(db, "admin@admin.com")
        if not existing:
            await auth_service.create_user(db, "admin", "admin@admin.com", "12345", UserRole.admin)
            await db.commit()
            print("Admin user seeded successfully.")
        else:
            print("Admin user already exists.")

if __name__ == "__main__":
    asyncio.run(seed_admin())
