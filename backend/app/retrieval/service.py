import logging
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import DocumentChunk
from app.retrieval.embeddings import get_embedding_model

logger = logging.getLogger("ambientai.retrieval.service")


def chunk_text(text: str, chunk_size: int = 500, chunk_overlap: int = 50) -> List[str]:
    """Basic character-window chunking with overlap (no complex parent-child hierarchy)."""
    clean_text = text.strip()
    if not clean_text:
        return []

    if len(clean_text) <= chunk_size:
        return [clean_text]

    chunks = []
    start = 0
    while start < len(clean_text):
        end = start + chunk_size
        chunk = clean_text[start:end]
        if chunk.strip():
            chunks.append(chunk.strip())
        start += chunk_size - chunk_overlap

    return chunks


async def ingest_documents(
    content: str,
    source: str,
    db: AsyncSession,
    user_id: Optional[str] = None,
    chunk_size: int = 500,
) -> int:
    """Chunks text, computes embeddings, and stores them in pgvector scoped by user_id."""
    chunks = chunk_text(content, chunk_size=chunk_size)
    if not chunks:
        return 0

    embedder = get_embedding_model()
    try:
        embeddings = embedder.embed_documents(chunks)
    except Exception as e:
        logger.warning(f"Batch embedding failed: {e}. Falling back to single queries.")
        embeddings = [embedder.embed_query(c) for c in chunks]

    for text_chunk, vector in zip(chunks, embeddings):
        chunk_record = DocumentChunk(
            content=text_chunk,
            embedding=vector,
            source=source,
            user_id=user_id,
        )
        db.add(chunk_record)

    await db.commit()
    logger.info(f"Ingested {len(chunks)} document chunks into pgvector for user '{user_id}'.")
    return len(chunks)


async def similarity_search(
    query: str,
    db: AsyncSession,
    user_id: Optional[str] = None,
    limit: int = 4,
) -> List[DocumentChunk]:
    """Finds top-K most similar document chunks using cosine distance scoped by user_id."""
    if not query.strip():
        return []

    embedder = get_embedding_model()
    query_vector = embedder.embed_query(query)

    stmt = select(DocumentChunk)
    if user_id:
        stmt = stmt.where((DocumentChunk.user_id == user_id) | (DocumentChunk.user_id.is_(None)))

    stmt = stmt.order_by(DocumentChunk.embedding.cosine_distance(query_vector)).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())
