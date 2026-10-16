from functools import lru_cache

from pinecone import Pinecone, ServerlessSpec

from app.config import settings


@lru_cache()
def get_pinecone():
    if not settings.pinecone_api_key:
        raise ValueError("Pinecone API key must be set in the environment variables.")
    return Pinecone(api_key=settings.pinecone_api_key)


@lru_cache()
def get_embedding_model():
    provider = settings.embedding_provider.lower().strip()

    if provider == "gemini":
        if not settings.gemini_api_key:
            raise ValueError(
                "GEMINI_API_KEY must be set in .env to use Gemini embeddings."
            )
        from langchain_google_genai import GoogleGenerativeAIEmbeddings

        return GoogleGenerativeAIEmbeddings(
            model=settings.gemini_embed_model,
            google_api_key=settings.gemini_api_key,
        )

    # Default provider: "huggingface" (Free, local embeddings)
    try:
        from langchain_huggingface import HuggingFaceEmbeddings

        return HuggingFaceEmbeddings(
            model_name=settings.huggingface_model_name,
        )
    except Exception as exc:
        # Graceful fallback to Gemini embeddings if GEMINI_API_KEY is available
        if settings.gemini_api_key:
            from langchain_google_genai import GoogleGenerativeAIEmbeddings

            return GoogleGenerativeAIEmbeddings(
                model=settings.gemini_embed_model,
                google_api_key=settings.gemini_api_key,
            )
        raise RuntimeError(
            f"Failed to load HuggingFace embeddings ({exc}). Set GEMINI_API_KEY or install sentence-transformers."
        )


def get_embedding_dimension():
    if settings.pinecone_dimension:
        return settings.pinecone_dimension
    if settings.embedding_provider.lower() == "gemini":
        return 768
    return 384


def ensure_index():
    pc = get_pinecone()
    dimension = get_embedding_dimension()
    if not pc.has_index(settings.pinecone_index):
        pc.create_index(
            name=settings.pinecone_index,
            dimension=dimension,
            metric='cosine',
            spec=ServerlessSpec(cloud='aws', region='us-east-1'),
        )
    return pc.Index(settings.pinecone_index)


def embed(texts: list[str]) -> list[list[float]]:
    model = get_embedding_model()
    return model.embed_documents(texts)


def search_kb(query: str, top_k: int = 5):
    index = ensure_index()
    model = get_embedding_model()
    vector = model.embed_query(query)
    result = index.query(vector=vector, top_k=top_k, include_metadata=True)
    return [
        {
            'page': m.metadata.get('page'),
            'text': m.metadata.get('text', ''),
            'score': round(m.score, 3),
            'source': 'Gale Encyclopedia (2002)',
        }
        for m in result.matches
        if m.score >= 0.30
    ]