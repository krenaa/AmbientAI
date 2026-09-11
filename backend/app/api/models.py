import asyncio
import logging
from typing import List, Optional
from fastapi import APIRouter
import httpx
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
    status: str = "Active"
    badge: str = "Free Tier"


class ModelsResponse(BaseModel):
    selected_default: str
    models: List[ModelOption]


async def probe_groq_models(api_key: str) -> List[str]:
    """Queries Groq's live /openai/v1/models API endpoint to discover active models."""
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if resp.status_code == 200:
                data = resp.json()
                active_ids = [m["id"] for m in data.get("data", []) if m.get("active", True)]
                return active_ids
    except Exception as e:
        logger.debug(f"Groq live model probe notice: {e}")
    return GROQ_FALLBACK_MODELS


@router.get("/", response_model=ModelsResponse)
@router.get("", response_model=ModelsResponse)
async def list_available_models():
    """Dynamically checks configured provider keys, queries live model availability, and selects the best default."""
    groq_keys = _extract_keys(settings.GROQ_API_KEY, settings.GROQ_API_KEYS)
    google_keys = _extract_keys(settings.GOOGLE_API_KEY, settings.GOOGLE_API_KEYS)
    has_openai = bool(settings.OPENAI_API_KEY and settings.OPENAI_API_KEY.strip())

    models: List[ModelOption] = []
    
    # 1. Groq Models (High-speed, 14,400 free requests/day)
    live_groq_ids = []
    if groq_keys:
        live_groq_ids = await probe_groq_models(groq_keys[0])

    groq_friendly_names = {
        "llama-3.3-70b-versatile": "LLaMA 3.3 70B",
        "gemma2-9b-it": "Gemma 2 9B (Ultra Fast)",
        "mixtral-8x7b-32768": "Mixtral 8x7B",
        "deepseek-r1-distill-llama-70b": "DeepSeek R1 Distill 70B",
        "llama3-70b-8192": "LLaMA 3 70B",
    }

    if groq_keys:
        for m in GROQ_FALLBACK_MODELS:
            if not live_groq_ids or m in live_groq_ids:
                friendly = groq_friendly_names.get(m, m)
                models.append(
                    ModelOption(
                        id=m,
                        name=friendly,
                        provider="Groq Active",
                        is_free=True,
                        is_available=True,
                        status="🟢 Active",
                        badge="Groq Ultra-Fast",
                    )
                )

    # 2. Google Gemini Models
    gemini_friendly_names = {
        "gemini-2.0-flash": "Gemini 2.0 Flash",
        "gemini-1.5-flash": "Gemini 1.5 Flash",
        "gemini-2.5-flash": "Gemini 2.5 Flash",
        "gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite",
    }

    if google_keys:
        for m in ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-flash"]:
            friendly = gemini_friendly_names.get(m, m)
            models.append(
                ModelOption(
                    id=m,
                    name=friendly,
                    provider="Google",
                    is_free=True,
                    is_available=True,
                    status="🟢 Active",
                    badge="Free Tier",
                )
            )

    # 3. Auto Fallback (Resilient Multi-Provider)
    models.insert(
        0,
        ModelOption(
            id="auto",
            name="⚡ Auto Fallback (Groq + Gemini)",
            provider="Auto Resilient",
            is_free=True,
            is_available=True,
            status="🟢 Active",
            badge="Failover Shield",
        )
    )

    # Pick the most reliable default (Groq LLaMA 3.3 if available, else auto)
    default_choice = "llama-3.3-70b-versatile" if groq_keys else "auto"

    return ModelsResponse(selected_default=default_choice, models=models)
