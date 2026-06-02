from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db.session import init_db, ping_postgres
from app.routers import agent, auth, chat, conversations, create_history, health, knowledge, secrets, wiki
from app.services.chat_store import _get_chat_collection
from app.services.legacy_data_import import run_legacy_import_if_needed
from app.services.milvus_store import connect_milvus, disconnect_milvus, ping_milvus
from app.services.minio_storage import ensure_bucket, ping_minio


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()

    pg = ping_postgres(settings)
    if pg.get("ok"):
        init_db(settings)
        print(f"✓ PostgreSQL 已连接 {settings.db_host}:{settings.db_port}/{settings.db_name}")
        minio_status = ping_minio(settings)
        if minio_status.get("ok"):
            ensure_bucket(settings)
            print(f"✓ MinIO 已连接 {settings.minio_endpoint} bucket={settings.minio_bucket}")
        else:
            print(f"⚠ MinIO 未连接: {minio_status.get('error')}")
        try:
            migrated = run_legacy_import_if_needed()
            if any(migrated.values()):
                print(f"✓ 已从本地 JSON 迁移: {migrated}")
        except Exception as exc:
            print(f"⚠ 本地数据迁移失败: {exc}")
    else:
        print(f"⚠ PostgreSQL 未连接: {pg.get('error')}（请配置 backend/.env 中的 DB_PASSWORD）")

    status = ping_milvus(settings)
    if status.get("ok"):
        print(f"✓ Milvus 已连接 {settings.milvus_host}:{settings.milvus_port} ({status.get('version')})")
        connect_milvus(settings)
        try:
            _get_chat_collection(settings)
            print(f"✓ 对话集合 {settings.milvus_chat_collection} 已就绪（Attu 可查看）")
        except Exception as exc:
            print(f"⚠ 对话集合初始化失败: {exc}")
    else:
        print(f"⚠ Milvus 未连接: {status.get('error')}")
    yield
    disconnect_milvus()


app = FastAPI(
    title="OneMini Platform API",
    description="Python 后端：PostgreSQL + MinIO + Milvus（RAG/对话记忆）",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/platform"
app.include_router(health.router, prefix=API_PREFIX)
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(secrets.router, prefix=API_PREFIX)
app.include_router(agent.router, prefix=API_PREFIX)
app.include_router(knowledge.router, prefix=API_PREFIX)
app.include_router(chat.router, prefix=API_PREFIX)
app.include_router(conversations.router, prefix=API_PREFIX)
app.include_router(create_history.router, prefix=API_PREFIX)
app.include_router(wiki.router, prefix=API_PREFIX)


@app.get("/")
def root():
    return {
        "name": "OneMini Platform API",
        "docs": "/docs",
        "health": f"{API_PREFIX}/health",
    }
