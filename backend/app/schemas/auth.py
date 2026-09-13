from datetime import datetime
import re
from uuid import UUID
from pydantic import BaseModel, EmailStr, ConfigDict, field_validator

DUMMY_KEYWORDS = {
    "test",
    "dummy",
    "admin",
    "administrator",
    "anonymous",
    "fake",
    "user",
    "sample",
    "demo",
    "asdf",
    "qwerty",
    "none",
    "null",
    "unknown",
    "testing",
    "temp",
    "placeholder",
    "someone",
    "nobody",
}


def validate_real_name(name: str | None) -> str:
    """Validate that the full name is a realistic, legitimate name, preventing dummy/placeholder inputs."""
    if not name or not name.strip():
        return ""
    clean = name.strip()

    if len(clean) < 3:
        raise ValueError("Full name must be at least 3 characters long.")

    if re.search(r"(.)\1{3,}", clean):
        raise ValueError("Please provide a legitimate full name without repetitive characters.")

    words = [w for w in re.split(r"\s+", clean) if w]
    if len(words) < 2:
        raise ValueError("Please provide both first and last name (e.g., 'Jane Doe').")

    for word in words:
        w_lower = re.sub(r"[^a-zA-Z]", "", word).lower()
        if w_lower in DUMMY_KEYWORDS:
            raise ValueError(f"'{word}' is a placeholder term. Please use your real name.")
        if len(w_lower) < 2:
            raise ValueError("Each name word must be at least 2 letters long.")

    if not re.match(r"^[A-Za-z]+(?:[' -][A-Za-z]+)*$", clean):
        raise ValueError("Full name can only contain letters, spaces, hyphens, and apostrophes.")

    return " ".join(w.capitalize() for w in words)


def derive_name_from_email(email: str) -> str:
    """Extract a clean human-readable name from email handle if name is missing."""
    prefix = email.split("@")[0]
    parts = re.split(r"[._\-+]+", prefix)
    clean_parts = [p.capitalize() for p in parts if len(p) >= 2 and p.lower() not in DUMMY_KEYWORDS]
    if len(clean_parts) >= 2:
        return " ".join(clean_parts[:2])
    elif len(clean_parts) == 1:
        return f"{clean_parts[0]} Member"
    return "Ambient User"


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = ""

    @field_validator("full_name")
    @classmethod
    def check_full_name(cls, v: str | None) -> str:
        return validate_real_name(v)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    current_password: str | None = None
    new_password: str | None = None

    @field_validator("full_name")
    @classmethod
    def check_full_name(cls, v: str | None) -> str | None:
        if v is not None and v.strip():
            return validate_real_name(v)
        return v


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    full_name: str | None = ""
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
