"""LLM-Wiki Query：基于 wiki 结构化页检索 + LLM 回答（对话「LLM-Wiki 模式」）。"""

from __future__ import annotations

import re
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from app.config import Settings, get_settings
from app.services import llm_wiki
from app.services.llm import chat_completion, stream_chat_completion
from app.services.wiki_ingest import _resolve_wiki_llm

_TOKEN_RE = re.compile(r"[\w\u4e00-\u9fff]{2,}")

WIKI_QUERY_SYSTEM = """你是 LLM-Wiki 查询 Agent。根据下方「结构化 wiki 页面摘录」回答用户问题。

规则：
1. 优先使用摘录中的事实；资料不足时明确说明不确定，可简要结合常识并标注非 wiki 来源。
2. 使用简体中文，条理清晰。
3. 关键结论须标注依据：页面 title 或路径（如 wiki/concepts/xxx）。
4. 不要编造摘录中未出现的内容。"""


def _tokenize(text: str) -> set[str]:
    return {t.lower() for t in _TOKEN_RE.findall(text.lower())}


def _page_meta(path: Path, root: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="replace")
    node_id = path.relative_to(root).as_posix()[:-3]
    title = path.stem
    fm, body = llm_wiki._parse_wiki_frontmatter(text)
    if fm:
        m = re.search(r"^title:\s*(.+?)\s*$", fm, re.MULTILINE)
        if m:
            title = m.group(1).strip().strip('"').strip("'")
        m2 = re.search(r"^type:\s*(\S+)\s*$", fm, re.MULTILINE)
        ptype = m2.group(1) if m2 else llm_wiki._infer_wiki_type_from_path(node_id)
    else:
        ptype = llm_wiki._infer_wiki_type_from_path(node_id)
    aliases: list[str] = []
    if fm:
        m = re.search(r"^aliases:\s*\[(.*)\]\s*$", fm, re.MULTILINE)
        if m:
            aliases = [a.strip().strip("'\"") for a in m.group(1).split(",") if a.strip()]
    return {
        "id": node_id,
        "path": path.relative_to(root).as_posix(),
        "title": title,
        "type": ptype,
        "aliases": aliases,
        "body": body[:4000],
        "text_full": text[:8000],
    }


def search_wiki_pages(
    question: str,
    *,
    settings: Settings | None = None,
    top_k: int | None = None,
) -> list[dict[str, Any]]:
    settings = settings or get_settings()
    root = llm_wiki.wiki_root(settings)
    k = top_k or settings.wiki_query_top_k
    q_tokens = _tokenize(question)
    if not q_tokens:
        return []

    wiki_dir = root / "wiki"
    candidates: list[Path] = []
    if wiki_dir.is_dir():
        for path in sorted(wiki_dir.glob("index*.md")):
            if path.name == "log.md":
                continue
            candidates.append(path)
        for sub in ("sources", "concepts", "entities", "synthesis", "queries"):
            d = wiki_dir / sub
            if d.is_dir():
                candidates.extend(sorted(d.glob("*.md")))

    scored: list[tuple[float, dict[str, Any]]] = []
    seen: set[str] = set()

    for path in candidates:
        if not path.is_file() or path.name == "log.md":
            continue
        try:
            meta = _page_meta(path, root)
        except OSError:
            continue
        nid = meta["id"]
        if nid in seen:
            continue
        seen.add(nid)

        hay = " ".join([meta["title"], *meta["aliases"], meta["body"][:1500]]).lower()
        hay_tokens = _tokenize(hay)
        if not hay_tokens:
            continue
        overlap = len(q_tokens & hay_tokens)
        if overlap == 0:
            continue
        score = overlap / (len(q_tokens) ** 0.5)
        if meta["type"] == "source":
            score *= 1.05
        if nid == "wiki/index":
            score *= 0.85
        scored.append((score, meta))

    scored.sort(key=lambda x: -x[0])
    hits: list[dict[str, Any]] = []
    for score, meta in scored[:k]:
        excerpt = meta["body"].strip()[:1200]
        hits.append(
            {
                "id": meta["id"],
                "title": meta["title"],
                "type": meta["type"],
                "path": meta["path"],
                "score": round(min(score / 3.0, 1.0), 4),
                "text": excerpt or meta["title"],
            }
        )
    return hits


def build_wiki_query_messages(
    question: str,
    contexts: list[dict[str, Any]],
    history: list[dict[str, str]] | None = None,
    *,
    system_extra: str | None = None,
) -> list[dict[str, str]]:
    blocks = []
    for i, ctx in enumerate(contexts, 1):
        blocks.append(
            f"[{i}] {ctx.get('title')} ({ctx.get('id')}, {ctx.get('type')})\n{ctx.get('text', '')}"
        )
    context_block = "\n\n".join(blocks) if blocks else "（未匹配到 wiki 页面，请根据 index 说明作答或提示用户先构建知识框架）"
    user_content = f"Wiki 摘录：\n{context_block}\n\n用户问题：{question}"

    system = WIKI_QUERY_SYSTEM
    if system_extra and system_extra.strip():
        system = f"{WIKI_QUERY_SYSTEM}\n\n{system_extra.strip()}"

    messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    if history:
        for msg in history[-8:]:
            role = msg.get("role")
            content = msg.get("content")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_content})
    return messages


def _resolve_query_llm(
    settings: Settings,
    user_id: str,
    *,
    model_config_id: str | None = None,
    model: str | None = None,
    provider: str | None = None,
    base_url: str | None = None,
) -> tuple[str | None, str, str, str | None]:
    if model_config_id:
        from app.services.secrets_store import resolve_model_api_key

        api_key = resolve_model_api_key(user_id, model_config_id, settings=settings)
        return (
            api_key,
            provider or settings.wiki_ingest_provider,
            model or settings.wiki_ingest_model,
            (base_url or settings.wiki_ingest_base_url or "").strip() or None,
        )
    api_key, prov, mdl, burl = _resolve_wiki_llm(settings, user_id)
    return (
        api_key,
        provider or prov,
        model or mdl,
        base_url or burl,
    )


async def wiki_answer(
    question: str,
    *,
    history: list[dict[str, str]] | None = None,
    top_k: int | None = None,
    user_id: str = "default",
    model: str | None = None,
    provider: str | None = None,
    base_url: str | None = None,
    system_extra: str | None = None,
    model_config_id: str | None = None,
    settings: Settings | None = None,
) -> dict[str, Any]:
    settings = settings or get_settings()
    api_key, prov, mdl, burl = _resolve_query_llm(
        settings,
        user_id,
        model_config_id=model_config_id,
        model=model,
        provider=provider,
        base_url=base_url,
    )
    if not api_key:
        raise RuntimeError("未配置 LLM API Key，无法使用 LLM-Wiki 查询")

    contexts = search_wiki_pages(question, settings=settings, top_k=top_k)
    messages = build_wiki_query_messages(question, contexts, history, system_extra=system_extra)
    answer = await chat_completion(
        messages,
        model=mdl,
        provider=prov,
        api_key=api_key,
        base_url=burl,
        temperature=0.2,
        settings=settings,
    )
    return {"answer": answer, "contexts": contexts}


async def wiki_answer_stream(
    question: str,
    *,
    history: list[dict[str, str]] | None = None,
    top_k: int | None = None,
    user_id: str = "default",
    model: str | None = None,
    provider: str | None = None,
    base_url: str | None = None,
    system_extra: str | None = None,
    model_config_id: str | None = None,
    settings: Settings | None = None,
) -> tuple[list[dict[str, Any]], AsyncIterator[str]]:
    settings = settings or get_settings()
    api_key, prov, mdl, burl = _resolve_query_llm(
        settings,
        user_id,
        model_config_id=model_config_id,
        model=model,
        provider=provider,
        base_url=base_url,
    )
    if not api_key:
        raise RuntimeError("未配置 LLM API Key，无法使用 LLM-Wiki 查询")

    contexts = search_wiki_pages(question, settings=settings, top_k=top_k)
    messages = build_wiki_query_messages(question, contexts, history, system_extra=system_extra)

    async def gen():
        async for delta in stream_chat_completion(
            messages,
            model=mdl,
            provider=prov,
            api_key=api_key,
            base_url=burl,
            temperature=0.2,
            settings=settings,
        ):
            yield delta

    return contexts, gen()
