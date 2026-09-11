import asyncio
import logging
from typing import List, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.task import AgentTask, TaskExecutionLog
from app.models.user import User
from app.schemas.task import (
    AgentTaskResponse,
    ApproveTaskRequest,
    CreateTaskRequest,
    RenameTaskRequest,
    TaskExecutionLogResponse,
)
from app.services.task_runner import execute_task_workflow

logger = logging.getLogger("ambientdesk.api.tasks")
router = APIRouter()


def serialize_task(task: AgentTask) -> AgentTaskResponse:
    """Serializes an AgentTask instance to the matching frontend response schema."""
    logs_data = [
        TaskExecutionLogResponse(
            id=str(log.id),
            node_name=log.node_name,
            message=log.message,
            metadata=log.metadata_ or {},
            timestamp=log.timestamp.isoformat() if log.timestamp else "",
        )
        for log in (task.logs or [])
    ]

    return AgentTaskResponse(
        id=str(task.id),
        user_id=str(task.user_id) if task.user_id else None,
        user_email=task.user.email if task.user else None,
        title=task.title,
        prompt=task.prompt,
        status=task.status,
        triage_category=task.triage_category,
        output=task.output,
        approval_prompt=task.approval_prompt,
        error_message=task.error_message,
        execution_time_ms=task.execution_time_ms,
        total_tokens=task.total_tokens,
        created_at=task.created_at.isoformat() if task.created_at else "",
        updated_at=task.updated_at.isoformat() if task.updated_at else "",
        logs=logs_data,
    )


@router.get("/", response_model=List[AgentTaskResponse])
async def list_tasks(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lists all historical tasks for the authenticated user."""
    stmt = (
        select(AgentTask)
        .where(AgentTask.user_id == current_user.id)
        .options(selectinload(AgentTask.logs), selectinload(AgentTask.user))
        .order_by(AgentTask.created_at.desc())
    )
    result = await db.execute(stmt)
    tasks = result.scalars().all()
    return [serialize_task(t) for t in tasks]


@router.post("/", response_model=AgentTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: CreateTaskRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Creates a new agent task thread or appends a follow-up prompt to an existing thread."""
    user_prompt = payload.prompt.strip()

    if payload.task_id:
        try:
            task_uuid = uuid.UUID(payload.task_id)
            stmt = (
                select(AgentTask)
                .where(AgentTask.id == task_uuid, AgentTask.user_id == current_user.id)
                .options(selectinload(AgentTask.logs), selectinload(AgentTask.user))
            )
            result = await db.execute(stmt)
            existing_task = result.scalar_one_or_none()

            if existing_task:
                existing_task.prompt = f"{existing_task.prompt}\n\n[Follow-up]: {user_prompt}"
                existing_task.status = "processing"
                existing_task.error_message = None
                existing_task.approval_prompt = None

                user_log = TaskExecutionLog(
                    task_id=existing_task.id,
                    node_name="user_message",
                    message=user_prompt,
                )
                db.add(user_log)
                await db.commit()
                await db.refresh(existing_task)

                # Launch in-process async background workflow (replaces Celery!)
                asyncio.create_task(
                    execute_task_workflow(
                        str(existing_task.id),
                        prompt=user_prompt,
                        model=payload.model,
                    )
                )

                return serialize_task(existing_task)
        except (ValueError, Exception) as e:
            logger.warning(f"Error appending follow-up to task {payload.task_id}: {e}")

    # Generate title from first line of prompt
    first_line = user_prompt.split("\n")[0].strip()
    generated_title = first_line[:80].strip() or "Untitled Chat"

    new_task = AgentTask(
        user_id=current_user.id,
        title=generated_title,
        prompt=user_prompt,
        status="pending",
    )
    db.add(new_task)
    await db.commit()
    await db.refresh(new_task)

    user_log = TaskExecutionLog(
        task_id=new_task.id,
        node_name="user_message",
        message=user_prompt,
    )
    db.add(user_log)
    await db.commit()

    # Re-fetch with relationships
    stmt = (
        select(AgentTask)
        .where(AgentTask.id == new_task.id)
        .options(selectinload(AgentTask.logs), selectinload(AgentTask.user))
    )
    fresh_task = (await db.execute(stmt)).scalar_one()

    # Launch in-process async background workflow
    asyncio.create_task(
        execute_task_workflow(
            str(fresh_task.id),
            prompt=user_prompt,
            model=payload.model,
        )
    )

    return serialize_task(fresh_task)


@router.get("/{task_id}/", response_model=AgentTaskResponse)
async def get_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves a single task and its execution logs."""
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid task ID format.")

    stmt = (
        select(AgentTask)
        .where(AgentTask.id == task_uuid, AgentTask.user_id == current_user.id)
        .options(selectinload(AgentTask.logs), selectinload(AgentTask.user))
    )
    task = (await db.execute(stmt)).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")

    return serialize_task(task)


@router.patch("/{task_id}/", response_model=AgentTaskResponse)
async def partial_update_task(
    task_id: str,
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Updates task fields (supports updating title or status directly)."""
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid task ID format.")

    stmt = (
        select(AgentTask)
        .where(AgentTask.id == task_uuid, AgentTask.user_id == current_user.id)
        .options(selectinload(AgentTask.logs), selectinload(AgentTask.user))
    )
    task = (await db.execute(stmt)).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")

    if "title" in payload:
        clean_title = str(payload["title"]).strip()
        if clean_title:
            task.title = clean_title[:255]

    await db.commit()
    await db.refresh(task)
    return serialize_task(task)


@router.patch("/{task_id}/rename/", response_model=AgentTaskResponse)
@router.post("/{task_id}/rename/", response_model=AgentTaskResponse)
async def rename_task(
    task_id: str,
    payload: RenameTaskRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Renames a chat task session."""
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid task ID format.")

    stmt = (
        select(AgentTask)
        .where(AgentTask.id == task_uuid, AgentTask.user_id == current_user.id)
        .options(selectinload(AgentTask.logs), selectinload(AgentTask.user))
    )
    task = (await db.execute(stmt)).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")

    clean_title = payload.title.strip()
    if not clean_title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Chat title cannot be empty.")

    task.title = clean_title[:255]
    await db.commit()
    await db.refresh(task)
    return serialize_task(task)


@router.delete("/{task_id}/")
async def delete_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently deletes a chat task session and its logs."""
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid task ID format.")

    stmt = select(AgentTask).where(AgentTask.id == task_uuid, AgentTask.user_id == current_user.id)
    task = (await db.execute(stmt)).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")

    await db.delete(task)
    await db.commit()
    return {"detail": "Chat session deleted successfully", "task_id": task_id}


@router.post("/{task_id}/approve/")
async def approve_task(
    task_id: str,
    payload: ApproveTaskRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Human-in-the-Loop decision endpoint to confirm or reject sensitive actions."""
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid task ID format.")

    stmt = (
        select(AgentTask)
        .where(AgentTask.id == task_uuid, AgentTask.user_id == current_user.id)
        .options(selectinload(AgentTask.logs), selectinload(AgentTask.user))
    )
    task = (await db.execute(stmt)).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")

    if task.status != "awaiting_approval":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Task is not awaiting approval (current status: {task.status})",
        )

    # Launch in-process async background workflow with decision
    asyncio.create_task(
        execute_task_workflow(str(task.id), human_approved=payload.approved)
    )

    msg = "Action approved. Execution resumed." if payload.approved else "Action rejected by user."
    return {"detail": msg, "task": serialize_task(task)}
