import asyncio
import argparse
from datetime import datetime, timezone
import os
import sys

# Ensure backend folder is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select
from app.db.session import AsyncSessionLocal, engine, Base, init_db
from app.core.security import get_password_hash
from app.models.user import User


async def create_or_update_admin(email: str, password: str, full_name: str = "System Administrator"):
    # Ensure tables and extensions exist
    await init_db()

    clean_email = email.lower().strip()
    hashed_password = get_password_hash(password)

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == clean_email))
        existing_user = result.scalar_one_or_none()

        if existing_user:
            existing_user.hashed_password = hashed_password
            existing_user.full_name = full_name
            await session.commit()
            print(f"[SUCCESS] Admin user '{clean_email}' updated with new password.")
        else:
            new_user = User(
                email=clean_email,
                hashed_password=hashed_password,
                full_name=full_name,
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
