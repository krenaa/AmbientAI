from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.core.config import get_settings
from app.core.security import decode_access_token, verify_clerk_token
from app.db.session import get_db

settings = get_settings()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
) -> str:
    """Reads Bearer token, verifies Clerk JWT using JWKS URL, and returns Clerk user ID ('sub').
    Returns 401 on any failure.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if settings.CLERK_JWKS_URL:
        return verify_clerk_token(token)

    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return str(payload.get("sub"))


async def get_current_user_optional(
    token: Optional[str] = Depends(oauth2_scheme),
) -> Optional[str]:
    """Retrieves Clerk user id if a valid token exists, otherwise returns None."""
    if not token:
        return None
    try:
        if settings.CLERK_JWKS_URL:
            return verify_clerk_token(token)
        payload = decode_access_token(token)
        if payload and payload.get("sub"):
            return str(payload.get("sub"))
        return None
    except Exception:
        return None
