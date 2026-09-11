import logging
from typing import Any, List, Optional
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from app.config import get_settings

logger = logging.getLogger("ambientdesk.llm")
settings = get_settings()

# Curated list of high-performance Groq models with function calling & chat capabilities
GROQ_FALLBACK_MODELS = [
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
    "llama3-70b-8192",
    "deepseek-r1-distill-llama-70b",
    "gemma2-9b-it",
    "mixtral-8x7b-32768",
]

# Curated list of Google Gemini models
GEMINI_FALLBACK_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.1-pro-preview",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
]


def _extract_keys(single_key: Optional[str], multi_keys: Optional[str]) -> List[str]:
    """Helper to extract a unique, non-empty list of API keys."""
    keys: List[str] = []
    if single_key and single_key.strip():
        keys.append(single_key.strip())
    if multi_keys:
        for k in multi_keys.replace(";", ",").split(","):
            k_clean = k.strip()
            if k_clean and k_clean not in keys:
                keys.append(k_clean)
    return keys


def get_candidate_models(temperature: float = 0.2) -> List[BaseChatModel]:
    """Generates an ordered list of LLM instances across all available providers and models."""
    candidates: List[BaseChatModel] = []

    # 1. Groq Candidates
    groq_keys = _extract_keys(settings.GROQ_API_KEY, settings.GROQ_API_KEYS)
    groq_models = [settings.GROQ_MODEL] if settings.GROQ_MODEL else []
    for model_name in GROQ_FALLBACK_MODELS:
        if model_name not in groq_models:
            groq_models.append(model_name)

    for api_key in groq_keys:
        for model_name in groq_models:
            try:
                llm = ChatGroq(
                    model=model_name,
                    api_key=api_key,
                    temperature=temperature,
                    max_retries=1,
                    request_timeout=30.0,
                )
                candidates.append(llm)
            except Exception as e:
                logger.debug(f"Could not initialize ChatGroq({model_name}): {e}")

    # 2. Google Gemini Candidates
    google_keys = _extract_keys(settings.GOOGLE_API_KEY, settings.GOOGLE_API_KEYS)
    google_models = [settings.GOOGLE_MODEL] if settings.GOOGLE_MODEL else []
    for model_name in GEMINI_FALLBACK_MODELS:
        if model_name not in google_models:
            google_models.append(model_name)

    for api_key in google_keys:
        for model_name in google_models:
            try:
                llm = ChatGoogleGenerativeAI(
                    model=model_name,
                    google_api_key=api_key,
                    temperature=temperature,
                    max_retries=1,
                    request_timeout=30.0,
                )
                candidates.append(llm)
            except Exception as e:
                logger.debug(f"Could not initialize ChatGoogleGenerativeAI({model_name}): {e}")

    # 3. Optional OpenAI Candidates
    if settings.OPENAI_API_KEY:
        try:
            from langchain_openai import ChatOpenAI
            openai_models = [settings.OPENAI_MODEL, "gpt-4o-mini", "gpt-4o"]
            seen_openai = set()
            for model_name in openai_models:
                if model_name and model_name not in seen_openai:
                    seen_openai.add(model_name)
                    llm = ChatOpenAI(
                        model=model_name,
                        api_key=settings.OPENAI_API_KEY,
                        temperature=temperature,
                        max_retries=1,
                    )
                    candidates.append(llm)
        except ImportError:
            logger.debug("langchain_openai not installed; skipping OpenAI fallback.")
        except Exception as e:
            logger.debug(f"Could not initialize ChatOpenAI: {e}")

    return candidates


def get_resilient_llm(
    temperature: float = 0.2,
    tools: Optional[List[Any]] = None,
    structured_schema: Optional[Any] = None,
) -> Any:
    """Builds a multi-model, multi-provider resilient LLM chain with automatic cascading fallbacks.

    If any model fails (due to 404, 429 rate limit, 503 overload, or context limit),
    the execution seamlessly cascades down the chain of alternate models and keys.
    """
    raw_candidates = get_candidate_models(temperature)

    if not raw_candidates:
        raise ValueError(
            "No LLM provider keys configured. Please set GROQ_API_KEY, GOOGLE_API_KEY, or OPENAI_API_KEY in .env"
        )

    bound_candidates: List[Any] = []
    for candidate in raw_candidates:
        try:
            if structured_schema:
                bound = candidate.with_structured_output(structured_schema)
            elif tools:
                bound = candidate.bind_tools(tools)
            else:
                bound = candidate
            bound_candidates.append(bound)
        except Exception as e:
            logger.warning(
                f"Could not bind tools/schema to model {getattr(candidate, 'model_name', candidate)}: {e}"
            )

    if not bound_candidates:
        bound_candidates = raw_candidates

    primary = bound_candidates[0]
    fallbacks = bound_candidates[1:]

    if fallbacks:
        logger.info(
            f"Initialized Resilient LLM with {len(bound_candidates)} fallback models across configured providers."
        )
        return primary.with_fallbacks(fallbacks)
    return primary