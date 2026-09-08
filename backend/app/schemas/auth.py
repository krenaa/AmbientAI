from datetime import datetime
from typing import Optional
import uuid
from pydantic import BaseModel, EmailStr, Field


class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: Optional[str] = ""


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenRefreshRequest(BaseModel):
    refresh: str


class UserStatsResponse(BaseModel):
    total_tasks: int = 0
    completed_tasks: int = 0
    awaiting_approval: int = 0
    total_execution_time_s: float = 0.0


class UserProfileResponse(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = ""
    role: str = "Member"
    is_staff: bool = False
    date_joined: Optional[str] = None
    stats: Optional[UserStatsResponse] = None

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    access: str
    refresh: str
    user: UserProfileResponse


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None
