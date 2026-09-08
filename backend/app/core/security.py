import base64
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import logging
import secrets
from typing import Optional, Dict, Any
import jwt
from app.config import get_settings

logger = logging.getLogger("ambientdesk.security")
settings = get_settings()


def verify_password(plain_password: str, encoded_hash: str) -> bool:
    """Verifies a plaintext password against a Django-compatible pbkdf2_sha256 or bcrypt hash."""
    if not encoded_hash or not plain_password:
        return False

    # 1. Django PBKDF2 SHA256 format: pbkdf2_sha256$iterations$salt$hash
    if encoded_hash.startswith("pbkdf2_sha256$"):
        try:
            parts = encoded_hash.split("$", 3)
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
        except Exception as e:
            logger.warning(f"Error checking PBKDF2 hash: {e}")
            return False

    # 2. Bcrypt fallback
    if encoded_hash.startswith("$2a$") or encoded_hash.startswith("$2b$"):
        try:
            import bcrypt
            return bcrypt.checkpw(plain_password.encode("utf-8"), encoded_hash.encode("utf-8"))
        except Exception:
            return False

    return False


def get_password_hash(plain_password: str, iterations: int = 600000) -> str:
    """Hashes a password using Django-compatible PBKDF2-SHA256."""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        plain_password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    )
    hash_str = base64.b64encode(digest).decode("ascii").strip()
    return f"pbkdf2_sha256${iterations}${salt}${hash_str}"


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Creates a signed JWT access token matching SimpleJWT payload structure."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "token_type": "access"})
    return jwt.encode(to_encode, settings.effective_jwt_secret, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Creates a signed JWT refresh token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    to_encode.update({"exp": expire, "token_type": "refresh"})
    return jwt.encode(to_encode, settings.effective_jwt_secret, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and validates a JWT token."""
    try:
        payload = jwt.decode(
            token,
            settings.effective_jwt_secret,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except (jwt.PyJWTError, Exception) as e:
        logger.debug(f"JWT decode failed: {e}")
        return None
