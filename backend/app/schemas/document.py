from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class DocumentIngestRequest(BaseModel):
    content: str
    source: Optional[str] = "manual"


class DocumentSearchRequest(BaseModel):
    query: str
    limit: Optional[int] = 4


class DocumentChunkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    content: str
    source: str
    created_at: datetime
