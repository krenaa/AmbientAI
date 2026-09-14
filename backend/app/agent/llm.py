import logging
from typing import Any, List, Optional
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq

from app.core.config import get_settings

logger = logging.getLogger("ambientai.agent.llm")
settings = get_settings()


GROQ_FALLBACK_MODELS = [
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "qwen/qwen3.6-27b",
]


def _extract_keys(primary_key: Optional[str], multi_keys: Optional[str] = None) -> list:
    keys = []
    if primary_key:
        keys.append(primary_key)
    if multi_keys:
        for k in multi_keys.split(","):
            cleaned = k.strip()
            if cleaned and cleaned not in keys:
                keys.append(cleaned)
    return keys


def get_llm(model_id: Optional[str] = None, temperature: float = 0.2) -> BaseChatModel:
    """Returns the requested model dynamically with resilient secondary fallbacks."""
    fallbacks = []

    # Map legacy/unavailable models to verified active models for this environment
    effective_model_id = model_id
    if effective_model_id:
        lowered = effective_model_id.lower()
        if "llama" in lowered or "mixtral" in lowered or "gemma" in lowered:
            effective_model_id = "openai/gpt-oss-20b"
        elif "gemini" in lowered and "lite" not in lowered:
            effective_model_id = "gemini-2.5-flash-lite"

    # Prepare Gemini fallback if available
    gemini_llm = None
    if settings.GOOGLE_API_KEY:
        try:
            gemini_model_name = (
                effective_model_id
                if (effective_model_id and "gemini" in effective_model_id.lower())
                else settings.GOOGLE_MODEL
            )
            # Ensure safe model name with quota
            if "lite" not in gemini_model_name.lower():
                gemini_model_name = "gemini-2.5-flash-lite"

            gemini_llm = ChatGoogleGenerativeAI(
                model=gemini_model_name,
                google_api_key=settings.GOOGLE_API_KEY,
                temperature=temperature,
                max_retries=1,
            )
        except Exception as e:
            logger.warning(f"Failed to initialize Gemini: {e}")

    # If user explicitly requested a Gemini model
    if effective_model_id and "gemini" in effective_model_id.lower() and gemini_llm:
        if settings.GROQ_API_KEY:
            try:
                groq_fb = ChatGroq(
                    model=settings.GROQ_MODEL,
                    groq_api_key=settings.GROQ_API_KEY,
                    temperature=temperature,
                    max_retries=1,
                )
                return gemini_llm.with_fallbacks([groq_fb])
            except Exception:
                pass
        return gemini_llm

    # Primary: Groq model
    if settings.GROQ_API_KEY:
        target_groq_model = (
            effective_model_id
            if (effective_model_id and effective_model_id != "auto" and "gemini" not in effective_model_id.lower())
            else settings.GROQ_MODEL
        )
        try:
            primary_groq = ChatGroq(
                model=target_groq_model,
                groq_api_key=settings.GROQ_API_KEY,
                temperature=temperature,
                max_retries=1,
            )

            # Add fallbacks: Gemini + secondary active Groq model
            if gemini_llm:
                fallbacks.append(gemini_llm)
            if target_groq_model != "openai/gpt-oss-120b":
                try:
                    fallback_groq = ChatGroq(
                        model="openai/gpt-oss-120b",
                        groq_api_key=settings.GROQ_API_KEY,
                        temperature=temperature,
                        max_retries=1,
                    )
                    fallbacks.append(fallback_groq)
                except Exception:
                    pass

            if fallbacks:
                return primary_groq.with_fallbacks(fallbacks)
            return primary_groq
        except Exception as e:
            logger.error(f"Failed to initialize Groq model '{target_groq_model}': {e}")

    # Fallback to Gemini if Groq fails or is unconfigured
    if gemini_llm:
        return gemini_llm

    raise ValueError("Neither GROQ_API_KEY nor GOOGLE_API_KEY is configured or operational.")