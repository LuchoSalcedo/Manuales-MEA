"""Configuración del backend."""

import os
from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings

# Cargar .env desde la raíz del proyecto
env_path = Path(__file__).parent.parent.parent / ".env"


class Settings(BaseSettings):
    """Configuración de la aplicación."""

    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_key: str

    # OpenAI
    openai_api_key: str

    # Anthropic
    anthropic_api_key: str

    # Backend
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    debug: bool = True

    # CORS
    frontend_url: str = "http://localhost:3000"
    allowed_origins: str = "http://localhost:3000"

    # RAG Settings
    rag_top_k: int = 20  # Número de chunks a recuperar (aumentado para mejor cobertura)
    rag_similarity_threshold: float = 0.55  # Umbral mínimo de similitud (bajado para mejor cobertura)

    class Config:
        env_file = str(env_path)
        env_file_encoding = "utf-8"
        extra = "ignore"  # Ignorar variables no definidas


@lru_cache()
def get_settings() -> Settings:
    """Obtiene la configuración cacheada."""
    return Settings()
