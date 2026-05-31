"""LLM 批量 ingest：将 raw/ 未处理文件结构化为 wiki/ Markdown（Karpathy LLM-Wiki 范式）。"""

from __future__ import annotations

import asyncio
import json
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from app.config import Settings, get_settings
from app.context import bind_user_context
from app.services import llm_wiki
from app.services.wiki_assets import normalize_markdown_images
from app.services.llm import chat_completion
from app.services.raw_extract import EXTRACTABLE_SUFFIXES, extract_sidecar_rel
from app.services.secrets_store import resolve_model_api_key
from app.services.wiki_archive import (
    archive_raw_file,
    find_archived_duplicate,
    is_under_archive,
)
from app.services.wiki_conflict import apply_wiki_file_update, list_ingest_conflicts
from app.services.wiki_index import is_protected_index_name, rebuild_wiki_index

_STUB_MARKERS = (
    "待 Agent 完整 ingest",
    "是否已由 LLM 完成结构化",
    "（待补充）",
)

_JOB_FILE = ".ingest-job.json"
_TYPE_DIRS = ("sources", "concepts", "entities", "synthesis", "queries")
_TYPE_LABELS = {
    "source": "来源摘要",  # 与 raw 原文区分；侧栏对未 ingest 的占位摘要不展示
    "concept": "概念",
    "entity": "实体",
    "synthesis": "综合论述",
    "query": "查询沉淀",
}

_job_lock = asyncio.Lock()
_job_task: asyncio.Task | None = None


def _wiki_llm_defaults(settings: Settings) -> dict[str, str | None]:
    return {
        "model_config_id": settings.wiki_ingest_model_config_id,
        "provider": settings.wiki_ingest_provider,
        "model": settings.wiki_ingest_model,
        "base_url": (settings.wiki_ingest_base_url or "").strip() or None,
    }


def _resolve_wiki_llm(
    settings: Settings,
    user_id: str,
    *,
    model_config_id: str | None = None,
    provider: str | None = None,
    model: str | None = None,
    base_url: str | None = None,
) -> tuple[str | None, str, str, str | None]:
    """解析 ingest / 补全任务使用的 LLM（优先请求中的 model_config_id）。"""
    defaults = _wiki_llm_defaults(settings)
    config_id = (model_config_id or defaults["model_config_id"] or "").strip() or None
    prov = (provider or defaults["provider"] or "deepseek").strip()
    mdl = (model or defaults["model"] or "deepseek-chat").strip()
    burl = (base_url or defaults["base_url"] or "").strip() or None
    api_key = resolve_model_api_key(user_id, config_id, settings=settings)
    return api_key, prov, mdl, burl


def _llm_from_job_state(state: dict[str, Any]) -> dict[str, str | None]:
    raw = state.get("llm")
    if not isinstance(raw, dict):
        return {}
    return {
        "model_config_id": raw.get("model_config_id"),
        "provider": raw.get("provider"),
        "model": raw.get("model"),
        "base_url": raw.get("base_url"),
    }


def _read_job_llm(root: Path, settings: Settings) -> dict[str, str | None]:
    return _llm_from_job_state(_read_job(root)) or _wiki_llm_defaults(settings)


def _job_path(root: Path) -> Path:
    return root / _JOB_FILE


def _read_job(root: Path) -> dict[str, Any]:
    path = _job_path(root)
    if not path.is_file():
        return {"running": False, "total": 0, "done": 0, "current": None, "errors": [], "results": []}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"running": False, "total": 0, "done": 0, "current": None, "errors": [], "results": []}


def _write_job(root: Path, state: dict[str, Any]) -> None:
    path = _job_path(root)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def ingest_status(settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    root = llm_wiki.wiki_root(settings)
    state = _read_job(root)
    pending = list_pending_raw(settings)
    conflicts = list_ingest_conflicts(settings)
    job_llm = _llm_from_job_state(state) or _wiki_llm_defaults(settings)
    return {
        **state,
        "pending_count": len(pending),
        "pending_paths": pending[:20],
        "conflict_count": len(conflicts),
        "conflicts": conflicts[:30],
        "llm": job_llm,
    }


def is_raw_ingested(root: Path, raw_rel: str) -> bool:
    slug = llm_wiki._slugify(Path(raw_rel).name)
    source_path = root / "wiki" / "sources" / f"{slug}.md"
    if not source_path.is_file():
        return False
    text = source_path.read_text(encoding="utf-8", errors="replace")
    if re.search(r"^status:\s*published\s*$", text, re.MULTILINE):
        return True
    if any(marker in text for marker in _STUB_MARKERS):
        return False
    body = text
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end != -1:
            body = text[end + 5 :]
    if len(body.strip()) < 120:
        return False
    return True


def list_pending_raw(settings: Settings | None = None) -> list[str]:
    root = llm_wiki.wiki_root(settings)
    llm_wiki._ensure_layout(root)
    pending: list[str] = []
    for item in llm_wiki.list_raw_files(settings):
        rel = item["path"]
        if is_under_archive(rel):
            continue
        if find_archived_duplicate(root, rel) and is_raw_ingested(root, rel):
            continue
        if not is_raw_ingested(root, rel):
            pending.append(rel)
    return pending


def list_failed_raw_from_job(settings: Settings | None = None) -> list[str]:
    """上次任务失败且仍未 published 的 raw 路径。"""
    root = llm_wiki.wiki_root(settings)
    state = _read_job(root)
    failed: list[str] = []
    seen: set[str] = set()
    for item in state.get("errors", []):
        rel = str(item.get("raw") or "").strip()
        if not rel or rel == "_graph" or rel in seen:
            continue
        seen.add(rel)
        if not is_raw_ingested(root, rel):
            failed.append(rel)
    return failed


def dismiss_ingest_errors(settings: Settings | None = None) -> None:
    root = llm_wiki.wiki_root(settings)
    state = _read_job(root)
    state["errors"] = []
    _write_job(root, state)


def _fm_lists_raw(text: str, raw_rel: str) -> bool:
    raw_line = raw_rel.replace("\\", "/").strip()
    if not raw_line:
        return False
    in_sources = False
    for line in text.splitlines():
        if re.match(r"^sources:\s*$", line):
            in_sources = True
            continue
        if in_sources:
            m = re.match(r"^\s+-\s+(.+)$", line)
            if m:
                entry = m.group(1).strip().strip("'\"").replace("\\", "/")
                if entry == raw_line or entry.endswith(f"/{raw_line}"):
                    return True
                continue
            if line and not line.startswith(" "):
                in_sources = False
    return f"`{raw_line}`" in text or raw_line in text


def _is_published_wiki_page(text: str) -> bool:
    if any(marker in text for marker in _STUB_MARKERS):
        return False
    return bool(re.search(r"^status:\s*published\s*$", text, re.MULTILINE))


def _rollback_draft_pages_for_raw(root: Path, raw_rel: str) -> list[str]:
    """撤回该 raw 关联且未 published 的 wiki 页（已成功 ingest 的保留）。"""
    wiki_dir = root / "wiki"
    if not wiki_dir.is_dir():
        return []
    removed: list[str] = []
    for path in sorted(wiki_dir.rglob("*.md")):
        if is_protected_index_name(path.name):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if not _fm_lists_raw(text, raw_rel):
            continue
        if _is_published_wiki_page(text):
            continue
        try:
            rel = path.relative_to(root).as_posix()
            path.unlink()
            removed.append(rel)
        except OSError:
            continue
    return removed


def _finalize_job_stopped(root: Path, *, cancelled: bool) -> dict[str, Any]:
    state = _read_job(root)
    state["running"] = False
    state["cancel_requested"] = False
    state["current"] = None
    state["finished_at"] = datetime.now(timezone.utc).isoformat()
    if cancelled:
        state["cancelled"] = True
    _write_job(root, state)
    try:
        rebuild_wiki_index(root)
        llm_wiki.rebuild_graph()
    except Exception as exc:
        state = _read_job(root)
        state["errors"].append({"raw": "_graph", "error": f"图谱重建失败: {exc}"})
        _write_job(root, state)
    return state


def ensure_stubs_for_pending(settings: Settings | None = None) -> list[str]:
    """为尚未有 source 页的 raw 创建占位页。"""
    root = llm_wiki.wiki_root(settings)
    created: list[str] = []
    for item in llm_wiki.list_raw_files(settings):
        rel = item["path"]
        slug = llm_wiki._slugify(Path(rel).name)
        wiki_path = root / "wiki" / "sources" / f"{slug}.md"
        if wiki_path.is_file():
            continue
        stub = llm_wiki._ensure_source_stub(root, rel, Path(rel).stem)
        created.append(stub)
    return created


def _read_raw_body(root: Path, raw_rel: str, max_chars: int) -> tuple[str, str]:
    """返回 (正文, 说明)。"""
    full = root / raw_rel
    if not full.is_file():
        raise FileNotFoundError(raw_rel)

    suffix = full.suffix.lower()
    if suffix in EXTRACTABLE_SUFFIXES:
        sidecar = root / extract_sidecar_rel(raw_rel)
        if sidecar.is_file():
            text = sidecar.read_text(encoding="utf-8", errors="replace")
            if text.startswith("---\n"):
                end = text.find("\n---\n", 4)
                if end != -1:
                    text = text[end + 5 :]
            note = f"来自提取文本 {sidecar.relative_to(root).as_posix()}"
            text = normalize_markdown_images(text[:max_chars], raw_rel)
            return text, note
        raise ValueError(f"二进制 raw 尚未提取文本：{raw_rel}")

    text = full.read_text(encoding="utf-8", errors="replace")
    text = normalize_markdown_images(text[:max_chars], raw_rel)
    return text, "原始文本"


def _safe_wiki_rel(rel: str) -> str:
    p = Path(rel.replace("\\", "/").strip().lstrip("/"))
    if ".." in p.parts:
        raise ValueError(f"非法路径: {rel}")
    parts = p.parts
    if not parts or parts[0] != "wiki":
        raise ValueError(f"路径须在 wiki/ 下: {rel}")
    if is_protected_index_name(parts[-1]):
        raise ValueError(f"不可覆盖: {rel}")
    allowed = set(_TYPE_DIRS)
    if len(parts) >= 2 and parts[1] not in allowed:
        raise ValueError(f"未知 wiki 子目录: {rel}")
    rel_str = p.as_posix()
    if not rel_str.endswith(".md"):
        rel_str = f"{rel_str}.md"
    return rel_str


def _parse_llm_json(text: str) -> dict[str, Any]:
    text = (text or "").strip()
    if not text:
        raise ValueError("模型返回空内容（可能被限流、超时或上下文过长）")
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    else:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            text = text[start : end + 1]
        else:
            raise ValueError("模型未返回 JSON 对象，请重试")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"JSON 解析失败: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("LLM 输出须为 JSON 对象")
    return data


def _build_ingest_messages(
    raw_rel: str,
    raw_body: str,
    body_note: str,
    existing_titles: list[str],
) -> list[dict[str, str]]:
    existing_block = "\n".join(f"- {t}" for t in existing_titles[:40]) or "（尚无）"
    system = """你是 LLM-Wiki 维护 Agent，遵循 Karpathy LLM-Wiki 范式。
任务：阅读一篇 raw 原始资料，输出结构化 wiki Markdown 文件集合。

规则：
1. 只输出一个 JSON 对象，不要其它说明。格式：
{
  "files": [
    {"path": "wiki/sources/slug.md", "content": "完整 markdown 含 YAML frontmatter"},
    {"path": "wiki/concepts/slug.md", "content": "..."}
  ],
  "log_title": "简短中文标题用于日志"
}
2. path 必须在 wiki/sources、wiki/concepts、wiki/entities 之一；文件名 kebab-case 或拼音 slug；必须 .md。
3. 每篇 wiki 页须含 YAML frontmatter：title, type, aliases, tags, sources（含本 raw 路径）, created, updated, status: published, source_count。
4. wiki/sources/ 必须有且仅有一篇对应本篇 raw 的来源摘要（type: source）。
5. 提取 2～6 个核心概念写入 wiki/concepts/；若有明确实体（库、工具、人物）可写 wiki/entities/（0～3 篇）。
6. 正文使用简体中文；用 [[concepts/xxx]]、[[entities/xxx]]、[[sources/xxx]] 互链（slug 不含 .md）。
7. 要点具体、可检索，避免空模板句；不要写「待补充」。
8. 优先更新已有概念（见下方列表），避免同义重复 slug。
9. 已有页面小幅更新可合并表述；若与旧页主旨明显矛盾仍输出新稿（系统会做冲突检测）。"""

    user = f"""## 原始文件
- 路径：`{raw_rel}`
- 说明：{body_note}
- 字符数（截断后）：{len(raw_body)}

## 已有 wiki 标题（避免重复）
{existing_block}

## 原文
```
{raw_body}
```
"""
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def _collect_existing_titles(root: Path) -> list[str]:
    titles: list[str] = []
    wiki_dir = root / "wiki"
    if not wiki_dir.is_dir():
        return titles
    for path in sorted(wiki_dir.rglob("*.md")):
        if is_protected_index_name(path.name):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        m = re.search(r"^title:\s*(.+?)\s*$", text, re.MULTILINE)
        if m:
            titles.append(m.group(1).strip().strip('"').strip("'"))
    return titles


def _apply_ingest_files(
    root: Path,
    files: list[dict[str, Any]],
    raw_rel: str,
    settings: Settings,
) -> dict[str, Any]:
    written: list[str] = []
    conflicts: list[dict[str, Any]] = []
    merged: list[str] = []
    policy = (settings.wiki_ingest_conflict_policy or "ask").strip().lower()

    for item in files:
        rel = _safe_wiki_rel(str(item.get("path", "")))
        content = str(item.get("content", "")).strip()
        if not content:
            continue
        if not content.startswith("---\n"):
            raise ValueError(f"缺少 frontmatter: {rel}")
        result = apply_wiki_file_update(
            root, rel, content, raw_rel, policy=policy
        )
        action = result.get("action")
        if action == "conflict":
            conflicts.append(result)
        elif action == "merged" and result.get("node_id"):
            merged.append(str(result["node_id"]))
            written.append(str(result["node_id"]))
        elif result.get("node_id"):
            written.append(str(result["node_id"]))

    return {"written": written, "merged": merged, "conflicts": conflicts}


def _append_log(root: Path, raw_rel: str, log_title: str, written: list[str]) -> None:
    log_path = root / "wiki" / "log.md"
    today = date.today().isoformat()
    if not log_path.is_file():
        log_path.write_text("# Wiki 操作日志\n\n", encoding="utf-8")
    lines = [
        f"\n## [{today}] ingest | {log_title}\n",
        f"- raw: `{raw_rel}`\n",
        f"- 写入/更新: {len(written)} 个页面\n",
    ]
    for wid in written[:12]:
        lines.append(f"  - `{wid}`\n")
    if len(written) > 12:
        lines.append(f"  - … 另有 {len(written) - 12} 个\n")
    with log_path.open("a", encoding="utf-8") as f:
        f.writelines(lines)


async def ingest_one_raw(
    raw_rel: str,
    settings: Settings | None = None,
    *,
    user_id: str = "default",
) -> dict[str, Any]:
    settings = settings or get_settings()
    root = llm_wiki.wiki_root(settings)
    max_chars = settings.wiki_ingest_max_chars

    job_llm = _read_job_llm(root, settings)
    api_key, provider, model, base_url = _resolve_wiki_llm(
        settings,
        user_id,
        model_config_id=job_llm.get("model_config_id"),
        provider=job_llm.get("provider"),
        model=job_llm.get("model"),
        base_url=job_llm.get("base_url"),
    )
    if not api_key:
        raise RuntimeError(
            "未配置 LLM API Key。请在「模型配置」中为所选模型保存密钥，"
            "或在 backend/.env 设置 OPENAI_API_KEY。"
        )

    if is_under_archive(raw_rel):
        raise ValueError(f"已在归档区，跳过：{raw_rel}")

    dup = find_archived_duplicate(root, raw_rel)
    if dup and is_raw_ingested(root, raw_rel):
        raise ValueError(f"同名 raw 已归档于 {dup}，且 wiki 已发布，跳过")

    raw_body, body_note = _read_raw_body(root, raw_rel, max_chars)
    if len(raw_body.strip()) < 50:
        raise ValueError(f"原文过短或为空：{raw_rel}")

    existing = _collect_existing_titles(root)
    messages = _build_ingest_messages(raw_rel, raw_body, body_note, existing)
    attempts = max(1, settings.wiki_ingest_retries)
    last_err: Exception | None = None

    for attempt in range(attempts):
        try:
            raw_llm = await chat_completion(
                messages,
                model=model,
                provider=provider,
                api_key=api_key,
                base_url=base_url,
                temperature=0.1,
                timeout=300.0,
                response_format={"type": "json_object"},
                settings=settings,
            )
            if raw_llm.startswith("【演示模式】"):
                raise RuntimeError(raw_llm)

            data = _parse_llm_json(raw_llm)
            files = data.get("files")
            if not isinstance(files, list) or not files:
                raise ValueError("LLM 未返回 files 数组")

            apply_result = _apply_ingest_files(root, files, raw_rel, settings)
            written = apply_result["written"]
            conflicts = apply_result["conflicts"]
            log_title = str(data.get("log_title") or Path(raw_rel).stem)
            _append_log(root, raw_rel, log_title, written)
            archived_rel: str | None = None
            if settings.wiki_archive_after_ingest and not conflicts:
                try:
                    archived_rel = archive_raw_file(root, raw_rel)
                except Exception:
                    archived_rel = None
            elif settings.wiki_archive_after_ingest and conflicts:
                archived_rel = None
            ok = len(conflicts) == 0
            return {
                "raw": raw_rel,
                "ok": ok,
                "partial": bool(written) and bool(conflicts),
                "pages": written,
                "count": len(written),
                "merged": apply_result.get("merged", []),
                "conflicts": conflicts,
                "archived": archived_rel,
            }
        except Exception as exc:
            last_err = exc
            if attempt < attempts - 1:
                await asyncio.sleep(settings.wiki_ingest_retry_delay_sec * (attempt + 1))
                continue
            break

    assert last_err is not None
    raise last_err


async def _run_ingest_job(
    settings: Settings,
    user_id: str = "default",
    *,
    retry_failed_only: bool = False,
    llm: dict[str, str | None] | None = None,
) -> None:
    global _job_task
    bind_user_context(user_id)
    root = llm_wiki.wiki_root(settings, user_id)
    ensure_stubs_for_pending(settings)
    if retry_failed_only:
        pending = list_failed_raw_from_job(settings)
        if not pending:
            pending = list_pending_raw(settings)
    else:
        pending = list_pending_raw(settings)

    prev = _read_job(root)
    prev_results = list(prev.get("results", [])) if retry_failed_only else []
    job_llm = llm or _wiki_llm_defaults(settings)
    state: dict[str, Any] = {
        "running": True,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "finished_at": None,
        "total": len(pending),
        "done": 0,
        "current": None,
        "errors": [] if not retry_failed_only else list(prev.get("errors", [])),
        "results": prev_results,
        "mode": "retry_failed" if retry_failed_only else "all_pending",
        "cancel_requested": False,
        "cancelled": False,
        "llm": job_llm,
    }
    _write_job(root, state)

    sem = asyncio.Semaphore(max(1, settings.wiki_ingest_concurrency))

    async def process_one(rel: str) -> None:
        async with sem:
            state = _read_job(root)
            if state.get("cancel_requested"):
                return
            state["current"] = rel
            _write_job(root, state)
            try:
                result = await ingest_one_raw(rel, settings, user_id=user_id)
                state = _read_job(root)
                state["results"].append(result)
                if result.get("conflicts"):
                    for c in result["conflicts"]:
                        state["errors"].append(
                            {
                                "raw": rel,
                                "error": f"冲突待处理: {c.get('path', '')}",
                                "kind": "conflict",
                                "conflict_id": c.get("conflict_id"),
                            }
                        )
            except Exception as exc:
                state = _read_job(root)
                if not is_raw_ingested(root, rel):
                    _rollback_draft_pages_for_raw(root, rel)
                state["errors"].append({"raw": rel, "error": str(exc)})
            state["done"] = int(state.get("done", 0)) + 1
            state["current"] = None
            _write_job(root, state)

    cancelled = False
    try:
        for rel in pending:
            state = _read_job(root)
            if state.get("cancel_requested"):
                cancelled = True
                break
            await process_one(rel)
    except asyncio.CancelledError:
        cancelled = True
    finally:
        state = _read_job(root)
        if cancelled or state.get("cancel_requested"):
            cur = state.get("current")
            if cur and not is_raw_ingested(root, cur):
                _rollback_draft_pages_for_raw(root, cur)
            _finalize_job_stopped(root, cancelled=True)
        else:
            rebuild_wiki_index(root)
            try:
                llm_wiki.rebuild_graph(settings)
            except Exception as exc:
                state = _read_job(root)
                state["errors"].append({"raw": "_graph", "error": f"图谱重建失败: {exc}"})
                _write_job(root, state)
            state = _read_job(root)
            state["running"] = False
            state["cancel_requested"] = False
            state["finished_at"] = datetime.now(timezone.utc).isoformat()
            state["current"] = None
            _write_job(root, state)
        _job_task = None


async def start_ingest_job(
    settings: Settings | None = None,
    *,
    user_id: str = "default",
    retry_failed_only: bool = False,
    model_config_id: str | None = None,
    provider: str | None = None,
    model: str | None = None,
    base_url: str | None = None,
) -> dict[str, Any]:
    """启动后台 ingest；若已在运行则返回当前状态。"""
    global _job_task
    settings = settings or get_settings()
    root = llm_wiki.wiki_root(settings)

    state = _read_job(root)
    task_alive = _job_task is not None and not _job_task.done()
    if state.get("running") and not task_alive:
        state["running"] = False
        _write_job(root, state)
    elif state.get("running") and task_alive:
        return {"started": False, "message": "ingest 任务进行中", **ingest_status(settings)}

    ensure_stubs_for_pending(settings)
    if retry_failed_only:
        pending = list_failed_raw_from_job(settings)
        if not pending:
            pending = list_pending_raw(settings)
    else:
        pending = list_pending_raw(settings)
    if not pending:
        llm_wiki.rebuild_graph(settings)
        rebuild_wiki_index(root)
        return {
            "started": False,
            "message": "没有待 ingest 的 raw 文件，已重建图谱",
            "pending_count": 0,
            **ingest_status(settings),
        }

    job_llm = {
        "model_config_id": model_config_id or settings.wiki_ingest_model_config_id,
        "provider": provider or settings.wiki_ingest_provider,
        "model": model or settings.wiki_ingest_model,
        "base_url": (base_url or settings.wiki_ingest_base_url or "").strip() or None,
    }
    mode_label = "重试失败项" if retry_failed_only else "批量构建"
    _job_task = asyncio.create_task(
        _run_ingest_job(
            settings,
            user_id,
            retry_failed_only=retry_failed_only,
            llm=job_llm,
        )
    )
    prov = job_llm["provider"] or settings.wiki_ingest_provider
    mdl = job_llm["model"] or settings.wiki_ingest_model
    return {
        "started": True,
        "message": f"已开始{mode_label} {len(pending)} 个待处理 raw（{prov} / {mdl}）",
        "pending_count": len(pending),
        "running": True,
        "total": len(pending),
        "done": 0,
        "retry_failed_only": retry_failed_only,
        "model": mdl,
        "provider": prov,
        "model_config_id": job_llm.get("model_config_id"),
    }


async def cancel_ingest_job(settings: Settings | None = None) -> dict[str, Any]:
    """请求停止后台 ingest / 补全任务；已完成项保留，当前未完成项回滚草稿。"""
    global _job_task
    settings = settings or get_settings()
    root = llm_wiki.wiki_root(settings)

    async with _job_lock:
        state = _read_job(root)
        task_alive = _job_task is not None and not _job_task.done()
        if not state.get("running") and not task_alive:
            return {
                "cancelled": False,
                "message": "没有运行中的构建任务",
                **ingest_status(settings),
            }

        state["cancel_requested"] = True
        current = state.get("current")
        _write_job(root, state)

        if _job_task and not _job_task.done():
            _job_task.cancel()
            try:
                await _job_task
            except asyncio.CancelledError:
                pass

        removed: list[str] = []
        if current and not is_raw_ingested(root, current):
            removed = _rollback_draft_pages_for_raw(root, current)

        state = _read_job(root)
        if state.get("running"):
            _finalize_job_stopped(root, cancelled=True)

        return {
            "cancelled": True,
            "message": "已停止构建，已完成项已保留",
            "rolled_back": removed,
            "pending_count": len(list_pending_raw(settings)),
            **ingest_status(settings),
        }


def _backlink_snippets(
    root: Path,
    node_id: str,
    edges: list[dict],
    *,
    limit: int = 3,
    max_chars: int = 2000,
) -> str:
    sources = [e["source"] for e in edges if e.get("target") == node_id][:limit]
    parts: list[str] = []
    for sid in sources:
        found = llm_wiki.wiki_file_for_node_id(root, sid)
        if not found:
            continue
        text = found.read_text(encoding="utf-8", errors="replace")[:max_chars]
        parts.append(f"### 引用自 `{sid}`\n{text}\n")
    return "\n".join(parts) if parts else "（暂无引用页正文，请根据标题生成合理概念页。）"


async def repair_one_orphan(
    node: dict,
    edges: list[dict],
    settings: Settings | None = None,
    *,
    user_id: str = "default",
) -> dict[str, Any]:
    settings = settings or get_settings()
    root = llm_wiki.wiki_root(settings)
    node_id = str(node["id"])
    title = str(node.get("title") or Path(node_id).name)

    job_llm = _read_job_llm(root, settings)
    api_key, provider, model, base_url = _resolve_wiki_llm(
        settings,
        user_id,
        model_config_id=job_llm.get("model_config_id"),
        provider=job_llm.get("provider"),
        model=job_llm.get("model"),
        base_url=job_llm.get("base_url"),
    )
    if not api_key:
        raise RuntimeError("未配置 LLM API Key")

    context = _backlink_snippets(root, node_id, edges)
    ptype = llm_wiki._infer_wiki_type_from_path(node.get("path") or f"{node_id}.md", "concept")
    subdir = "concepts" if ptype == "concept" else "entities" if ptype == "entity" else "concepts"

    system = """你是 LLM-Wiki 维护 Agent。任务：为图谱中的「断链占位」补写一篇 wiki 页。
只输出 JSON：{"files":[{"path":"wiki/concepts/slug.md","content":"完整 markdown+frontmatter"}],"log_title":"标题"}
path 须与请求的 target_id 一致（仅改大小写）；type/status: published；正文简体中文，含 [[wikilink]]。"""

    user = f"""## 待补全节点
- target_id: `{node_id}`
- 标题: {title}
- 建议类型: {ptype}
- 建议目录: wiki/{subdir}/

## 引用上下文
{context}
"""
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    raw_llm = await chat_completion(
        messages,
        model=model,
        provider=provider,
        api_key=api_key,
        base_url=base_url,
        temperature=0.1,
        timeout=180.0,
        response_format={"type": "json_object"},
        settings=settings,
    )
    data = _parse_llm_json(raw_llm)
    files = data.get("files")
    if not isinstance(files, list) or not files:
        raise ValueError("LLM 未返回 files")
    apply_result = _apply_ingest_files(root, files, f"repair:{node_id}", settings)
    return {
        "id": node_id,
        "ok": True,
        "pages": apply_result["written"],
        "conflicts": apply_result.get("conflicts", []),
    }


async def _run_repair_orphans_job(
    settings: Settings,
    user_id: str = "default",
    *,
    llm: dict[str, str | None] | None = None,
) -> None:
    global _job_task
    bind_user_context(user_id)
    root = llm_wiki.wiki_root(settings, user_id)
    graph = llm_wiki.load_graph(settings)
    edges = list(graph.get("edges", []))
    orphans = llm_wiki.list_orphan_wiki_nodes(settings)

    job_llm = llm or _wiki_llm_defaults(settings)
    state: dict[str, Any] = {
        "running": True,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "finished_at": None,
        "total": len(orphans),
        "done": 0,
        "current": None,
        "errors": [],
        "results": [],
        "mode": "repair_orphans",
        "cancel_requested": False,
        "cancelled": False,
        "llm": job_llm,
    }
    _write_job(root, state)

    cancelled = False
    try:
        for node in orphans:
            state = _read_job(root)
            if state.get("cancel_requested"):
                cancelled = True
                break
            nid = node["id"]
            state["current"] = nid
            _write_job(root, state)
            try:
                result = await repair_one_orphan(node, edges, settings, user_id=user_id)
                state = _read_job(root)
                state["results"].append(result)
            except Exception as exc:
                state = _read_job(root)
                state["errors"].append({"raw": nid, "error": str(exc)})
            state["done"] = int(state.get("done", 0)) + 1
            state["current"] = None
            _write_job(root, state)
            await asyncio.sleep(settings.wiki_ingest_retry_delay_sec)
    except asyncio.CancelledError:
        cancelled = True
    finally:
        if cancelled or _read_job(root).get("cancel_requested"):
            _finalize_job_stopped(root, cancelled=True)
        else:
            rebuild_wiki_index(root)
            try:
                llm_wiki.rebuild_graph(settings)
            except Exception as exc:
                state = _read_job(root)
                state["errors"].append({"raw": "_graph", "error": str(exc)})
                _write_job(root, state)
            state = _read_job(root)
            state["running"] = False
            state["cancel_requested"] = False
            state["finished_at"] = datetime.now(timezone.utc).isoformat()
            _write_job(root, state)
        _job_task = None


async def start_repair_orphans_job(
    settings: Settings | None = None,
    *,
    user_id: str = "default",
    model_config_id: str | None = None,
    provider: str | None = None,
    model: str | None = None,
    base_url: str | None = None,
) -> dict[str, Any]:
    global _job_task
    settings = settings or get_settings()
    root = llm_wiki.wiki_root(settings)

    state = _read_job(root)
    task_alive = _job_task is not None and not _job_task.done()
    if state.get("running") and task_alive:
        return {"started": False, "message": "任务进行中", **ingest_status(settings)}

    orphans = llm_wiki.list_orphan_wiki_nodes(settings)
    if not orphans:
        llm_wiki.rebuild_graph(settings)
        return {
            "started": False,
            "message": "没有待补全的未知/断链节点，已重建图谱",
            "orphan_count": 0,
            **ingest_status(settings),
        }

    job_llm = {
        "model_config_id": model_config_id or settings.wiki_ingest_model_config_id,
        "provider": provider or settings.wiki_ingest_provider,
        "model": model or settings.wiki_ingest_model,
        "base_url": (base_url or settings.wiki_ingest_base_url or "").strip() or None,
    }
    _job_task = asyncio.create_task(_run_repair_orphans_job(settings, user_id, llm=job_llm))
    return {
        "started": True,
        "message": f"已开始补全 {len(orphans)} 个未知/断链 wiki 页",
        "orphan_count": len(orphans),
        "running": True,
        "total": len(orphans),
        "done": 0,
    }


async def ingest_and_rebuild(
    settings: Settings | None = None,
    *,
    user_id: str = "default",
) -> dict[str, Any]:
    """同步等待整批 ingest 完成（仅适合测试或小批量）。"""
    settings = settings or get_settings()
    root = llm_wiki.wiki_root(settings)
    ensure_stubs_for_pending(settings)
    pending = list_pending_raw(settings)
    if not pending:
        graph = llm_wiki.rebuild_graph(settings)
        rebuild_wiki_index(root)
        return {"ok": True, "ingested": 0, "graph": graph, "message": "无待处理 raw，已重建图谱"}

    errors: list[dict] = []
    results: list[dict] = []
    for rel in pending:
        try:
            results.append(await ingest_one_raw(rel, settings, user_id=user_id))
        except Exception as exc:
            errors.append({"raw": rel, "error": str(exc)})

    rebuild_wiki_index(root)
    graph = llm_wiki.rebuild_graph(settings)
    return {
        "ok": len(errors) == 0,
        "ingested": len(results),
        "results": results,
        "errors": errors,
        "graph": graph,
    }
