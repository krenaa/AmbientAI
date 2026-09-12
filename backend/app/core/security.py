from datetime import datetime, timedelta, timezone
import logging
from typing import Any, Dict, Optional
import bcrypt
import jwt

from app.core.config import get_settings

logger = logging.getLogger("ambientai.security")
settings = get_settings()


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
