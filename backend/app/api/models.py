import asyncio
import logging
from typing import Dict, List, Optional
from fastapi import APIRouter
import httpx
from pydantic import BaseModel
from app.config import get_settings
from app.agent.llm import _extract_keys, GROQ_FALLBACK_MODELS

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


# Friendly display mappings for known Groq models
GROQ_NAME_MAP: Dict[str, str] = {
    "llama-3.3-70b-versatile": "LLaMA 3.3 70B (Versatile)",
    "llama-3.1-8b-instant": "LLaMA 3.1 8B (Instant)",
    "llama-3.1-70b-versatile": "LLaMA 3.1 70B (Versatile)",
    "gemma2-9b-it": "Gemma 2 9B (Ultra Fast)",
    "mixtral-8x7b-32768": "Mixtral 8x7B (32k Context)",
    "deepseek-r1-distill-llama-70b": "DeepSeek R1 Distill 70B",
    "qwen-2.5-32b": "Qwen 2.5 32B",
    "qwen-2.5-coder-32b": "Qwen 2.5 Coder 32B",
}

# Non-chat models or decommissioned model substrings to exclude
EXCLUDED_MODEL_SUBSTRINGS = ["whisper", "guard", "tts", "embedding", "audio", "vision-preview", "8192", "allam", "playai"]


def format_groq_name(model_id: str) -> str:
    if model_id in GROQ_NAME_MAP:
        return GROQ_NAME_MAP[model_id]
    # Format fallback: capitalize hyphenated names
    clean = model_id.replace("-", " ").replace("_", " ").title()
    return clean


async def fetch_live_groq_models(api_key: str) -> List[dict]:
    """Queries Groq's live API to discover all currently active text/chat models."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if resp.status_code == 200:
                data = resp.json()
                raw_models = data.get("data", [])
                active_models = []
                for m in raw_models:
                    model_id = m.get("id", "")
                    is_active = m.get("active", True)
                    # Check if model is active and not an excluded modality
                    if is_active and not any(sub in model_id.lower() for sub in EXCLUDED_MODEL_SUBSTRINGS):
                        active_models.append(m)
                return active_models
    except Exception as e:
        logger.warning(f"Groq live model discovery request failed: {e}")
    return []


@router.get("/", response_model=ModelsResponse)
@router.get("", response_model=ModelsResponse)
async def list_available_models():
    """Real-time Groq model discovery endpoint. Returns only currently active Groq models."""
    groq_keys = _extract_keys(settings.GROQ_API_KEY, settings.GROQ_API_KEYS)
    models: List[ModelOption] = []

    live_groq_items: List[dict] = []
    if groq_keys:
        live_groq_items = await fetch_live_groq_models(groq_keys[0])

    discovered_ids = [m["id"] for m in live_groq_items]

    # Prioritize top recommended models first
    priority_order = [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "llama-3.1-70b-versatile",
        "gemma2-9b-it",
        "mixtral-8x7b-32768",
        "deepseek-r1-distill-llama-70b",
    ]

    ordered_model_ids: List[str] = []
    if discovered_ids:
        # Sort active discovered models by priority
        for pid in priority_order:
            if pid in discovered_ids and pid not in ordered_model_ids:
                ordered_model_ids.append(pid)
        for did in discovered_ids:
            if did not in ordered_model_ids:
                ordered_model_ids.append(did)
    else:
        # Fallback to verified known Groq models if live probe failed
        ordered_model_ids = [m for m in GROQ_FALLBACK_MODELS]

    # Build model options for each active Groq model
    for model_id in ordered_model_ids:
        friendly_name = format_groq_name(model_id)
        models.append(
            ModelOption(
                id=model_id,
                name=friendly_name,
                provider="Groq Active",
                is_free=True,
                is_available=True,
                status="🟢 Active",
                badge="14,400 req/day",
            )
        )

    # Auto Fallback option across active Groq models
    models.insert(
        0,
        ModelOption(
            id="auto",
            name="⚡ Auto Fallback (Groq Fast Cascade)",
            provider="Groq High-Speed",
            is_free=True,
            is_available=True,
            status="🟢 Active",
            badge="Auto Shield",
        ),
    )

    # Set best default
    default_choice = "llama-3.3-70b-versatile" if "llama-3.3-70b-versatile" in ordered_model_ids else (ordered_model_ids[0] if ordered_model_ids else "auto")

    return ModelsResponse(selected_default=default_choice, models=models)

