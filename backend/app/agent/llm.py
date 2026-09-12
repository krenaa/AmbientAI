import logging
from typing import Any
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq

from app.core.config import get_settings

logger = logging.getLogger("ambientai.agent.llm")
settings = get_settings()


def get_llm(temperature: float = 0.2) -> BaseChatModel:
    """Returns primary Groq LLM wired with Gemini fallback."""
    fallbacks = []

    # 1. Fallback: Google Gemini
    gemini_llm = None
    if settings.GOOGLE_API_KEY:
        try:
            gemini_llm = ChatGoogleGenerativeAI(
                model=settings.GOOGLE_MODEL,
                google_api_key=settings.GOOGLE_API_KEY,
                temperature=temperature,
            )
            fallbacks.append(gemini_llm)
        except Exception as e:
            logger.warning(f"Failed to initialize Gemini fallback: {e}")

    # 2. Primary: Groq
    if settings.GROQ_API_KEY:
        try:
            groq_llm = ChatGroq(
                model=settings.GROQ_MODEL,
                groq_api_key=settings.GROQ_API_KEY,
                temperature=temperature,
            )
            if fallbacks:
                return groq_llm.with_fallbacks(fallbacks)
            return groq_llm
        except Exception as e:
            logger.error(f"Failed to initialize primary Groq model: {e}")

    # If Groq unavailable but Gemini exists
    if gemini_llm:
        return gemini_llm

    raise ValueError("Neither GROQ_API_KEY nor GOOGLE_API_KEY is configured or operational.")