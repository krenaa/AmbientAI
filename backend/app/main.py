import asyncio
from datetime import datetime, timezone
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.auth import router as auth_router
from app.api.conversations import router as conversations_router
from app.api.knowledge import router as knowledge_router
from app.api.models import router as models_router
from app.api.retrieval import router as retrieval_router
from app.core.config import get_settings
from app.db.session import init_db
from app.ws.router import router as ws_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ambientai.core")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.APP_NAME} in [{settings.ENVIRONMENT}] mode...")
    # Initialize DB in background so HTTP endpoints are immediately available without blocking on remote DB cold-starts
    asyncio.create_task(init_db())
    yield
    logger.info(f"Shutting down {settings.APP_NAME}...")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        description="AmbientAI minimal core: FastAPI, LangGraph HITL, pgvector RAG, and WebSockets.",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # API Routers
    app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
    app.include_router(auth_router, prefix="/api/api/auth", tags=["Authentication"])
    app.include_router(auth_router, prefix="/auth", tags=["Authentication"])
    app.include_router(conversations_router, prefix="/api/conversations", tags=["Conversations"])
    app.include_router(conversations_router, prefix="/api/api/conversations", tags=["Conversations"])
    app.include_router(conversations_router, prefix="/conversations", tags=["Conversations"])
    app.include_router(retrieval_router, prefix="/api/retrieval", tags=["Retrieval"])
    app.include_router(retrieval_router, prefix="/api/api/retrieval", tags=["Retrieval"])
    app.include_router(retrieval_router, prefix="/retrieval", tags=["Retrieval"])
    app.include_router(models_router, prefix="/api/models", tags=["Models"])
    app.include_router(models_router, prefix="/models", tags=["Models"])
    app.include_router(knowledge_router, prefix="/api/knowledge", tags=["Knowledge"])
    app.include_router(knowledge_router, prefix="/knowledge", tags=["Knowledge"])
    app.include_router(ws_router, tags=["WebSockets"])

    @app.get("/", tags=["General"])
    async def root():
        return {
            "name": settings.APP_NAME,
            "status": "online",
            "environment": settings.ENVIRONMENT,
            "version": "1.0.0",
        }

    @app.get("/health", tags=["Health"])
    @app.get("/api/health", tags=["Health"])
    async def health_check():
        return JSONResponse(
            {
                "status": "healthy",
                "service": "ambientai-core",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )

    return app


app = create_app()
