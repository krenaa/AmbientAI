import logging
from typing import List, Optional
import psycopg
from langchain_core.documents import Document
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_postgres import PGVector
from app.config import get_settings

logger = logging.getLogger("ambientdesk.vector_store")
settings = get_settings()

COLLECTION_NAME = "ambientdesk_knowledge"


def get_embeddings() -> GoogleGenerativeAIEmbeddings:
    """Uses Google's gemini-embedding-001 model."""
    if not settings.GOOGLE_API_KEY:
        raise ValueError("GOOGLE_API_KEY is required for generating vector embeddings.")
    return GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=settings.GOOGLE_API_KEY,
    )


def init_db_extension():
    """Explicitly initializes the pgvector extension on the database."""
    conn_info = f"dbname={settings.POSTGRES_DB} user={settings.POSTGRES_USER} password={settings.POSTGRES_PASSWORD} host={settings.POSTGRES_HOST} port={settings.POSTGRES_PORT}"
    with psycopg.connect(conn_info, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")


def get_vector_store() -> PGVector:
    """Instantiates the pgvector vector store backed by Postgres."""
    init_db_extension()
    embeddings = get_embeddings()
    # PGVector from langchain-postgres accepts standard SQLAlchemy-style connection URL
    connection_url = f"postgresql+psycopg://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
    
    return PGVector(
        embeddings=embeddings,
        collection_name=COLLECTION_NAME,
        connection=connection_url,
        use_jsonb=True,
    )


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