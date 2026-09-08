import logging
import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.models.task import AgentTask
from app.websocket_manager import manager

logger = logging.getLogger("ambientdesk.api.websockets")
router = APIRouter()


@router.websocket("/ws/tasks/{task_id}/")
@router.websocket("/ws/tasks/{task_id}")
@router.websocket("/api/ws/tasks/{task_id}/")
@router.websocket("/api/ws/tasks/{task_id}")
async def task_websocket_endpoint(websocket: WebSocket, task_id: str):
    """Real-time bidirectional WebSocket endpoint for task execution streaming."""
    await manager.connect(task_id, websocket)
    try:
        # Send current task state immediately on connection so client is never out-of-sync
        try:
            task_uuid = uuid.UUID(task_id)
            async with AsyncSessionLocal() as session:
                stmt = select(AgentTask).where(AgentTask.id == task_uuid).options(selectinload(AgentTask.logs))
                task = (await session.execute(stmt)).scalar_one_or_none()
                if task:
                    await websocket.send_json({
                        "type": "task_update",
                        "data": {
                            "task_id": str(task.id),
                            "status": task.status,
                            "output": task.output,
                            "triage_category": task.triage_category,
                            "approval_prompt": task.approval_prompt,
                            "error_message": task.error_message,
                            "execution_time_ms": task.execution_time_ms,
                        },
                    })
        except Exception as e:
            logger.debug(f"Could not send initial state for task {task_id}: {e}")

        while True:
            # Keep socket open and receive heartbeat/messages from frontend
            data = await websocket.receive_text()
            logger.debug(f"Received WebSocket data from task {task_id}: {data}")
    except WebSocketDisconnect:
        manager.disconnect(task_id, websocket)
    except Exception as e:
        logger.warning(f"WebSocket error on task {task_id}: {e}")
        manager.disconnect(task_id, websocket)
