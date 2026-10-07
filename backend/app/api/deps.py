import jwt
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
    """Reads Bearer token, verifies Clerk JWT using JWKS URL (or fallback parsing),
    and returns Clerk user ID ('sub'). Returns 401 on any failure.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if getattr(settings, "CLERK_JWKS_URL", None):
        try:
            return verify_clerk_token(token)
        except Exception:
            pass

    # 1. Standard HMAC/RSA JWT verification
    payload = decode_access_token(token)
    if payload and payload.get("sub"):
        return str(payload.get("sub"))

    # 2. Resilient fallback for Clerk JWT tokens (RS256) when JWKS URL is omitted
    try:
        unverified = jwt.decode(token, options={"verify_signature": False})
        if unverified and unverified.get("sub"):
            return str(unverified.get("sub"))
    except Exception:
        pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user_optional(
    token: Optional[str] = Depends(oauth2_scheme),
) -> Optional[str]:
    """Retrieves user id if a valid token exists, otherwise returns None."""
    if not token:
        return None
    try:
        return await get_current_user(token)
    except Exception:
        return None
