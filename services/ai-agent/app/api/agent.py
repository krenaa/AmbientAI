import logging
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Header, HTTPException, status, Depends
from pydantic import BaseModel, Field, field_validator
from langchain_core.messages import HumanMessage
from langgraph.types import Command

from app.config import Settings, get_settings
from app.agent.graph import agent_graph

logger = logging.getLogger("ambientdesk.api.agent")
router = APIRouter(prefix="/tasks", tags=["Agent Execution"])


def extract_text_content(content: Any) -> str:
    """Safely extracts plain string from LangChain message content, which can be a str or list of dicts/blocks."""
    if not content:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        text_parts = []
        for block in content:
            if isinstance(block, str):
                text_parts.append(block)
            elif isinstance(block, dict):
                if "text" in block:
                    text_parts.append(str(block["text"]))
                elif "content" in block:
                    text_parts.append(str(block["content"]))
                else:
                    text_parts.append(str(block))
            else:
                text_parts.append(str(block))
        return "\n".join(text_parts).strip()
    return str(content)


class RunTaskRequest(BaseModel):
    task_id: str = Field(description="Unique task tracking identifier")
    user_id: str = Field(description="User ID initiating the request")
    prompt: str = Field(min_length=1, max_length=10000, description="Task prompt")


class ResumeTaskRequest(BaseModel):
    task_id: str = Field(description="Task ID currently waiting for human approval")
    approved: bool = Field(description="True to approve execution, False to reject")


class TaskResponse(BaseModel):
    task_id: str
    status: str  # "completed", "waiting_for_approval", "error"
    triage_category: Optional[str] = None
    output: Optional[str] = None
    approval_prompt: Optional[Dict[str, Any]] = None

    @field_validator("output", mode="before")
    @classmethod
    def normalize_output(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        return extract_text_content(v)


async def verify_internal_token(
    x_internal_token: Optional[str] = Header(None),
    settings: Settings = Depends(get_settings),
):
    if not x_internal_token or x_internal_token != settings.AI_AGENT_INTERNAL_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Internal-Token authentication header.",
        )


@router.post(
    "/run",
    response_model=TaskResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(verify_internal_token)],
    summary="Execute Agent Task (with HITL interrupt support)",
)
async def run_task(payload: RunTaskRequest) -> TaskResponse:
    try:
        config = {"configurable": {"thread_id": payload.task_id}}
        initial_state = {
            "messages": [HumanMessage(content=payload.prompt)],
            "task_id": payload.task_id,
            "user_id": payload.user_id,
            "triage": None,
            "requires_approval": False,
            "approval_status": None,
            "approval_payload": None,
            "final_output": None,
            "error": None,
        }

        # Stream/Invoke through graph
        result = await agent_graph.ainvoke(initial_state, config=config)
        state_snapshot = agent_graph.get_state(config)

        # Check if the execution was paused at an interrupt
        if state_snapshot.next:
            interrupt_value = None
            if state_snapshot.tasks and state_snapshot.tasks[0].interrupts:
                interrupt_value = state_snapshot.tasks[0].interrupts[0].value

            return TaskResponse(
                task_id=payload.task_id,
                status="awaiting_approval",
                triage_category="sensitive_action",
                output="Task paused: Human approval is required before continuing.",
                approval_prompt=interrupt_value if isinstance(interrupt_value, dict) else {"message": str(interrupt_value)},
            )

        output_text = ""
        for m in reversed(result.get("messages", [])):
            text = extract_text_content(getattr(m, "content", m))
            if text:
                output_text = text
                break

        triage_cat = result["triage"].category if result.get("triage") else None

        return TaskResponse(
            task_id=payload.task_id,
            status="completed",
            triage_category=triage_cat,
            output=output_text,
        )
    except Exception as e:
        logger.error(f"Execution error for task {payload.task_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Agent workflow error: {str(e)}",
        )


@router.post(
    "/resume",
    response_model=TaskResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(verify_internal_token)],
    summary="Resume a Paused Task with User Approval",
)
async def resume_task(payload: ResumeTaskRequest) -> TaskResponse:
    try:
        config = {"configurable": {"thread_id": payload.task_id}}
        
        # Resume graph with approval input via Command(resume=...)
        result = await agent_graph.ainvoke(
            Command(resume={"approved": payload.approved}),
            config=config,
        )

        output_text = ""
        for m in reversed(result.get("messages", [])):
            text = extract_text_content(getattr(m, "content", m))
            if text:
                output_text = text
                break

        triage_cat = result["triage"].category if result.get("triage") else None

        return TaskResponse(
            task_id=payload.task_id,
            status="completed",
            triage_category=triage_cat,
            output=output_text,
        )
    except Exception as e:
        logger.error(f"Resume error for task {payload.task_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Resume workflow error: {str(e)}",
        )