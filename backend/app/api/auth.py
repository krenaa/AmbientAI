from datetime import datetime, timezone
import logging
from typing import Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    verify_password,
)
from app.models.task import AgentTask
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    TokenRefreshRequest,
    UpdateProfileRequest,
    UserLoginRequest,
    UserProfileResponse,
    UserRegisterRequest,
    UserStatsResponse,
)

logger = logging.getLogger("ambientdesk.api.auth")
router = APIRouter()
security_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Dependency to retrieve authenticated user from Bearer JWT token."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_str = payload.get("user_id") or payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload missing user identifier.",
        )

    try:
        user_uuid = uuid.UUID(str(user_id_str))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed user ID in token.",
        )

    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or account is disabled.",
        )

    return user


async def calculate_user_stats(user_id: uuid.UUID, db: AsyncSession) -> UserStatsResponse:
    """Calculates summary statistics across user's tasks."""
    total_q = select(func.count(AgentTask.id)).where(AgentTask.user_id == user_id)
    total_count = (await db.execute(total_q)).scalar() or 0

    completed_q = select(func.count(AgentTask.id)).where(
        AgentTask.user_id == user_id, AgentTask.status == "completed"
    )
    completed_count = (await db.execute(completed_q)).scalar() or 0

    awaiting_q = select(func.count(AgentTask.id)).where(
        AgentTask.user_id == user_id, AgentTask.status == "awaiting_approval"
    )
    awaiting_count = (await db.execute(awaiting_q)).scalar() or 0

    time_q = select(func.sum(AgentTask.execution_time_ms)).where(AgentTask.user_id == user_id)
    total_time_ms = (await db.execute(time_q)).scalar() or 0.0

    return UserStatsResponse(
        total_tasks=total_count,
        completed_tasks=completed_count,
        awaiting_approval=awaiting_count,
        total_execution_time_s=round(total_time_ms / 1000.0, 2),
    )


def build_user_profile(user: User, stats: Optional[UserStatsResponse] = None) -> UserProfileResponse:
    return UserProfileResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name or "",
        role="Admin" if (user.is_staff or user.is_superuser) else user.role,
        is_staff=user.is_staff or user.is_superuser,
        date_joined=user.date_joined.isoformat() if user.date_joined else None,
        stats=stats,
    )


@router.post("/register/", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegisterRequest, db: AsyncSession = Depends(get_db)):
    """Registers a new user and returns JWT credentials."""
    clean_email = payload.email.lower().strip()
    existing = await db.execute(select(User).where(User.email == clean_email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists.",
        )

    now = datetime.now(timezone.utc)
    hashed_pw = get_password_hash(payload.password)
    new_user = User(
        email=clean_email,
        username=clean_email,
        password=hashed_pw,
        full_name=payload.full_name.strip() if payload.full_name else "",
        first_name="",
        last_name="",
        is_active=True,
        is_staff=False,
        is_superuser=False,
        date_joined=now,
        created_at=now,
        updated_at=now,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    stats = await calculate_user_stats(new_user.id, db)
    access_token = create_access_token({"user_id": str(new_user.id), "email": new_user.email})
    refresh_token = create_refresh_token({"user_id": str(new_user.id)})

    return AuthResponse(
        access=access_token,
        refresh=refresh_token,
        user=build_user_profile(new_user, stats),
    )


@router.post("/token/", response_model=AuthResponse)
async def login(payload: UserLoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticates credentials against Django PBKDF2 hashes and issues JWT tokens."""
    clean_email = payload.email.lower().strip()
    result = await db.execute(select(User).where(User.email == clean_email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No active account found with the given credentials",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is deactivated.",
        )

    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    stats = await calculate_user_stats(user.id, db)
    access_token = create_access_token({"user_id": str(user.id), "email": user.email})
    refresh_token = create_refresh_token({"user_id": str(user.id)})

    return AuthResponse(
        access=access_token,
        refresh=refresh_token,
        user=build_user_profile(user, stats),
    )


@router.post("/token/refresh/")
async def refresh_token(payload: TokenRefreshRequest, db: AsyncSession = Depends(get_db)):
    """Refreshes an access token using a valid refresh token."""
    decoded = decode_token(payload.refresh)
    if not decoded or decoded.get("token_type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )

    user_id_str = decoded.get("user_id")
    try:
        user_uuid = uuid.UUID(str(user_id_str))
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload.")

    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive.")

    new_access = create_access_token({"user_id": str(user.id), "email": user.email})
    return {"access": new_access}


@router.get("/me/", response_model=UserProfileResponse)
async def get_current_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns current user details with computed task statistics."""
    stats = await calculate_user_stats(current_user.id, db)
    return build_user_profile(current_user, stats)


@router.patch("/me/", response_model=UserProfileResponse)
async def update_profile(
    payload: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Updates user full name, email, and/or password."""
    if payload.full_name is not None:
        current_user.full_name = payload.full_name.strip()

    if payload.email is not None:
        clean_email = payload.email.lower().strip()
        if clean_email != current_user.email:
            existing = await db.execute(select(User).where(User.email == clean_email))
            if existing.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="A user with this email address already exists.",
                )
            current_user.email = clean_email
            current_user.username = clean_email

    if payload.new_password:
        if not payload.current_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is required to set a new password.",
            )
        if not verify_password(payload.current_password, current_user.password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password verification failed.",
            )
        if len(payload.new_password) < 8:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be at least 8 characters long.",
            )
        current_user.password = get_password_hash(payload.new_password)

    await db.commit()
    await db.refresh(current_user)

    stats = await calculate_user_stats(current_user.id, db)
    return build_user_profile(current_user, stats)
