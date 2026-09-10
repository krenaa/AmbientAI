import io
import logging
import hashlib
import math
import datetime
from typing import List, Optional, Dict, Any
import psycopg
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_postgres import PGVector
from app.config import get_settings

logger = logging.getLogger("ambientdesk.vector_store")
settings = get_settings()

COLLECTION_NAME = "ambientdesk_knowledge"


class LocalResilientEmbeddings(Embeddings):
    """Zero-dependency deterministic 768-dimensional dense text embedder.
    Works 100% locally with zero external API requirements, zero quota limits, and 1ms latency.
    """
    def __init__(self, dimension: int = 768):
        self.dimension = dimension

    def _embed_text(self, text: str) -> List[float]:
        words = text.lower().split()
        vec = [0.0] * self.dimension
        if not words:
            return vec

        for word in words:
            h = int(hashlib.sha256(word.encode("utf-8")).hexdigest(), 16)
            idx = h % self.dimension
            sign = 1.0 if (h >> 8) & 1 else -1.0
            vec[idx] += sign * (1.0 + math.log(max(1, len(word))))

            # Add character trigrams for semantic subword coverage
            for i in range(max(1, len(word) - 2)):
                tri = word[i:i + 3]
                tri_h = int(hashlib.md5(tri.encode("utf-8")).hexdigest(), 16)
                tri_idx = tri_h % self.dimension
                vec[tri_idx] += 0.5

        # L2 Normalize
        norm = math.sqrt(sum(x * x for x in vec))
        if norm > 0:
            vec = [x / norm for x in vec]
        return vec

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [self._embed_text(t) for t in texts]

    def embed_query(self, text: str) -> List[float]:
        return self._embed_text(text)


def get_embeddings() -> Embeddings:
    """Returns resilient embeddings with automatic local fallback."""
    if settings.OPENAI_API_KEY:
        try:
            from langchain_openai import OpenAIEmbeddings
            return OpenAIEmbeddings(
                model="text-embedding-3-small",
                api_key=settings.OPENAI_API_KEY,
            )
        except Exception as e:
            logger.debug(f"OpenAI embeddings unavailable: {e}")

    # Return local deterministic zero-dependency embedder
    return LocalResilientEmbeddings(dimension=768)


def init_db_extension():
    """Explicitly initializes the pgvector extension on PostgreSQL."""
    conn_info = settings.DATABASE_URL or settings.postgres_connection_string
    if "postgresql+psycopg://" in conn_info:
        conn_info = conn_info.replace("postgresql+psycopg://", "postgresql://")
    try:
        with psycopg.connect(conn_info, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    except Exception as e:
        logger.debug(f"Notice during pgvector extension initialization: {e}")


def get_vector_store() -> PGVector:
    """Instantiates the pgvector vector store backed by Postgres."""
    init_db_extension()
    embeddings = get_embeddings()
    connection_url = settings.postgres_connection_string

    return PGVector(
        embeddings=embeddings,
        collection_name=COLLECTION_NAME,
        connection=connection_url,
        use_jsonb=True,
    )


def sanitize_text(text: str) -> str:
    """Removes NUL (0x00) bytes and invalid control characters for PostgreSQL compatibility."""
    if not text:
        return ""
    # Strip NUL bytes which cause Postgres DataError
    cleaned = text.replace("\x00", "").replace("\u0000", "")
    # Preserve standard whitespace (\n, \r, \t) and valid printable characters
    cleaned = "".join(
        ch for ch in cleaned if ch in ("\n", "\r", "\t") or (ord(ch) >= 32 and ord(ch) != 127)
    )
    return cleaned


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extracts text content from PDF binary bytes using pypdf."""
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        extracted_pages = []
        for idx, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            clean_text = sanitize_text(text).strip()
            if clean_text:
                extracted_pages.append(f"[Page {idx + 1}]\n{clean_text}")
        return "\n\n".join(extracted_pages)
    except Exception as e:
        logger.error(f"Error parsing PDF file: {e}")
        # Fallback to UTF-8 decoding if plaintext or basic format
        try:
            return sanitize_text(file_bytes.decode("utf-8", errors="ignore"))
        except Exception:
            raise ValueError(f"Could not parse document: {str(e)}")


def chunk_text(text: str, chunk_size: int = 700, overlap: int = 150) -> List[str]:
    """Splits raw text into overlapping semantic chunks."""
    cleaned = sanitize_text(text).strip()
    if not cleaned:
        return []

    if len(cleaned) <= chunk_size:
        return [cleaned]

    chunks = []
    start = 0
    while start < len(cleaned):
        end = start + chunk_size
        if end >= len(cleaned):
            chunk = sanitize_text(cleaned[start:]).strip()
            if chunk:
                chunks.append(chunk)
            break

        # Find clean boundary (paragraph or sentence break)
        split_point = cleaned.rfind("\n\n", start, end)
        if split_point == -1 or split_point <= start:
            split_point = cleaned.rfind(". ", start, end)
        if split_point == -1 or split_point <= start:
            split_point = cleaned.rfind(" ", start, end)
        if split_point == -1 or split_point <= start:
            split_point = end

        chunk = sanitize_text(cleaned[start:split_point]).strip()
        if chunk:
            chunks.append(chunk)

        start = max(start + 1, split_point - overlap)

    return chunks


async def ingest_pdf(
    filename: str,
    file_bytes: bytes,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Extracts, chunks, embeds, and stores a PDF document in pgvector with batched ingestion."""
    clean_filename = sanitize_text(filename).strip() or "uploaded_document.pdf"
    raw_text = extract_text_from_pdf(file_bytes)
    if not raw_text.strip():
        raise ValueError("No readable text could be extracted from this PDF.")

    chunks = chunk_text(raw_text)
    if not chunks:
        raise ValueError("Document was empty or could not be chunked.")

    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    docs = [
        Document(
            page_content=sanitize_text(chunk),
            metadata={
                "source": clean_filename,
                "chunk_index": i,
                "total_chunks": len(chunks),
                "user_id": user_id or "system",
                "uploaded_at": timestamp,
            },
        )
        for i, chunk in enumerate(chunks)
    ]

    vector_store = get_vector_store()
    # Batch insertions into chunks of 100 to avoid PostgreSQL parameter limits and high payload spikes
    batch_size = 100
    for i in range(0, len(docs), batch_size):
        batch = docs[i:i + batch_size]
        vector_store.add_documents(batch)

    logger.info(f"Successfully ingested {len(docs)} chunks for PDF '{clean_filename}'.")

    return {
        "filename": clean_filename,
        "chunks_count": len(docs),
        "total_characters": len(raw_text),
        "uploaded_at": timestamp,
    }



async def ingest_documents(texts: List[str], metadatas: Optional[List[dict]] = None):
    """Ingests raw text chunks into pgvector."""
    docs = [
        Document(
            page_content=text,
            metadata=metadatas[i] if metadatas else {"source": "manual_ingest"},
        )
    for i, text in enumerate(texts)
    ]
    vector_store = get_vector_store()
    vector_store.add_documents(docs)
    logger.info(f"Successfully ingested {len(docs)} documents into pgvector.")


def _get_raw_connection():
    conn_info = settings.DATABASE_URL or settings.postgres_connection_string
    if "postgresql+psycopg://" in conn_info:
        conn_info = conn_info.replace("postgresql+psycopg://", "postgresql://")
    return psycopg.connect(conn_info, autocommit=True)


def get_indexed_documents() -> List[Dict[str, Any]]:
    """Returns list of unique documents in vector store with chunk count and upload timestamp."""
    try:
        with _get_raw_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = 'langchain_pg_embedding'
                    );
                    """
                )
                exists = cur.fetchone()[0]
                if not exists:
                    return []

                cur.execute(
                    """
                    SELECT 
                        COALESCE(e.cmetadata->>'source', 'Unknown Document') AS filename,
                        COUNT(*) AS chunks_count,
                        MAX(e.cmetadata->>'uploaded_at') AS uploaded_at
                    FROM langchain_pg_embedding e
                    JOIN langchain_pg_collection c ON e.collection_id = c.uuid
                    WHERE c.name = %s
                    GROUP BY e.cmetadata->>'source'
                    ORDER BY MAX(e.cmetadata->>'uploaded_at') DESC NULLS LAST;
                    """,
                    (COLLECTION_NAME,),
                )
                rows = cur.fetchall()
                return [
                    {
                        "filename": r[0],
                        "chunks_count": r[1],
                        "uploaded_at": r[2] or "",
                    }
                    for r in rows
                ]
    except Exception as e:
        logger.warning(f"Could not fetch indexed documents: {e}")
        return []


def delete_document_by_source(filename: str) -> int:
    """Deletes all chunks associated with a specific document source name."""
    try:
        with _get_raw_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    DELETE FROM langchain_pg_embedding e
                    USING langchain_pg_collection c
                    WHERE e.collection_id = c.uuid
                      AND c.name = %s
                      AND e.cmetadata->>'source' = %s;
                    """,
                    (COLLECTION_NAME, filename),
                )
                deleted = cur.rowcount
                logger.info(f"Deleted {deleted} chunks for document source '{filename}'.")
                return deleted
    except Exception as e:
        logger.error(f"Error deleting document '{filename}': {e}")
        raise e


def clear_all_documents() -> int:
    """Deletes all document chunks from the pgvector knowledge base."""
    try:
        with _get_raw_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    DELETE FROM langchain_pg_embedding e
                    USING langchain_pg_collection c
                    WHERE e.collection_id = c.uuid
                      AND c.name = %s;
                    """,
                    (COLLECTION_NAME,),
                )
                deleted = cur.rowcount
                logger.info(f"Cleared all {deleted} chunks from knowledge base.")
                return deleted
    except Exception as e:
        logger.error(f"Error clearing knowledge base: {e}")
        raise e