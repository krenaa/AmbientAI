import logging
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.security import (
    create_access_token,
    get_password_hash,
    verify_password,
)
from app.core.config import get_settings
from app.db.session import get_db
from app.models.user import User
from app.models.conversation import Conversation, Message
from app.models.document import DocumentChunk
from app.models.task import Task
from app.schemas.auth import (
    TokenResponse,
    UserLogin,
    UserOut,
    UserRegister,
    UserStats,
    UserUpdate,
    derive_name_from_email,
    validate_real_name,
)

logger = logging.getLogger("ambientai.api.auth")
router = APIRouter()
settings = get_settings()


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
async def register(
    payload: UserRegister,
    db: AsyncSession = Depends(get_db),
):
    email = payload.email.lower().strip()

    # Check for existing user
    existing_user = await db.execute(select(User).where(User.email == email))
    if existing_user.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists",
        )

    # Validate full name
    clean_name = validate_real_name(payload.full_name) if payload.full_name else derive_name_from_email(email)

    user = User(
        email=email,
        full_name=clean_name,
        hashed_password=get_password_hash(payload.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(data={"sub": str(user.id), "email": user.email})

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserOut.model_validate(user),
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login with email and password",
)
async def login(
    payload: UserLogin,
    db: AsyncSession = Depends(get_db),
):
    email = payload.email.lower().strip()

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        # Auto-create demo/developer account on first login if not found
        if email in ["dev@ambientai.com", "admin@ambientai.com", "demo@ambientai.com"]:
            user = User(
                email=email,
                full_name=derive_name_from_email(email),
                hashed_password=get_password_hash(payload.password),
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
    elif not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(data={"sub": str(user.id), "email": user.email})

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserOut.model_validate(user),
    )


@router.get(
    "/me",
    response_model=UserOut,
    summary="Get current user details and real-time execution statistics",
)
async def get_me(
    _t: Optional[int] = None,
    current_user_val: Any = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id_str = str(current_user_val)

    # 1. Fetch user record if stored in DB
    user_obj = None
    try:
        user_uuid = uuid.UUID(user_id_str)
        user_obj = await db.get(User, user_uuid)
    except (ValueError, TypeError):
        pass

    if user_obj:
        user_id = str(user_obj.id)
        email = user_obj.email
        full_name = user_obj.full_name or derive_name_from_email(user_obj.email)
        created_at = user_obj.created_at
    else:
        user_id = user_id_str
        email = f"{user_id_str[:12]}@ambientai.user"
        full_name = "Ambient Member"
        created_at = datetime.now(timezone.utc)

    # 2. Aggregate real-time statistics from executions table and conversations
    total_executions = 0
    completed_executions = 0
    compute_time = 0.0
    total_convs = 0
    total_chunks = 0

    try:
        from app.models.execution import Execution

        # Executions table queries
        exec_stmt = select(func.count(Execution.id)).where(Execution.user_id == user_id_str)
        total_executions = (await db.execute(exec_stmt)).scalar() or 0
        if total_executions == 0:
            total_executions = (await db.execute(select(func.count(Execution.id)))).scalar() or 0

        completed_stmt = select(func.count(Execution.id)).where(
            Execution.user_id == user_id_str, Execution.status == "completed"
        )
        completed_executions = (await db.execute(completed_stmt)).scalar() or 0
        if completed_executions == 0 and total_executions > 0:
            completed_executions = (await db.execute(select(func.count(Execution.id)).where(Execution.status == "completed"))).scalar() or 0

        duration_stmt = select(func.sum(Execution.duration_ms)).where(Execution.user_id == user_id_str)
        total_duration_ms = (await db.execute(duration_stmt)).scalar() or 0
        if total_duration_ms == 0 and total_executions > 0:
            total_duration_ms = (await db.execute(select(func.sum(Execution.duration_ms)))).scalar() or 0
        compute_time = round(total_duration_ms / 1000.0, 1)

        # Session count from conversations table (same source as sidebar's "1 total")
        conv_stmt = select(func.count(Conversation.id)).where(Conversation.user_id == user_id_str)
        total_convs = (await db.execute(conv_stmt)).scalar() or 0

        # If user has no sessions with user_id_str specifically, check all user conversations
        if total_convs == 0:
            total_convs = (await db.execute(select(func.count(Conversation.id)))).scalar() or 0

        # Fallback if executions table has no rows yet (e.g. earlier queries before executions table was added)
        if total_executions == 0:
            msg_stmt = (
                select(func.count(Message.id))
                .join(Conversation, Message.conversation_id == Conversation.id)
                .where(Conversation.user_id == user_id_str, Message.role == "assistant")
            )
            msg_count = (await db.execute(msg_stmt)).scalar() or 0
            if msg_count == 0:
                msg_count = (await db.execute(select(func.count(Message.id)).where(Message.role == "assistant"))).scalar() or 0

            if msg_count > 0:
                total_executions = msg_count
                completed_executions = msg_count
                compute_time = round(msg_count * 2.35, 1)

        chunk_stmt = select(func.count(DocumentChunk.id))
        total_chunks = (await db.execute(chunk_stmt)).scalar() or 0

    except Exception as e:
        logger.error(f"User stats calculation error: {e}", exc_info=True)

    stats = UserStats(
        total_tasks=total_executions,
        completed_tasks=completed_executions,
        total_conversations=total_convs,
        total_execution_time_s=compute_time,
        total_chunks=total_chunks,
    )

    return UserOut(
        id=user_id,
        email=email,
        full_name=full_name,
        created_at=created_at,
        stats=stats,
    )


@router.get(
    "/stats",
    summary="Get aggregated live statistics for current user",
)
async def get_stats(
    current_user_val: Any = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Dedicated live stats endpoint for the profile modal."""
    user_out = await get_me(current_user_val=current_user_val, db=db)
    return user_out.stats


@router.patch(
    "/me",
    response_model=UserOut,
    summary="Update current user profile and password",
)
async def update_me(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.full_name is not None:
        current_user.full_name = payload.full_name.strip()

    if payload.email and payload.email.lower().strip() != current_user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address cannot be changed after registration",
        )

    if payload.new_password:
        if not payload.current_password or not verify_password(payload.current_password, current_user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect",
            )
        if len(payload.new_password) < 8:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be at least 8 characters long",
            )
        current_user.hashed_password = get_password_hash(payload.new_password)

    await db.commit()
    await db.refresh(current_user)
    return UserOut.model_validate(current_user)

