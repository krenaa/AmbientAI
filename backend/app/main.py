from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.auth import router as auth_router
from app.api.tasks import router as tasks_router
from app.api.websockets import router as ws_router
from app.api.knowledge import router as knowledge_router
from app.config import get_settings
from app.core.database import Base, engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ambientdesk.backend")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.APP_NAME} on {settings.HOST}:{settings.PORT} in [{settings.ENVIRONMENT}] mode...")
    
    # Initialize database tables if not already created
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database schemas and tables verified successfully.")
    except Exception as e:
        logger.warning(f"Database schema verification notice: {e}")

    yield

    logger.info(f"Shutting down {settings.APP_NAME}...")
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="AmbientDesk AI Unified Backend",
        description="Unified FastAPI + LangGraph architecture with native async WebSockets, pgvector RAG, and HITL governance.",
        version="1.0.0",
        lifespan=lifespan,
    )

    # CORS configuration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount API routes with both /api prefix and root fallback
    app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
    app.include_router(auth_router, prefix="/auth", tags=["Authentication"])
    app.include_router(tasks_router, prefix="/api/tasks", tags=["Tasks"])
    app.include_router(tasks_router, prefix="/tasks", tags=["Tasks"])
    app.include_router(knowledge_router, prefix="/api/knowledge", tags=["Knowledge Base"])
    app.include_router(knowledge_router, prefix="/knowledge", tags=["Knowledge Base"])
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
        return JSONResponse({"status": "healthy", "service": "ambientdesk-unified-backend"})

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
