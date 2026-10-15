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
    # OpenAI
    openai_api_key: str = ""
    openai_chat_model: str = "gpt-4.1-mini"
    openai_embed_model: str = "text-embedding-3-small"
    openai_vision_model: str = "gpt-4.1-mini"

    # Google Gemini
    gemini_api_key: str = ""
    gemini_chat_model: str = "gemini-2.5-flash"
    gemini_vision_model: str = "gemini-2.5-flash"
    gemini_embed_model: str = "gemini-embedding-001"

    # Pinecone
    pinecone_api_key: str = ""
    pinecone_index: str = "medical-agent-demo"

    # Tavily
    tavily_api_key: str = ""

    # API security
    api_token: str = ""
    allowed_origins: str = (
        "http://localhost:8000,http://127.0.0.1:8000"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )


settings = Settings()