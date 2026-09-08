import asyncio
import argparse
from datetime import datetime, timezone
import os
import sys

# Ensure backend folder is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal, engine, Base
from app.core.security import get_password_hash
from app.models.user import User


async def create_or_update_admin(email: str, password: str, full_name: str = "Admin User"):
    # Ensure tables exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    clean_email = email.lower().strip()
    hashed_password = get_password_hash(password)
    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == clean_email))
        existing_user = result.scalar_one_or_none()

        if existing_user:
            existing_user.password = hashed_password
            existing_user.full_name = full_name
            existing_user.is_staff = True
            existing_user.is_superuser = True
            existing_user.is_active = True
            existing_user.updated_at = now
            await session.commit()
            print(f"[SUCCESS] Admin user '{clean_email}' updated with new password and admin privileges.")
        else:
            new_user = User(
                email=clean_email,
                username=clean_email,
                password=hashed_password,
                full_name=full_name,
                is_staff=True,
                is_superuser=True,
                is_active=True,
                date_joined=now,
                created_at=now,
                updated_at=now,
            )
            session.add(new_user)
            await session.commit()
            print(f"[SUCCESS] Admin user '{clean_email}' created successfully.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create or update an AmbientDesk Admin user.")
    parser.add_argument("--email", default="admin@ambientdesk.ai", help="Admin email (default: admin@ambientdesk.ai)")
    parser.add_argument("--password", default="AdminPass123!", help="Admin password (default: AdminPass123!)")
    parser.add_argument("--name", default="System Administrator", help="Admin full name")
    
    args = parser.parse_args()
    asyncio.run(create_or_update_admin(args.email, args.password, args.name))
