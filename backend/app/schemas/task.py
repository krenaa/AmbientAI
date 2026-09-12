from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class TaskCreate(BaseModel):
    conversation_id: UUID
    prompt: str


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    conversation_id: UUID
    status: str
    checkpoint_state: Optional[Dict[str, Any]] = None
    created_at: datetime


class TaskApprovalRequest(BaseModel):
    decision: str  # approved or rejected
