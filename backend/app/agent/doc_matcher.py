import logging
import re
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy import select, func
from app.db.session import AsyncSessionLocal
from app.models.document import DocumentChunk
from app.agent.vector_store import get_indexed_documents, _get_raw_connection, COLLECTION_NAME

logger = logging.getLogger("ambientai.agent.doc_matcher")


def get_all_indexed_documents() -> List[Dict[str, Any]]:
    """Retrieves all indexed documents across pgvector and document_chunks tables."""
    docs = get_indexed_documents()
    existing_filenames = {d["filename"].lower(): d for d in docs}

    try:
        with _get_raw_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = 'document_chunks'
                    );
                    """
                )
                if cur.fetchone()[0]:
                    cur.execute(
                        """
                        SELECT source, COUNT(*), MAX(created_at)
                        FROM document_chunks
                        GROUP BY source;
                        """
                    )
                    rows = cur.fetchall()
                    for r in rows:
                        s_name = r[0]
                        if s_name and s_name.lower() not in existing_filenames and s_name != "manual":
                            docs.append({
                                "filename": s_name,
                                "chunks_count": r[1],
                                "uploaded_at": str(r[2]) if r[2] else "",
                            })
    except Exception as e:
        logger.debug(f"Document check note: {e}")

    return docs


def extract_potential_doc_references(query: str) -> List[str]:
    """Finds potential filenames or document references in user queries."""
    references = []

    # 1. Quoted references (e.g. "nexus_chat_1790223250795.md" or 'project.pdf')
    quoted = re.findall(r'["\']([^"\']+\.(?:pdf|md|txt|json|csv|docx))["\']', query, re.IGNORECASE)
    references.extend(quoted)

    # Quoted string that doesn't have an extension but says "document <name>"
    doc_quoted = re.findall(r'(?:document|file|doc)\s+["\']([^"\']+)["\']', query, re.IGNORECASE)
    references.extend(doc_quoted)

    # 2. Raw filename pattern (e.g. nexus_chat_1790223250795.md, MediLens.pdf)
    unquoted_files = re.findall(r'\b([\w\-.]+\.(?:pdf|md|txt|json|csv|docx))\b', query, re.IGNORECASE)
    references.extend(unquoted_files)

    # 3. Explicit keywords like "regarding the document nexus_chat"
    doc_prefix_match = re.search(r'(?:regarding|about|analyze|summarize|read|in)\s+(?:the\s+)?(?:document|file|doc)\s+([a-zA-Z0-9_\-.]+)', query, re.IGNORECASE)
    if doc_prefix_match:
        references.append(doc_prefix_match.group(1).strip())

    # Deduplicate while preserving order
    seen = set()
    cleaned = []
    for ref in references:
        clean = ref.strip(" \"'")
        if clean and clean.lower() not in seen:
            seen.add(clean.lower())
            cleaned.append(clean)
    return cleaned


def find_matching_document(query: str, available_docs: List[Dict[str, Any]]) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Checks user query against indexed documents.
    Returns (matched_doc_dict, raw_detected_reference_string).
    """
    detected_refs = extract_potential_doc_references(query)

    # 1. Direct or partial match on detected reference tokens
    for ref in detected_refs:
        ref_lower = ref.lower()
        # Exact match
        for doc in available_docs:
            d_name = doc["filename"].lower()
            if d_name == ref_lower:
                return doc, ref
        # Substring / partial match
        for doc in available_docs:
            d_name = doc["filename"].lower()
            if ref_lower in d_name or d_name in ref_lower:
                return doc, ref

    # 2. Check all available doc filenames directly against user query
    q_lower = query.lower()
    for doc in available_docs:
        d_name = doc["filename"].lower()
        # Direct filename appearance
        if d_name in q_lower:
            return doc, doc["filename"]
        # Match base name without extension (e.g. 'nexus_chat_1790223250795' or 'MediLens')
        base_name = d_name.rsplit(".", 1)[0]
        if len(base_name) >= 5 and base_name in q_lower:
            return doc, doc["filename"]

    # If user explicitly referenced a filename but it was NOT found in indexed documents
    if detected_refs:
        return None, detected_refs[0]

    return None, None


def fetch_document_content(filename: str, max_chars: int = 12000) -> Tuple[str, int]:
    """Fetches all chunks for a specific document filename.
    Returns (concatenated_content, chunk_count).
    """
    chunks: List[str] = []

    # 1. Query langchain_pg_embedding
    try:
        with _get_raw_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT e.document
                    FROM langchain_pg_embedding e
                    JOIN langchain_pg_collection c ON e.collection_id = c.uuid
                    WHERE c.name = %s
                      AND LOWER(e.cmetadata->>'source') = LOWER(%s)
                    ORDER BY (e.cmetadata->>'chunk_index')::int ASC NULLS LAST;
                    """,
                    (COLLECTION_NAME, filename),
                )
                rows = cur.fetchall()
                for r in rows:
                    if r[0] and r[0].strip():
                        chunks.append(r[0].strip())
    except Exception as e:
        logger.debug(f"pg_embedding fetch note: {e}")

    # 2. Query document_chunks table if none found in pg_embedding
    if not chunks:
        try:
            with _get_raw_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT content
                        FROM document_chunks
                        WHERE LOWER(source) = LOWER(%s)
                        ORDER BY created_at ASC;
                        """,
                        (filename,),
                    )
                    rows = cur.fetchall()
                    for r in rows:
                        if r[0] and r[0].strip():
                            chunks.append(r[0].strip())
        except Exception as e:
            logger.debug(f"document_chunks fetch note: {e}")

    total_chunks = len(chunks)
    if not chunks:
        return "", 0

    full_text = "\n\n---\n\n".join(chunks)
    if len(full_text) > max_chars:
        full_text = full_text[:max_chars] + f"\n\n[... Truncated for token safety. {total_chunks} total chunks available ...]"

    return full_text, total_chunks
