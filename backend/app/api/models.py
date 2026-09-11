import logging
from typing import List, Optional
from fastapi import APIRouter
from pydantic import BaseModel
from app.config import get_settings
from app.agent.llm import _extract_keys, GROQ_FALLBACK_MODELS, GEMINI_FALLBACK_MODELS

logger = logging.getLogger("ambientdesk.api.models")
router = APIRouter()
settings = get_settings()


class ModelOption(BaseModel):
    id: str
    name: str
    provider: str
    is_free: bool = True
    is_available: bool = True
    badge: str = "Free Tier"


class ModelsResponse(BaseModel):
    selected_default: str
    models: List[ModelOption]


@router.get("/", response_model=ModelsResponse)
@router.get("", response_model=ModelsResponse)
async def list_available_models():
    """Dynamically checks configured provider keys and returns only active, available models."""
    groq_keys = _extract_keys(settings.GROQ_API_KEY, settings.GROQ_API_KEYS)
    google_keys = _extract_keys(settings.GOOGLE_API_KEY, settings.GOOGLE_API_KEYS)
    has_openai = bool(settings.OPENAI_API_KEY and settings.OPENAI_API_KEY.strip())

    models: List[ModelOption] = [
        ModelOption(
            id="auto",
            name="⚡ Auto Fallback (Resilient Multi-Model)",
            provider="Auto",
            is_free=True,
            badge="Auto Failover",
        )
    ]

    # Groq active models
    if groq_keys:
        groq_friendly_names = {
            "llama-3.3-70b-versatile": "Groq: LLaMA 3.3 70B",
            "gemma2-9b-it": "Groq: Gemma 2 9B (Ultra Fast)",
            "mixtral-8x7b-32768": "Groq: Mixtral 8x7B",
            "deepseek-r1-distill-llama-70b": "Groq: DeepSeek R1 Distill 70B",
        }
        for m in GROQ_FALLBACK_MODELS:
            name = groq_friendly_names.get(m, f"Groq: {m}")
            models.append(
                ModelOption(
                    id=m,
                    name=name,
                    provider="Groq",
                    is_free=True,
                    badge="Free Tier",
                )
            )

    # Google Gemini active models
    if google_keys:
        gemini_friendly_names = {
            "gemini-2.5-flash": "Gemini 2.5 Flash",
            "gemini-2.0-flash": "Gemini 2.0 Flash",
            "gemini-1.5-flash": "Gemini 1.5 Flash",
            "gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite",
        }
        for m in GEMINI_FALLBACK_MODELS:
            name = gemini_friendly_names.get(m, f"Gemini: {m}")
            models.append(
                ModelOption(
                    id=m,
                    name=name,
                    provider="Google",
                    is_free=True,
                    badge="Free Tier",
                )
            )

    # Optional OpenAI
    if has_openai:
        models.append(
            ModelOption(
                id="gpt-4o-mini",
                name="OpenAI: GPT-4o Mini",
                provider="OpenAI",
                is_free=False,
                badge="API Key",
            )
        )

    default_choice = "auto"
    return ModelsResponse(selected_default=default_choice, models=models)
