import uuid
from typing import AsyncGenerator
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Validates JWT bearer token and retrieves authenticated User."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    user_identifier: str = payload.get("sub")
    if not user_identifier:
        raise credentials_exception

    # Match by UUID or email
    try:
        user_uuid = uuid.UUID(user_identifier)
        stmt = select(User).where(User.id == user_uuid)
    except ValueError:
        stmt = select(User).where(User.email == user_identifier)

    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception

    return user
