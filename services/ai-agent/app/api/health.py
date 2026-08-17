from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from app.config import Settings, get_settings

router = APIRouter(tags=["Health"])


class HealthResponse(BaseModel):
    status: str
    environment: str
    providers: dict[str, bool]
    langsmith_tracing: bool


@router.get(
    "/healthz",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Service Health Check",
)
async def health_check(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(
        status="healthy",
        environment=settings.ENVIRONMENT,
        providers={
            "groq": bool(settings.GROQ_API_KEY),
            "google_gemini": bool(settings.GOOGLE_API_KEY),
            "tavily": bool(settings.TAVILY_API_KEY),
        },
        langsmith_tracing=settings.LANGSMITH_TRACING
        and bool(settings.LANGSMITH_API_KEY),
    )   