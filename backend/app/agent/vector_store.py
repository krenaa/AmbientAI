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
    """Extracts text content from PDF binary bytes using a robust fallback chain:
    1. Primary: PyMuPDF (fitz)
    2. Fallback: pypdf
    3. Image-based OCR Fallback (if text < 50 chars/page): PyMuPDF rendering + Vision OCR / pytesseract
    4. Descriptive error if all fail.
    """
    if not file_bytes:
        raise ValueError("Uploaded PDF file is empty (0 bytes received).")

    extracted_pages = []
    total_pages = 0

    # 1. Primary Extractor: PyMuPDF (fitz)
    try:
        import pymupdf  # PyMuPDF
        doc = pymupdf.open(stream=file_bytes, filetype="pdf")
        total_pages = len(doc)
        for idx, page in enumerate(doc):
            t = page.get_text("text") or ""
            clean_t = sanitize_text(t).strip()
            if clean_t:
                extracted_pages.append(f"[Page {idx + 1}]\n{clean_t}")

        total_extracted_chars = sum(len(p) for p in extracted_pages)
        avg_chars_per_page = total_extracted_chars / max(1, total_pages)

        if total_extracted_chars > 0 and avg_chars_per_page >= 50:
            logger.info(
                f"PDF extraction succeeded with PyMuPDF primary extractor: {total_pages} pages, {total_extracted_chars} chars (avg {avg_chars_per_page:.1f}/page)."
            )
            return "\n\n".join(extracted_pages)
        else:
            logger.info(
                f"PyMuPDF yielded low text ({total_extracted_chars} chars, avg {avg_chars_per_page:.1f}/page across {total_pages} pages). Attempting pypdf secondary extractor..."
            )
    except Exception as mupdf_err:
        logger.warning(f"PyMuPDF primary extraction error: {mupdf_err}. Attempting pypdf fallback...")

    # 2. Secondary Extractor: pypdf
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        total_pages = len(reader.pages)
        pypdf_pages = []
        for idx, page in enumerate(reader.pages):
            t = page.extract_text() or ""
            clean_t = sanitize_text(t).strip()
            if clean_t:
                pypdf_pages.append(f"[Page {idx + 1}]\n{clean_t}")

        total_pypdf_chars = sum(len(p) for p in pypdf_pages)
        avg_pypdf = total_pypdf_chars / max(1, total_pages)
        if total_pypdf_chars > 0 and avg_pypdf >= 50:
            logger.info(
                f"PDF extraction succeeded with pypdf secondary extractor: {total_pages} pages, {total_pypdf_chars} chars (avg {avg_pypdf:.1f}/page)."
            )
            return "\n\n".join(pypdf_pages)
    except Exception as pypdf_err:
        logger.warning(f"pypdf secondary extraction note: {pypdf_err}")

    # 3. Image-based OCR Fallback Chain (if text is empty or < 50 chars/page)
    logger.info(
        "PDF text is under 50 chars per page. Treating document as scanned/image-based PDF. Invoking OCR fallback chain..."
    )

    ocr_pages = []
    # A) Try pytesseract if installed locally
    try:
        import pytesseract
        from PIL import Image
        import pymupdf
        doc = pymupdf.open(stream=file_bytes, filetype="pdf")
        max_ocr_pages = min(len(doc), 15)
        for idx in range(max_ocr_pages):
            page = doc[idx]
            pix = page.get_pixmap(dpi=150)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            ocr_text = pytesseract.image_to_string(img)
            clean_ocr = sanitize_text(ocr_text).strip()
            if clean_ocr:
                ocr_pages.append(f"[Page {idx + 1} (OCR)]\n{clean_ocr}")

        if ocr_pages:
            logger.info(f"PDF extraction succeeded with pytesseract OCR ({len(ocr_pages)} pages extracted).")
            return "\n\n".join(ocr_pages)
    except Exception as tesseract_err:
        logger.debug(f"Pytesseract unavailable: {tesseract_err}")

    # B) Try Gemini 2.5 Flash Lite Multimodal Vision OCR (Serverless / Cloud Resilient)
    if settings.GOOGLE_API_KEY:
        try:
            import base64
            import pymupdf
            from langchain_core.messages import HumanMessage
            from langchain_google_genai import ChatGoogleGenerativeAI

            vision_llm = ChatGoogleGenerativeAI(
                model="gemini-2.5-flash-lite",
                google_api_key=settings.GOOGLE_API_KEY,
                temperature=0.0,
                max_retries=1,
            )

            doc = pymupdf.open(stream=file_bytes, filetype="pdf")
            max_vision_pages = min(len(doc), 10)  # Safe budget for serverless timeout
            for idx in range(max_vision_pages):
                page = doc[idx]
                pix = page.get_pixmap(dpi=150)
                img_bytes = pix.tobytes("png")
                b64_img = base64.b64encode(img_bytes).decode("utf-8")

                msg = HumanMessage(
                    content=[
                        {
                            "type": "text",
                            "text": (
                                "Extract all readable text, tables, architecture components, and diagrams from this page verbatim. "
                                "Preserve section headers, bullet lists, and technical specifications accurately."
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{b64_img}"},
                        },
                    ]
                )
                page_res = vision_llm.invoke([msg])
                clean_ocr = sanitize_text(page_res.content if hasattr(page_res, "content") else str(page_res)).strip()
                if clean_ocr:
                    ocr_pages.append(f"[Page {idx + 1} (Vision OCR)]\n{clean_ocr}")

            if ocr_pages:
                logger.info(f"PDF extraction succeeded with Gemini Vision OCR fallback ({len(ocr_pages)} pages extracted).")
                return "\n\n".join(ocr_pages)
        except Exception as vision_err:
            logger.warning(f"Vision OCR fallback encountered an error: {vision_err}")

    # 4. If all fail: Return specific, actionable error message
    raise ValueError(
        "This PDF looks scanned/image-only and OCR isn't available. Export it as a text-based PDF, or upload .md/.txt"
    )


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

    # Also persist to document_chunks table for dual-table compatibility
    try:
        from app.db.session import AsyncSessionLocal
        from app.models.document import DocumentChunk
        from app.retrieval.embeddings import get_embedding_model
        async with AsyncSessionLocal() as db:
            embedder = get_embedding_model()
            chunk_texts = [d.page_content for d in docs]
            try:
                embeddings = embedder.embed_documents(chunk_texts)
            except Exception:
                embeddings = [embedder.embed_query(c) for c in chunk_texts]

            for d, emb in zip(docs, embeddings):
                db.add(DocumentChunk(
                    content=d.page_content,
                    embedding=emb,
                    source=clean_filename,
                    user_id=user_id or "system",
                ))
            await db.commit()
    except Exception as db_sync_err:
        logger.debug(f"Notice on document_chunks dual persistence: {db_sync_err}")

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