import logging
from typing import Any, List, Optional
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from app.config import get_settings

logger = logging.getLogger("ambientdesk.llm")
settings = get_settings()

# Curated list of verified active Groq models with tool/function calling
GROQ_FALLBACK_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "llama-3.1-70b-versatile",
    "gemma2-9b-it",
    "mixtral-8x7b-32768",
    "deepseek-r1-distill-llama-70b",
    "llama3-70b-8192",
    "llama3-8b-8192",
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


def get_candidate_models(temperature: float = 0.2, preferred_model: Optional[str] = None) -> List[BaseChatModel]:
    """Generates an ordered list of LLM instances across available Groq models."""
    candidates: List[BaseChatModel] = []
    preferred_clean = preferred_model.strip() if preferred_model and preferred_model != "auto" else None
    groq_keys = _extract_keys(settings.GROQ_API_KEY, settings.GROQ_API_KEYS)

    # 1. Preferred model if explicitly requested by user
    if preferred_clean and groq_keys:
        for k in groq_keys:
            try:
                candidates.append(
                    ChatGroq(
                        model=preferred_clean,
                        api_key=k,
                        temperature=temperature,
                        max_retries=1,
                        request_timeout=30.0,
                    )
                )
            except Exception as e:
                logger.debug(f"Failed to load preferred Groq model {preferred_clean}: {e}")

    # 2. Add all configured/fallback Groq models in prioritized order
    groq_models = [settings.GROQ_MODEL] if settings.GROQ_MODEL else []
    for model_name in GROQ_FALLBACK_MODELS:
        if model_name not in groq_models:
            groq_models.append(model_name)

    for api_key in groq_keys:
        for model_name in groq_models:
            if preferred_clean and model_name == preferred_clean:
                continue
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

    # 3. Optional OpenAI Fallback (if Groq keys not configured or depleted)
    if not candidates and settings.OPENAI_API_KEY:
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


async def invoke_resiliently(
    messages: List[Any],
    temperature: float = 0.2,
    tools: Optional[List[Any]] = None,
    structured_schema: Optional[Any] = None,
    preferred_model: Optional[str] = None,
) -> Any:
    """Invokes LLMs across providers sequentially with automatic failover on 429 quota, 404, or rate limits."""
    raw_candidates = get_candidate_models(temperature, preferred_model=preferred_model)

    if not raw_candidates:
        raise ValueError(
            "No LLM provider keys configured. Please set GROQ_API_KEY, GOOGLE_API_KEY, or OPENAI_API_KEY in .env"
        )

    last_error: Optional[Exception] = None

    for candidate in raw_candidates:
        model_name = getattr(candidate, "model_name", getattr(candidate, "model", str(candidate)))
        try:
            if structured_schema:
                bound = candidate.with_structured_output(structured_schema)
            elif tools:
                bound = candidate.bind_tools(tools)
            else:
                bound = candidate

            logger.info(f"Invoking model '{model_name}'...")
            result = await bound.ainvoke(messages)
            logger.info(f"Model '{model_name}' succeeded.")
            return result
        except Exception as e:
            logger.warning(
                f"Model '{model_name}' failed with error: {e}. Cascading to next available fallback model..."
            )
            last_error = e
            continue

    if last_error:
        raise last_error
    raise RuntimeError("All LLM model candidates exhausted without response.")


def get_resilient_llm(
    temperature: float = 0.2,
    tools: Optional[List[Any]] = None,
    structured_schema: Optional[Any] = None,
    preferred_model: Optional[str] = None,
) -> Any:
    """Builds a multi-model, multi-provider resilient LLM chain with automatic cascading fallbacks."""
    raw_candidates = get_candidate_models(temperature, preferred_model=preferred_model)

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
        return primary.with_fallbacks(fallbacks)
    return primary