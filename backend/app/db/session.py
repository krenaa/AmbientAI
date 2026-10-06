import logging
from typing import AsyncGenerator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

from app.core.config import get_settings

logger = logging.getLogger("ambientai.db")
settings = get_settings()

engine = create_async_engine(
    settings.async_database_url,
    echo=False,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    connect_args={
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
    },
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


_db_initialized = False


async def init_db() -> None:
    """Ensure pgvector extension is enabled and initialize tables."""
    global _db_initialized
    if _db_initialized:
        return
    try:
        import app.models  # noqa: F401 - register models with Base.metadata
        async with engine.begin() as conn:
            try:
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
                logger.info("pgvector extension verified.")
            except Exception as e:
                logger.warning(f"Note on pgvector extension creation: {e}")
            await conn.run_sync(Base.metadata.create_all)
            # Ensure schema migrations for existing tables
            try:
                await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255) DEFAULT '';"))
                await conn.execute(text("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS has_pdf BOOLEAN DEFAULT FALSE;"))
                await conn.execute(text("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pdf_name VARCHAR(255);"))
                await conn.execute(text("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS user_id VARCHAR(255);"))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_document_chunks_user_id ON document_chunks(user_id);"))

                # Convert conversations.user_id from UUID to VARCHAR if needed
                await conn.execute(text("""
                    DO $$ 
                    BEGIN 
                        IF EXISTS (
                            SELECT 1 FROM information_schema.table_constraints 
                            WHERE constraint_name = 'conversations_user_id_fkey'
                        ) THEN 
                            ALTER TABLE conversations DROP CONSTRAINT conversations_user_id_fkey;
                        END IF;
                        IF EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name = 'conversations' AND column_name = 'user_id' AND data_type = 'uuid'
                        ) THEN 
                            ALTER TABLE conversations ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::text;
                        END IF;
                    END $$;
                """))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_conversations_user_id ON conversations(user_id);"))
            except Exception as e:
                logger.debug(f"Column migration check note: {e}")
            _db_initialized = True
            logger.info("Database schemas and tables verified.")
    except Exception as e:
        logger.warning(f"Database background verification note: {e}")
