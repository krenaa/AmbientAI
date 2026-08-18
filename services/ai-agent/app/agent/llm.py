import logging
from typing import Any, List, Optional
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from app.config import get_settings

logger = logging.getLogger("ambientdesk.llm")
settings = get_settings()


def get_primary_llm(temperature: float = 0.2) -> Optional[BaseChatModel]:
    """Returns Groq Chat Model if API key is configured."""
    if settings.GROQ_API_KEY:
        return ChatGroq(
            model="openai/gpt-oss-120b",
            api_key=settings.GROQ_API_KEY,
            temperature=temperature,
            max_retries=1,
        )
    return None


def get_fallback_llm(temperature: float = 0.2) -> Optional[BaseChatModel]:
    """Returns Google Gemini Chat Model if API key is configured."""
    if settings.GOOGLE_API_KEY:
        return ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            google_api_key=settings.GOOGLE_API_KEY,
            temperature=temperature,
            max_retries=2,
        )
    return None


def get_resilient_llm(
    temperature: float = 0.2,
    tools: Optional[List[Any]] = None,
    structured_schema: Optional[Any] = None,
) -> BaseChatModel:
    """Builds a primary LLM with automatic fallback to Gemini.

    Handles structured output or tool bindings across both providers.
    """
    primary = get_primary_llm(temperature)
    fallback = get_fallback_llm(temperature)

    if not primary and not fallback:
        raise ValueError(
            "No LLM provider keys configured. Please set GROQ_API_KEY or GOOGLE_API_KEY in .env"
        )

    # Bind tools or structured output to primary
    if primary:
        if structured_schema:
            primary = primary.with_structured_output(structured_schema)
        elif tools:
            primary = primary.bind_tools(tools)

    # Bind tools or structured output to fallback
    if fallback:
        if structured_schema:
            fallback = fallback.with_structured_output(structured_schema)
        elif tools:
            fallback = fallback.bind_tools(tools)

    # Return resilient chain with fallback
    if primary and fallback:
        return primary.with_fallbacks([fallback])
    elif primary:
        return primary
    else:
        return fallback