from datetime import datetime, timezone
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.auth import router as auth_router
from app.core.config import get_settings
from app.db.session import init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ambientai.core")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.APP_NAME} in [{settings.ENVIRONMENT}] mode...")
    try:
        await init_db()
    except Exception as e:
        logger.error(f"Error initializing database during startup: {e}")
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
    app.include_router(auth_router, prefix="/auth", tags=["Authentication"])

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
