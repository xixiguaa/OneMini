from typing import Any

from app.config import Settings, get_settings
from app.services.chunking import chunk_text
from app.services.llm import build_rag_messages, chat_completion, stream_chat_completion
from app.services.secrets_store import resolve_model_api_key
from app.services.milvus_store import (
    delete_document,
    insert_chunks,
    list_documents,
    new_doc_id,
    search_similar,
)


async def ingest_text(
    text: str,
    source: str,
    *,
    doc_id: str | None = None,
    settings: Settings | None = None,
) -> dict[str, Any]:
    settings = settings or get_settings()
    doc_id = doc_id or new_doc_id()
    chunks = chunk_text(text, settings.chunk_size, settings.chunk_overlap)
    count = insert_chunks(doc_id, source, chunks, settings)
    return {"doc_id": doc_id, "source": source, "chunks": count}


async def rag_answer(
    question: str,
    *,
    history: list[dict[str, str]] | None = None,
    top_k: int | None = None,
    model: str | None = None,
    provider: str | None = None,
    system_extra: str | None = None,
    model_config_id: str | None = None,
    user_id: str = "default",
    base_url: str | None = None,
    settings: Settings | None = None,
) -> dict[str, Any]:
    settings = settings or get_settings()
    api_key = resolve_model_api_key(user_id, model_config_id, settings=settings)
    contexts = search_similar(question, top_k=top_k, settings=settings)
    messages = build_rag_messages(question, contexts, history, system_extra=system_extra)
    answer = await chat_completion(
        messages,
        model=model,
        provider=provider,
        api_key=api_key,
        base_url=base_url,
        settings=settings,
    )
    return {"answer": answer, "contexts": contexts}


async def rag_answer_stream(
    question: str,
    *,
    history: list[dict[str, str]] | None = None,
    top_k: int | None = None,
    model: str | None = None,
    provider: str | None = None,
    system_extra: str | None = None,
    model_config_id: str | None = None,
    user_id: str = "default",
    base_url: str | None = None,
    settings: Settings | None = None,
):
    settings = settings or get_settings()
    api_key = resolve_model_api_key(user_id, model_config_id, settings=settings)
    contexts = search_similar(question, top_k=top_k, settings=settings)
    messages = build_rag_messages(question, contexts, history, system_extra=system_extra)

    async def gen():
        async for delta in stream_chat_completion(
            messages,
            model=model,
            provider=provider,
            api_key=api_key,
            base_url=base_url,
            settings=settings,
        ):
            yield delta

    return contexts, gen()


def remove_document(doc_id: str, settings: Settings | None = None) -> None:
    delete_document(doc_id, settings)


def get_documents(settings: Settings | None = None) -> list[dict[str, Any]]:
    return list_documents(settings)
