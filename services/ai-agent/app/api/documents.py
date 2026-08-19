import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from app.api.agent import verify_internal_token
from app.agent.vector_store import ingest_documents

logger = logging.getLogger("ambientdesk.api.documents")
router = APIRouter(prefix="/documents", tags=["Knowledge Base & RAG"])


class IngestDocumentsRequest(BaseModel):
    texts: List[str] = Field(
        min_length=1, description="List of document text passages to embed and store"
    )
    metadatas: Optional[List[Dict[str, Any]]] = Field(
        default=None, description="Metadata tags for each document"
    )


class IngestResponse(BaseModel):
    status: str
    count: int


@router.post(
    "/ingest",
    response_model=IngestResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_internal_token)],
    summary="Ingest documents into pgvector store",
)
async def ingest_docs_endpoint(payload: IngestDocumentsRequest) -> IngestResponse:
    try:
        await ingest_documents(payload.texts, payload.metadatas)
        return IngestResponse(status="success", count=len(payload.texts))
    except Exception as e:
        logger.error(f"Document ingestion failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to ingest documents: {str(e)}",
        )