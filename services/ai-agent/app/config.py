from functools import lru_cache
from pathlib import Path
from typing import List, Optional
import urllib.parse
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
ENV_PATH = ROOT_DIR / ".env"


class Settings(BaseSettings):
    # App Config
    APP_NAME: str = "ambientdesk-ai-agent"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    PORT: int = 8001
    HOST: str = "0.0.0.0"

    # Internal Security (Django to FastAPI auth)
    AI_AGENT_INTERNAL_TOKEN: str = "ambientdesk-internal-secret-token"

    # LLM API Keys & Models
    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    GOOGLE_API_KEY: Optional[str] = None
    GOOGLE_MODEL: str = "gemini-2.0-flash"
    TAVILY_API_KEY: Optional[str] = None

    # Database
    POSTGRES_DB: str = "ambientdesk_db"
    POSTGRES_USER: str = "ambientdesk_user"
    POSTGRES_PASSWORD: str = "ambientdesk_secret"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432

    @property
    def postgres_connection_string(self) -> str:
        # Safely URL-encode credentials
        user = urllib.parse.quote_plus(self.POSTGRES_USER)
        password = urllib.parse.quote_plus(self.POSTGRES_PASSWORD)
        return f"postgresql+psycopg://{user}:{password}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # LangSmith Observability
    LANGSMITH_TRACING: bool = False
    LANGSMITH_ENDPOINT: str = "https://api.smith.langchain.com"
    LANGSMITH_API_KEY: Optional[str] = None
    LANGSMITH_PROJECT: str = "ambientdesk-prod"

    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

    model_config = SettingsConfigDict(
        env_file=str(ENV_PATH),
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()