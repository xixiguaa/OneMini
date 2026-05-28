from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import agent, chat, conversations, health, knowledge, secrets, wiki
from app.services.chat_store import _get_chat_collection
from app.services.milvus_store import connect_milvus, disconnect_milvus, ping_milvus


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
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
    description="Python 后端：Milvus 向量库 + RAG 知识问答",
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
app.include_router(secrets.router, prefix=API_PREFIX)
app.include_router(agent.router, prefix=API_PREFIX)
app.include_router(knowledge.router, prefix=API_PREFIX)
app.include_router(chat.router, prefix=API_PREFIX)
app.include_router(conversations.router, prefix=API_PREFIX)
app.include_router(wiki.router, prefix=API_PREFIX)


@app.get("/")
def root():
    return {
        "name": "OneMini Platform API",
        "docs": "/docs",
        "health": f"{API_PREFIX}/health",
    }
