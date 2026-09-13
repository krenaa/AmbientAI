import logging
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.conversation import Conversation, Message
from app.models.task import Task
from app.models.user import User
from app.schemas.chat import (
    ConversationCreate,
    ConversationOut,
    ConversationUpdate,
    MessageOut,
)

logger = logging.getLogger("ambientai.api.conversations")
router = APIRouter()


@router.get("", response_model=List[ConversationOut])
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(Conversation.created_at.desc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    payload: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = Conversation(
        title=payload.title or "New Conversation",
        user_id=current_user.id,
    )
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return conv


def parse_uuid(conv_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(conv_id)
    except ValueError:
        return uuid.uuid5(uuid.NAMESPACE_DNS, conv_id)


@router.patch("/{conversation_id}", response_model=ConversationOut)
async def rename_conversation(
    conversation_id: str,
    payload: ConversationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv_uuid = parse_uuid(conversation_id)
    stmt = select(Conversation).where(
        Conversation.id == conv_uuid,
        Conversation.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    conv = result.scalar_one_or_none()
    if not conv:
        # If not in DB yet, create it with this ID
        conv = Conversation(
            id=conv_uuid,
            user_id=current_user.id,
            title=payload.title.strip() or "New Conversation",
        )
        db.add(conv)
        await db.commit()
        await db.refresh(conv)
        return conv

    conv.title = payload.title.strip() or "Untitled Conversation"
    await db.commit()
    await db.refresh(conv)
    return conv


@router.delete("/{conversation_id}", status_code=status.HTTP_200_OK)
async def delete_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv_uuid = parse_uuid(conversation_id)
    stmt = select(Conversation).where(
        Conversation.id == conv_uuid,
        Conversation.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    conv = result.scalar_one_or_none()
    if conv:
        await db.execute(delete(Message).where(Message.conversation_id == conv_uuid))
        await db.execute(delete(Task).where(Task.conversation_id == conv_uuid))
        await db.delete(conv)
        await db.commit()
    return {"success": True, "id": str(conversation_id)}


@router.get("/{conversation_id}/messages", response_model=List[MessageOut])
async def get_conversation_messages(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
):
    conv_uuid = parse_uuid(conversation_id)
    stmt = (
        select(Message)
        .where(Message.conversation_id == conv_uuid)
        .order_by(Message.created_at.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())
