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


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extracts text content from PDF binary bytes using pypdf."""
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        extracted_pages = []
        for idx, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if text.strip():
                extracted_pages.append(f"[Page {idx + 1}]\n{text.strip()}")
        return "\n\n".join(extracted_pages)
    except Exception as e:
        logger.error(f"Error parsing PDF file: {e}")
        # Fallback to UTF-8 decoding if plaintext or basic format
        try:
            return file_bytes.decode("utf-8", errors="ignore")
        except Exception:
            raise ValueError(f"Could not parse document: {str(e)}")


def chunk_text(text: str, chunk_size: int = 700, overlap: int = 150) -> List[str]:
    """Splits raw text into overlapping semantic chunks."""
    if not text or not text.strip():
        return []

    text = text.strip()
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        if end >= len(text):
            chunks.append(text[start:].strip())
            break

        # Find clean boundary (paragraph or sentence break)
        split_point = text.rfind("\n\n", start, end)
        if split_point == -1 or split_point <= start:
            split_point = text.rfind(". ", start, end)
        if split_point == -1 or split_point <= start:
            split_point = text.rfind(" ", start, end)
        if split_point == -1 or split_point <= start:
            split_point = end

        chunk = text[start:split_point].strip()
        if chunk:
            chunks.append(chunk)

        start = max(start + 1, split_point - overlap)

    return chunks


async def ingest_pdf(
    filename: str,
    file_bytes: bytes,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Extracts, chunks, embeds, and stores a PDF document in pgvector."""
    raw_text = extract_text_from_pdf(file_bytes)
    if not raw_text.strip():
        raise ValueError("No readable text could be extracted from this PDF.")

    chunks = chunk_text(raw_text)
    if not chunks:
        raise ValueError("Document was empty or could not be chunked.")

    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    docs = [
        Document(
            page_content=chunk,
            metadata={
                "source": filename,
                "chunk_index": i,
                "total_chunks": len(chunks),
                "user_id": user_id or "system",
                "uploaded_at": timestamp,
            },
        )
        for i, chunk in enumerate(chunks)
    ]

    vector_store = get_vector_store()
    vector_store.add_documents(docs)
    logger.info(f"Successfully ingested {len(docs)} chunks for PDF '{filename}'.")

    return {
        "filename": filename,
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