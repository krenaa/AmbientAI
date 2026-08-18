import logging
from typing import Optional
from fastapi import APIRouter, Header, HTTPException, status, Depends
from pydantic import BaseModel, Field
from langchain_core.messages import HumanMessage

from app.config import Settings, get_settings
from app.agent.graph import agent_graph

logger = logging.getLogger("ambientdesk.api.agent")
router = APIRouter(prefix="/tasks", tags=["Agent Execution"])


class RunTaskRequest(BaseModel):
    task_id: str = Field(description="Unique task tracking identifier from Django")
    user_id: str = Field(description="User ID initiating the request")
    prompt: str = Field(min_length=1, max_length=10000, description="Task prompt")


class RunTaskResponse(BaseModel):
    task_id: str
    status: str
    triage_category: Optional[str]
    output: str


async def verify_internal_token(
    x_internal_token: Optional[str] = Header(None),
    settings: Settings = Depends(get_settings),
):
    """OWASP Security: Validate shared internal secret for Django-to-FastAPI calls."""
    if not x_internal_token or x_internal_token != settings.AI_AGENT_INTERNAL_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Internal-Token authentication header.",
        )


@router.post(
    "/run",
    response_model=RunTaskResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(verify_internal_token)],
    summary="Execute Agent Task",
)
async def run_task(payload: RunTaskRequest) -> RunTaskResponse:
    try:
        initial_state = {
            "messages": [HumanMessage(content=payload.prompt)],
            "task_id": payload.task_id,
            "user_id": payload.user_id,
            "triage": None,
            "final_output": None,
            "error": None,
        }

        # Invoke compiled LangGraph
        final_state = await agent_graph.ainvoke(initial_state)
        last_message = final_state["messages"][-1]

        triage_cat = (
            final_state["triage"].category if final_state.get("triage") else None
        )

        return RunTaskResponse(
            task_id=payload.task_id,
            status="completed",
            triage_category=triage_cat,
            output=last_message.content,
        )
    except Exception as e:
        logger.error(f"Execution error for task {payload.task_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Agent workflow error: {str(e)}",
        )