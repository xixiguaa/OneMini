import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.config import get_settings
from app.deps import get_user_id
from typing import Literal

from app.services import llm_wiki, wiki_ingest, wiki_lint, wiki_query
from app.services.wiki_conflict import list_ingest_conflicts, resolve_conflict
from app.services.wiki_index import rebuild_wiki_index

router = APIRouter(prefix="/wiki", tags=["wiki"])


class WikiQueryRequest(BaseModel):
    question: str
    messages: list[dict[str, str]] = Field(default_factory=list)
    top_k: int | None = None
    model: str | None = None
    provider: str | None = None
    system_extra: str | None = None
    model_config_id: str | None = None
    base_url: str | None = None


class ResolveConflictBody(BaseModel):
    conflict_id: str
    resolution: Literal["overwrite", "discard", "keep_both"]


class RebuildGraphBody(BaseModel):
    auto_ingest: bool = Field(
        True,
        description="重建前自动 LLM ingest 未处理的 raw（后台队列）",
    )
    retry_failed_only: bool = Field(
        False,
        description="仅重试上次任务失败且仍未 published 的 raw",
    )


@router.get("/status")
def status():
    settings = get_settings()
    base = llm_wiki.wiki_status()
    pending = wiki_ingest.list_pending_raw()
    job = wiki_ingest.ingest_status()
    conflicts = list_ingest_conflicts(settings)
    return {
        **base,
        "conflict_count": len(conflicts),
        "ingest_llm": {
            "model_config_id": settings.wiki_ingest_model_config_id,
            "provider": settings.wiki_ingest_provider,
            "model": settings.wiki_ingest_model,
        },
        "pending_ingest": len(pending),
        "orphan_wiki": len(llm_wiki.list_orphan_wiki_nodes()),
        "ingest_job": {
            "running": job.get("running", False),
            "total": job.get("total", 0),
            "done": job.get("done", 0),
            "current": job.get("current"),
            "errors": job.get("errors", []),
        },
    }


@router.get("/ingest/status")
def ingest_status():
    if not llm_wiki.wiki_root().is_dir():
        raise HTTPException(404, "LLM-Wiki 目录不存在")
    return wiki_ingest.ingest_status()


@router.post("/ingest/dismiss")
def dismiss_ingest_errors():
    if not llm_wiki.wiki_root().is_dir():
        raise HTTPException(404, "LLM-Wiki 目录不存在")
    wiki_ingest.dismiss_ingest_errors()
    return {"ok": True}


@router.get("/ingest/conflicts")
def get_ingest_conflicts():
    if not llm_wiki.wiki_root().is_dir():
        raise HTTPException(404, "LLM-Wiki 目录不存在")
    items = list_ingest_conflicts()
    return {"count": len(items), "conflicts": items}


@router.post("/ingest/conflicts/resolve")
def resolve_ingest_conflict(body: ResolveConflictBody):
    if not llm_wiki.wiki_root().is_dir():
        raise HTTPException(404, "LLM-Wiki 目录不存在")
    try:
        result = resolve_conflict(body.conflict_id, body.resolution)
        root = llm_wiki.wiki_root()
        rebuild_wiki_index(root)
        llm_wiki.rebuild_graph()
        return {"ok": True, **result}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.get("/orphans")
def list_orphans():
    if not llm_wiki.wiki_root().is_dir():
        raise HTTPException(404, "LLM-Wiki 目录不存在")
    orphans = llm_wiki.list_orphan_wiki_nodes()
    return {"count": len(orphans), "nodes": orphans}


@router.post("/graph/repair-unknown")
async def repair_unknown_nodes(user_id: str = Depends(get_user_id)):
    if not llm_wiki.wiki_root().is_dir():
        raise HTTPException(404, "LLM-Wiki 目录不存在")
    return await wiki_ingest.start_repair_orphans_job(user_id=user_id)


@router.get("/graph")
def get_graph():
    if not llm_wiki.wiki_root().is_dir():
        raise HTTPException(404, "LLM-Wiki 目录不存在")
    return llm_wiki.load_graph()


@router.get("/node")
def get_node_content(id: str):
    if not llm_wiki.wiki_root().is_dir():
        raise HTTPException(404, "LLM-Wiki 目录不存在")
    return llm_wiki.read_node_content(id)


@router.post("/graph/rebuild")
async def rebuild_graph(
    body: RebuildGraphBody | None = None,
    user_id: str = Depends(get_user_id),
):
    if not llm_wiki.wiki_root().is_dir():
        raise HTTPException(404, "LLM-Wiki 目录不存在")
    auto = body.auto_ingest if body is not None else True
    if auto:
        return await wiki_ingest.start_ingest_job(
            user_id=user_id,
            retry_failed_only=body.retry_failed_only if body else False,
        )
    return llm_wiki.rebuild_graph()


@router.post("/lint")
def lint_wiki():
    if not llm_wiki.wiki_root().is_dir():
        raise HTTPException(404, "LLM-Wiki 目录不存在")
    return wiki_lint.run_wiki_lint()


@router.post("/query")
async def query_wiki(req: WikiQueryRequest, user_id: str = Depends(get_user_id)):
    if not llm_wiki.wiki_root().is_dir():
        raise HTTPException(404, "LLM-Wiki 目录不存在")
    question = req.question.strip()
    if not question:
        raise HTTPException(400, "缺少 question")
    try:
        return await wiki_query.wiki_answer(
            question,
            history=req.messages,
            top_k=req.top_k,
            user_id=user_id,
            model=req.model,
            provider=req.provider,
            base_url=req.base_url,
            system_extra=req.system_extra,
            model_config_id=req.model_config_id,
        )
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.post("/query/stream")
async def query_wiki_stream(req: WikiQueryRequest, user_id: str = Depends(get_user_id)):
    if not llm_wiki.wiki_root().is_dir():
        raise HTTPException(404, "LLM-Wiki 目录不存在")
    question = req.question.strip()
    if not question:
        raise HTTPException(400, "缺少 question")
    try:
        contexts, token_gen = await wiki_query.wiki_answer_stream(
            question,
            history=req.messages,
            top_k=req.top_k,
            user_id=user_id,
            model=req.model,
            provider=req.provider,
            base_url=req.base_url,
            system_extra=req.system_extra,
            model_config_id=req.model_config_id,
        )
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc

    async def event_stream():
        meta = {"type": "contexts", "contexts": contexts}
        yield f"data: {json.dumps(meta, ensure_ascii=False)}\n\n"
        async for delta in token_gen:
            yield f"data: {json.dumps({'type': 'delta', 'delta': delta}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream; charset=utf-8",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/raw")
def list_raw():
    return {"files": llm_wiki.list_raw_files()}


@router.post("/raw/upload")
async def upload_raw(
    file: UploadFile = File(...),
    subdir: str = Form("uploads"),
):
    if not llm_wiki.wiki_root().is_dir():
        raise HTTPException(404, "LLM-Wiki 目录不存在")
    try:
        return await llm_wiki.save_raw_upload(file, subdir=subdir)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"上传失败: {exc}") from exc


@router.delete("/raw")
def delete_raw(path: str):
    try:
        llm_wiki.delete_raw_file(path)
        llm_wiki.rebuild_graph()
        return {"ok": True, "path": path}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"删除失败: {exc}") from exc
