import os

import certifi
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# --- AUTOMATIC SSL FIX FOR CONDA/PYTHON ENVIRONMENTS ---
ssl_cert = os.environ.get("SSL_CERT_FILE")

if not ssl_cert or not os.path.exists(ssl_cert):
    os.environ["SSL_CERT_FILE"] = certifi.where()
# --------------------------------------------------------

load_dotenv()


class Settings(BaseSettings):
    # Google Gemini (Free tier available via Google AI Studio)
    gemini_api_key: str = ""
    gemini_chat_model: str = "gemini-3.5-flash-lite"
    gemini_vision_model: str = "gemini-3.5-flash-lite"
    gemini_embed_model: str = "models/text-embedding-004"

    # Embedding Configuration: "huggingface" (free local) or "gemini" (free API)
    embedding_provider: str = "huggingface"
    huggingface_model_name: str = "sentence-transformers/all-MiniLM-L6-v2"

    # Pinecone
    pinecone_api_key: str = ""
    pinecone_index: str = "medical-agent-demo"
    pinecone_dimension: int = 384  # 384 for all-MiniLM-L6-v2, 768 for text-embedding-004

    # Tavily Web Search
    tavily_api_key: str = ""

    # API security
    api_token: str = ""
    allowed_origins: str = "http://localhost:8000,http://127.0.0.1:8000"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )


settings = Settings()