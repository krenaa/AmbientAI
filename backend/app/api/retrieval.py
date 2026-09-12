import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.retrieval.service import ingest_documents, similarity_search
from app.schemas.document import (
    DocumentChunkOut,
    DocumentIngestRequest,
    DocumentSearchRequest,
)

logger = logging.getLogger("ambientai.api.retrieval")
router = APIRouter()


@router.post(
    "/ingest",
    status_code=status.HTTP_201_CREATED,
    summary="Ingest raw text into pgvector document chunks",
)
async def ingest(
    payload: DocumentIngestRequest,
    db: AsyncSession = Depends(get_db),
):
    if not payload.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Content cannot be empty",
        )

    count = await ingest_documents(
        content=payload.content,
        source=payload.source or "manual",
        db=db,
    )
    return {
        "success": True,
        "chunks_ingested": count,
        "source": payload.source or "manual",
    }


@router.post(
    "/search",
    response_model=List[DocumentChunkOut],
    summary="Semantic similarity search against pgvector chunks",
)
async def search(
    payload: DocumentSearchRequest,
    db: AsyncSession = Depends(get_db),
):
    if not payload.query.strip():
        return []

    chunks = await similarity_search(
        query=payload.query,
        db=db,
        limit=payload.limit or 4,
    )
    return [DocumentChunkOut.model_validate(c) for c in chunks]
