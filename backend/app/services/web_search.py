"""联网搜索：DuckDuckGo Instant Answer（无需 API Key）"""

from __future__ import annotations

from typing import Any

import httpx


def _flatten_topics(topics: list[Any], out: list[dict[str, str]], limit: int) -> None:
    for item in topics:
        if len(out) >= limit:
            return
        if not isinstance(item, dict):
            continue
        if "Topics" in item and isinstance(item["Topics"], list):
            _flatten_topics(item["Topics"], out, limit)
            continue
        text = (item.get("Text") or "").strip()
        url = (item.get("FirstURL") or "").strip()
        if not text:
            continue
        title = text.split(" - ")[0].strip() if " - " in text else text[:80]
        snippet = text if len(text) <= 400 else f"{text[:400]}…"
        out.append({"title": title, "snippet": snippet, "url": url})


async def search_web(query: str, *, top_k: int = 5) -> list[dict[str, str]]:
    q = (query or "").strip()
    if not q:
        return []

    top_k = max(1, min(top_k, 8))
    results: list[dict[str, str]] = []

    async with httpx.AsyncClient(timeout=12.0) as client:
        resp = await client.get(
            "https://api.duckduckgo.com/",
            params={
                "q": q[:300],
                "format": "json",
                "no_redirect": 1,
                "no_html": 1,
                "skip_disambig": 1,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    abstract = (data.get("AbstractText") or "").strip()
    heading = (data.get("Heading") or q).strip()
    abstract_url = (data.get("AbstractURL") or "").strip()
    if abstract:
        results.append(
            {
                "title": heading,
                "snippet": abstract,
                "url": abstract_url,
            }
        )

    related = data.get("RelatedTopics") or []
    if isinstance(related, list):
        _flatten_topics(related, results, top_k)

    seen: set[str] = set()
    unique: list[dict[str, str]] = []
    for row in results:
        key = row.get("snippet", "")[:80]
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
        if len(unique) >= top_k:
            break
    return unique
