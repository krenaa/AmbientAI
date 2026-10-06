from datetime import datetime, timedelta, timezone
import logging
from typing import Any, Dict, Optional
import bcrypt
import jwt

from app.core.config import get_settings

from fastapi import HTTPException, status

logger = logging.getLogger("ambientai.security")
settings = get_settings()

_jwks_client: Optional[jwt.PyJWKClient] = None


def get_jwks_client() -> Optional[jwt.PyJWKClient]:
    """Returns singleton cached PyJWKClient for Clerk."""
    global _jwks_client
    if _jwks_client is None and settings.CLERK_JWKS_URL:
        _jwks_client = jwt.PyJWKClient(settings.CLERK_JWKS_URL, cache_keys=True)
    return _jwks_client


def verify_clerk_token(token: str) -> str:
    """Verifies a Clerk session JWT using the JWKS endpoint.
    Checks signature, expiry, and issuer, and returns the Clerk user id (the 'sub' claim).
    Raises HTTPException(401) on any failure.
    """
    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    jwks_client = get_jwks_client()
    if not jwks_client:
        logger.error("CLERK_JWKS_URL is not configured in settings.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication service unconfigured",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        
        # Derive expected issuer from JWKS URL (e.g. https://xxx.clerk.accounts.dev)
        expected_issuer = None
        if settings.CLERK_JWKS_URL and "/.well-known/" in settings.CLERK_JWKS_URL:
            expected_issuer = settings.CLERK_JWKS_URL.split("/.well-known/")[0].rstrip("/")

        decode_kwargs: Dict[str, Any] = {
            "algorithms": ["RS256"],
            "options": {"verify_exp": True},
        }
        if expected_issuer:
            decode_kwargs["issuer"] = expected_issuer

        payload = jwt.decode(
            token,
            signing_key.key,
            **decode_kwargs,
        )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing user subject claim",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return str(user_id)
    except HTTPException:
        raise
    except jwt.ExpiredSignatureError:
        logger.info("Clerk token has expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        logger.warning(f"Clerk JWT verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_password_hash(plain_password: str) -> str:
    """Hashes a plaintext password using bcrypt."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(plain_password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against a bcrypt or legacy PBKDF2 hash."""
    if not plain_password or not hashed_password:
        return False

    # Bcrypt
    if hashed_password.startswith("$2a$") or hashed_password.startswith("$2b$"):
        try:
            return bcrypt.checkpw(
                plain_password.encode("utf-8"),
                hashed_password.encode("utf-8"),
            )
        except Exception as e:
            logger.warning(f"Bcrypt verification failed: {e}")
            return False

    # Legacy PBKDF2 compatibility if needed
    if hashed_password.startswith("pbkdf2_sha256$"):
        try:
            import base64
            import hashlib
            import hmac

            parts = hashed_password.split("$", 3)
            if len(parts) != 4:
                return False
            _, iterations, salt, expected_hash = parts
            digest = hashlib.pbkdf2_hmac(
                "sha256",
                plain_password.encode("utf-8"),
                salt.encode("utf-8"),
                int(iterations),
            )
            actual_hash = base64.b64encode(digest).decode("ascii").strip()
            return hmac.compare_digest(actual_hash, expected_hash)
        except Exception:
            return False

    return False


def create_access_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Creates a signed JWT access token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta
        or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "sub": str(data.get("sub", ""))})
    return jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and validates a JWT token."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except (jwt.PyJWTError, Exception) as e:
        logger.debug(f"JWT decode error: {e}")
        return None
