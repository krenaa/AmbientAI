import logging
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status
from pydantic import BaseModel
from app.api.auth import get_current_user_optional
from app.agent.vector_store import (
    ingest_pdf,
    get_vector_store,
    extract_text_from_pdf,
)

logger = logging.getLogger("ambientdesk.api.knowledge")
router = APIRouter()


class QueryRequest(BaseModel):
    query: str
    k: int = 4


@router.post("/upload")
async def upload_knowledge_document(
    file: UploadFile = File(...),
    user=Depends(get_current_user_optional),
):
    """Uploads a PDF or text document, chunks it, and ingests into pgvector RAG."""
    filename = file.filename or "uploaded_document.pdf"
    if not filename.lower().endswith((".pdf", ".txt", ".md", ".json")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format. Please upload a PDF (.pdf) or text (.txt) document.",
        )

    try:
        content = await file.read()
        if not content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty.",
            )

        user_id = str(user.id) if user else "public"
        result = await ingest_pdf(filename=filename, file_bytes=content, user_id=user_id)

        return {
            "status": "success",
            "message": f"Successfully indexed '{filename}' into pgvector knowledge base.",
            "data": result,
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error processing document upload: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to index document into vector store: {str(e)}",
        )


@router.post("/query")
async def query_knowledge_base(payload: QueryRequest):
    """Test queries the pgvector knowledge base directly."""
    if not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    try:
        vector_store = get_vector_store()
        results = vector_store.similarity_search_with_score(payload.query, k=payload.k)

        formatted = []
        for doc, score in results:
            formatted.append({
                "content": doc.page_content,
                "metadata": doc.metadata,
                "score": float(score) if score is not None else None,
            })

        return {
            "status": "success",
            "query": payload.query,
            "results_count": len(formatted),
            "results": formatted,
        }
    except Exception as e:
        logger.error(f"Error querying knowledge base: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving knowledge base documents: {str(e)}",
        )


@router.get("/status")
async def get_knowledge_status():
    """Returns vector store status and health."""
    try:
        vector_store = get_vector_store()
        return {
            "status": "online",
            "collection": "ambientdesk_knowledge",
            "engine": "PostgreSQL pgvector",
            "driver": "asyncpg / psycopg",
        }
    except Exception as e:
        return {
            "status": "degraded",
            "error": str(e),
        }
