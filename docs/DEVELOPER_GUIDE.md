# Developer Guide

This guide maps directly to the current repository code and scripts.

## What runs where

- API entrypoint: `app/main.py` (FastAPI app, routes, auth, image inspection, health endpoint)
- Agent workflow: `app/agent.py` (`retrieve → route → web_search → answer` with SQLite checkpointing)
- Retrieval/index layer: `app/knowledge.py` (embedding provider selection, Pinecone index creation/query)
- Ingestion script: `inject.py` (PDF chunking, embedding, and vector upserts)
- Frontend: `templates/index.html` + `static/app.js` + `static/style.css`

## Local development workflow

1. Install dependencies:
   - `pip install -r requirements.txt`
2. Configure `.env` with:
   - `GEMINI_API_KEY`
   - `PINECONE_API_KEY`
   - Optional: `TAVILY_API_KEY`, `API_TOKEN`, `EMBEDDING_PROVIDER`, `PINECONE_DIMENSION`
3. Build/update vector knowledge index:
   - `python inject.py --pdf data/Medical_book.pdf`
   - If `--pdf` is omitted, the script defaults to `data/Medical_book.pdf`
4. Start the app:
   - `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`

## API auth and conversation state

- If `API_TOKEN` is empty, routes are open.
- If `API_TOKEN` is set, protected routes require `Authorization` with either:
  - the raw token value, or
  - the same token with a bearer prefix.
- `/api/chat` accepts optional `X-Conversation-ID` to continue the same LangGraph checkpoint thread in `medical_memory.db`.

## Script and runtime notes

- Ingestion batches vectors in groups of 50 (`inject.py`) for memory-friendly upserts.
- Retrieval filters low-score matches (`score >= 0.30`) in `app/knowledge.py`.
- Web fallback in `app/agent.py` is triggered by weak retrieval or “current/latest/guideline” style questions.
- Browser voice input/output is handled client-side first (`static/app.js`) with backend fallbacks in `/api/transcribe` and `/api/speak`.
