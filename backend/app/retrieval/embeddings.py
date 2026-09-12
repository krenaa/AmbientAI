import hashlib
import logging
from typing import List
import numpy as np
from langchain_core.embeddings import Embeddings
from langchain_google_genai import GoogleGenerativeAIEmbeddings

from app.core.config import get_settings

logger = logging.getLogger("ambientai.retrieval.embeddings")
settings = get_settings()


class FallbackEmbeddings(Embeddings):
    """Deterministic hash-based embedding fallback when external API is unreachable."""

    def __init__(self, dim: int = 768):
        self.dim = dim

    def _embed(self, text: str) -> List[float]:
        # Generate deterministic pseudorandom vector seeded by text hash
        seed = int(hashlib.md5(text.encode("utf-8")).hexdigest()[:8], 16)
        rng = np.random.default_rng(seed)
        vec = rng.standard_normal(self.dim)
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec.tolist()

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [self._embed(t) for t in texts]

    def embed_query(self, text: str) -> List[float]:
        return self._embed(text)


def get_embedding_model() -> Embeddings:
    """Returns Google Generative AI embeddings (768-dim) or fallback."""
    if settings.GOOGLE_API_KEY:
        try:
            return GoogleGenerativeAIEmbeddings(
                model="models/gemini-embedding-001",
                google_api_key=settings.GOOGLE_API_KEY,
                output_dimensionality=768,
            )
        except Exception as e:
            logger.warning(f"Failed to initialize Google embeddings: {e}. Using fallback.")

    return FallbackEmbeddings(dim=768)
