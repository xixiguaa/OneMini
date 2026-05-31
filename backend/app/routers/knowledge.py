from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.deps import get_current_user
from app.services import rag
from app.services.milvus_store import assert_doc_owned

router = APIRouter(
    prefix="/knowledge",
    tags=["knowledge"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/documents")
def list_documents(user_id: str = Depends(get_current_user)):
    return {"documents": rag.get_documents(user_id)}


@router.post("/documents")
async def add_document(
    text: str = Form(...),
    source: str = Form("未命名文档"),
    user_id: str = Depends(get_current_user),
):
    text = text.strip()
    if not text:
        raise HTTPException(400, "文本内容不能为空")
    try:
        result = await rag.ingest_text(text, source, user_id=user_id)
        return {"ok": True, **result}
    except Exception as exc:
        raise HTTPException(500, f"写入知识库失败: {exc}") from exc


@router.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    source: str | None = Form(None),
    user_id: str = Depends(get_current_user),
):
    raw = await file.read()
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(400, "仅支持 UTF-8 文本文件（.txt / .md 等）") from exc

    name = source or file.filename or "上传文件"
    try:
        result = await rag.ingest_text(content, name, user_id=user_id)
        return {"ok": True, **result}
    except Exception as exc:
        raise HTTPException(500, f"上传失败: {exc}") from exc


@router.delete("/documents/{doc_id}")
def remove_document(doc_id: str, user_id: str = Depends(get_current_user)):
    try:
        assert_doc_owned(user_id, doc_id)
        rag.remove_document(doc_id, user_id)
        return {"ok": True, "doc_id": doc_id}
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(500, f"删除失败: {exc}") from exc


@router.post("/search")
def search(body: dict, user_id: str = Depends(get_current_user)):
    query = (body.get("query") or "").strip()
    if not query:
        raise HTTPException(400, "缺少 query")
    top_k = body.get("top_k")
    try:
        from app.services.milvus_store import search_similar

        hits = search_similar(query, top_k=top_k, user_id=user_id)
        return {"query": query, "hits": hits}
    except Exception as exc:
        raise HTTPException(500, f"检索失败: {exc}") from exc
