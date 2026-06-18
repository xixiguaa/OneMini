from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.deps import get_current_user
from app.db.session import get_session
from app.services import minio_storage, custom_skills_service

router = APIRouter(
    prefix="/agent/skills",
    tags=["skills"],
    dependencies=[Depends(get_current_user)],
)

@router.post("/upload")
async def upload_skill(
    file: UploadFile = File(...),
    name_override: str | None = Form(None),
    desc_override: str | None = Form(None),
    _user_id: str = Depends(get_current_user)
):
    if not file.filename.endswith(".zip"):
        raise HTTPException(400, "仅支持上传 .zip 技能包")
    content = await file.read()
    try:
        meta = custom_skills_service.validate_zip(content)
    except Exception as exc:
        raise HTTPException(400, f"技能包校验失败: {str(exc)}")
    
    skill_id = meta["id"]
    name = name_override or meta["name"]
    description = desc_override or meta.get("description", "")
    minio_key = f"skills/{skill_id}.zip"
    
    # Save ZIP to MinIO
    try:
        minio_storage.put_bytes(minio_key, content, content_type="application/zip")
    except Exception as e:
        raise HTTPException(500, f"保存技能文件到 MinIO 失败: {str(e)}")
    
    # Save to database
    with get_session() as db:
        try:
            row = custom_skills_service.create_custom_skill(db, skill_id, name, description, minio_key)
            return {
                "id": row.id,
                "name": row.name,
                "description": row.description,
                "minio_key": row.minio_key,
                "is_global_enabled": row.is_global_enabled
            }
        except Exception as e:
            raise HTTPException(500, f"保存技能元数据到数据库失败: {str(e)}")

@router.get("")
async def get_skills(_user_id: str = Depends(get_current_user)):
    with get_session() as db:
        items = custom_skills_service.get_all_skills(db)
        return [
            {
                "id": item.id,
                "name": item.name,
                "description": item.description,
                "minio_key": item.minio_key,
                "is_global_enabled": item.is_global_enabled
            }
            for item in items
        ]

@router.put("/{skill_id}")
async def update_skill(
    skill_id: str,
    is_enabled: bool,
    _user_id: str = Depends(get_current_user)
):
    with get_session() as db:
        try:
            row = custom_skills_service.toggle_skill_status(db, skill_id, is_enabled)
            return {"id": row.id, "is_global_enabled": row.is_global_enabled}
        except ValueError as e:
            raise HTTPException(404, str(e))
        except Exception as e:
            raise HTTPException(500, f"更新技能状态失败: {str(e)}")

@router.delete("/{skill_id}")
async def delete_skill(skill_id: str, _user_id: str = Depends(get_current_user)):
    with get_session() as db:
        try:
            custom_skills_service.delete_custom_skill(db, skill_id)
            return {"success": True}
        except Exception as e:
            raise HTTPException(500, f"删除技能失败: {str(e)}")
