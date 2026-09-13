import logging
import uuid
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user_optional, get_db
from app.models.conversation import Conversation
from app.models.document import DocumentChunk
from app.agent.vector_store import (
    ingest_pdf,
    get_vector_store,
    extract_text_from_pdf,
    get_indexed_documents,
    delete_document_by_source,
    clear_all_documents,
)

logger = logging.getLogger("ambientdesk.api.knowledge")
router = APIRouter()


class QueryRequest(BaseModel):
    query: str
    k: int = 4
    source: Optional[str] = None


@router.post("/upload")
async def upload_knowledge_document(
    file: UploadFile = File(...),
    conversation_id: Optional[str] = Form(None),
    user=Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
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

        # Mark the conversation as having an embedded PDF
        if conversation_id:
            try:
                try:
                    conv_uuid = uuid.UUID(conversation_id)
                except ValueError:
                    conv_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, conversation_id)
                conv = await db.get(Conversation, conv_uuid)
                if conv:
                    conv.has_pdf = True
                    conv.pdf_name = filename
                    await db.commit()
            except Exception as conv_err:
                logger.warning(f"Could not update conversation PDF flag: {conv_err}")

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


@router.get("/documents")
async def list_knowledge_documents(db: AsyncSession = Depends(get_db)):
    """Returns the persistent history of all indexed documents in the vector store."""
    try:
        docs = get_indexed_documents()
        existing_filenames = {d["filename"] for d in docs}

        # Also check document_chunks table
        stmt = (
            select(
                DocumentChunk.source,
                func.count(DocumentChunk.id),
                func.max(DocumentChunk.created_at),
            )
            .group_by(DocumentChunk.source)
            .order_by(func.max(DocumentChunk.created_at).desc())
        )
        res = await db.execute(stmt)
        for row in res.all():
            source_name = row[0]
            if source_name not in existing_filenames and source_name != "manual":
                docs.append({
                    "filename": source_name,
                    "chunks_count": row[1],
                    "uploaded_at": row[2].isoformat() if row[2] else "",
                })

        return {
            "status": "success",
            "count": len(docs),
            "documents": docs,
        }
    except Exception as e:
        logger.error(f"Error listing documents: {e}", exc_info=True)
        return {
            "status": "success",
            "count": 0,
            "documents": [],
        }


@router.delete("/documents/{filename:path}")
async def delete_knowledge_document(filename: str):
    """Deletes a specific document from the knowledge base by filename."""
    try:
        deleted = delete_document_by_source(filename)
        return {
            "status": "success",
            "message": f"Successfully deleted '{filename}' ({deleted} chunks removed).",
            "deleted_chunks": deleted,
        }
    except Exception as e:
        logger.error(f"Error deleting document '{filename}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")


@router.delete("/documents")
async def clear_knowledge_documents():
    """Clears all indexed documents from the vector store."""
    try:
        deleted = clear_all_documents()
        return {
            "status": "success",
            "message": f"Successfully cleared all knowledge documents ({deleted} chunks removed).",
            "deleted_chunks": deleted,
        }
    except Exception as e:
        logger.error(f"Error clearing knowledge documents: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to clear documents: {str(e)}")


@router.post("/query")
async def query_knowledge_base(payload: QueryRequest):
    """Test queries the pgvector knowledge base directly."""
    if not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    try:
        vector_store = get_vector_store()
        filter_dict = {"source": payload.source} if payload.source else None
        
        if filter_dict:
            results = vector_store.similarity_search_with_score(
                payload.query, k=payload.k, filter=filter_dict
            )
        else:
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

