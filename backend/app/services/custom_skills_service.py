import sys
import os
import json
import shutil
import zipfile
import importlib.util
from pathlib import Path
import time
from sqlalchemy.orm import Session
from app.db.models import AgentSkillRow
from app.services import minio_storage

SKILLS_DIR = Path("data/skills")

def parse_frontmatter(content: str) -> dict:
    import yaml
    start = content.find("---")
    if start != -1:
        end = content.find("---", start + 3)
        if end != -1:
            yaml_text = content[start + 3 : end]
            try:
                return yaml.safe_load(yaml_text) or {}
            except Exception as e:
                raise ValueError(f"YAML 元数据解析失败: {str(e)}")
    raise ValueError("SKILL.md 格式不正确，缺少 YAML frontmatter 元数据区块 (以 --- 包裹)")

def validate_zip(zip_bytes: bytes) -> dict:
    import io
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            files = z.namelist()
            skill_md_path = None
            for f in files:
                if f == "SKILL.md" or (f.endswith("/SKILL.md") and f.count("/") == 1):
                    skill_md_path = f
                    break
            
            if not skill_md_path:
                raise ValueError("ZIP 压缩包中缺少 SKILL.md 元数据文件")
                
            prefix = ""
            if "/" in skill_md_path:
                prefix = skill_md_path.split("/")[0] + "/"
                
            with z.open(skill_md_path) as f:
                content = f.read().decode("utf-8")
            meta = parse_frontmatter(content)
            name = meta.get("name")
            if not name or not name.strip():
                raise ValueError("SKILL.md Frontmatter 中必须包含 'name' 字段")
            
            import hashlib
            skill_id = "skill_" + hashlib.md5(name.strip().encode("utf-8")).hexdigest()[:16]
            meta["id"] = skill_id
                
            if meta.get("tools") and len(meta["tools"]) > 0:
                main_py_path = f"{prefix}main.py"
                if main_py_path not in files:
                    raise ValueError("此技能定义了可执行工具 (tools)，ZIP 压缩包中必须包含 main.py 作为执行入口文件")
            return meta
    except zipfile.BadZipFile:
        raise ValueError("非法的 ZIP 文件格式")

def get_all_skills(db: Session) -> list[AgentSkillRow]:
    return db.query(AgentSkillRow).all()

def get_active_skills(db: Session) -> list[AgentSkillRow]:
    return db.query(AgentSkillRow).filter(AgentSkillRow.is_global_enabled == True).all()

def create_custom_skill(db: Session, skill_id: str, name: str, description: str, minio_key: str) -> AgentSkillRow:
    now = int(time.time() * 1000)
    row = AgentSkillRow(
        id=skill_id,
        name=name,
        description=description,
        minio_key=minio_key,
        is_global_enabled=True,
        created_at=now,
        updated_at=now
    )
    db.merge(row)
    db.commit()
    return row

def delete_custom_skill(db: Session, skill_id: str):
    row = db.query(AgentSkillRow).filter(AgentSkillRow.id == skill_id).first()
    if row:
        try:
            minio_storage.delete_object(row.minio_key)
        except Exception:
            pass
        db.delete(row)
        db.commit()
    # Clean local cache
    local_path = SKILLS_DIR / skill_id
    if local_path.exists():
        try:
            shutil.rmtree(local_path)
        except Exception:
            pass

def toggle_skill_status(db: Session, skill_id: str, is_enabled: bool) -> AgentSkillRow:
    row = db.query(AgentSkillRow).filter(AgentSkillRow.id == skill_id).first()
    if not row:
        raise ValueError("未找到指定的技能")
    row.is_global_enabled = is_enabled
    row.updated_at = int(time.time() * 1000)
    db.commit()
    return row

def load_skill_module(skill_id: str, minio_key: str):
    local_dir = SKILLS_DIR / skill_id
    local_dir.mkdir(parents=True, exist_ok=True)
    main_path = local_dir / "main.py"
    
    # Check if files need extraction
    if not (local_dir / "SKILL.md").exists():
        zip_data = minio_storage.get_bytes(minio_key)
        if not zip_data:
            raise FileNotFoundError(f"MinIO key not found: {minio_key}")
        import io
        with zipfile.ZipFile(io.BytesIO(zip_data)) as z:
            files = z.namelist()
            skill_md_path = None
            for f in files:
                if f == "SKILL.md" or (f.endswith("/SKILL.md") and f.count("/") == 1):
                    skill_md_path = f
                    break
            
            prefix = ""
            if skill_md_path and "/" in skill_md_path:
                prefix = skill_md_path.split("/")[0] + "/"
                
            for member in z.infolist():
                if member.is_dir():
                    continue
                filename = member.filename
                if prefix and filename.startswith(prefix):
                    filename = filename[len(prefix):]
                if not filename:
                    continue
                
                target_path = local_dir / filename
                target_path.parent.mkdir(parents=True, exist_ok=True)
                with z.open(member) as source, open(target_path, "wb") as target:
                    shutil.copyfileobj(source, target)
            
    if not main_path.exists():
        raise FileNotFoundError(f"自定义技能 {skill_id} 中缺少执行入口文件 main.py")
            
    # Add local dir to sys.path so imports inside the skill works
    local_dir_str = str(local_dir.resolve())
    if local_dir_str not in sys.path:
        sys.path.insert(0, local_dir_str)
        
    module_name = f"custom_skill_{skill_id}"
    
    # Modern importlib logic to load and cache module
    if module_name in sys.modules:
        return sys.modules[module_name]
        
    spec = importlib.util.spec_from_file_location(module_name, str(main_path))
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load spec from {main_path}")
        
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module

async def run_custom_tool(skill_id: str, minio_key: str, tool_name: str, args: dict) -> str:
    import asyncio
    module = load_skill_module(skill_id, minio_key)
    func = getattr(module, tool_name, None)
    if not func:
        raise AttributeError(f"自定义技能 {skill_id} 中未找到工具函数 {tool_name}")
    if asyncio.iscoroutinefunction(func):
        return await func(args)
    else:
        return func(args)
