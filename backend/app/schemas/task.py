from datetime import datetime
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, Field


class TaskExecutionLogResponse(BaseModel):
    id: str
    node_name: str
    message: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    timestamp: str

    class Config:
        from_attributes = True


class AgentTaskResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    title: Optional[str] = None
    prompt: str
    status: str
    triage_category: Optional[str] = None
    output: Optional[str] = None
    approval_prompt: Optional[str] = None
    error_message: Optional[str] = None
    execution_time_ms: float = 0.0
    total_tokens: int = 0
    created_at: str
    updated_at: str
    logs: List[TaskExecutionLogResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True


class CreateTaskRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=10000)
    task_id: Optional[str] = None


class RenameTaskRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)


class ApproveTaskRequest(BaseModel):
    approved: bool
