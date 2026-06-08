from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    host: str = "0.0.0.0"
    port: int = 8000

    # PostgreSQL 主库（密码仅通过环境变量 / .env，勿硬编码）
    database_url: str = ""
    db_host: str = "127.0.0.1"
    db_port: int = 5432
    db_user: str = "postgres"
    db_password: str = ""
    db_name: str = "onemini"

    # MinIO 对象存储（创作/画廊媒体）
    minio_endpoint: str = "127.0.0.1:9000"
    minio_access_key: str = ""
    minio_secret_key: str = ""
    minio_bucket: str = "onemini"
    minio_secure: bool = False
    minio_region: str = ""

    jwt_secret: str = "onemini-dev-jwt-change-in-production"
    jwt_expire_seconds: int = 60 * 60 * 24 * 7  # 7 天

    milvus_host: str = "127.0.0.1"
    milvus_port: int = 19530
    milvus_collection: str = "onemini_knowledge_bgem3"
    milvus_chat_collection: str = "onemini_chat_bgem3"

    embedding_model: str = "BAAI/bge-m3"
    embedding_max_length: int = 8192
    embedding_batch_size: int = 12
    embedding_use_fp16: bool = False
    embedding_device: str = ""  # 空=自动；可填 cpu / cuda:0

    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    chat_model: str = "gpt-4o-mini"

    # 用户模型密钥保险库（加密文件，权限建议 600）
    secrets_file: str = "data/secrets.vault"
    secrets_master_key: str = ""

    rag_top_k: int = 5
    rag_recall_k: int = 20
    rag_rerank_enabled: bool = True
    rerank_model: str = "Qwen/Qwen3-Reranker-0.6B"
    rerank_batch_size: int = 8
    chunk_size: int = 500
    chunk_overlap: int = 80

    # LLM-Wiki（Markdown 知识图谱，与 Milvus 无关）
    llm_wiki_path: str = ""
    wiki_ingest_max_chars: int = 24_000
    wiki_ingest_concurrency: int = 1
    # 与前端内置预设 deepseek-v4-pro 对齐
    wiki_ingest_model_config_id: str = "deepseek-v4-pro"
    wiki_ingest_provider: str = "deepseek"
    wiki_ingest_model: str = "deepseek-chat"
    wiki_ingest_base_url: str = ""
    wiki_ingest_retries: int = 3
    wiki_ingest_retry_delay_sec: float = 2.0
    wiki_query_top_k: int = 6
    wiki_archive_after_ingest: bool = True
    # ingest 冲突：ask=记入 .ingest-conflicts.json 待用户选；overwrite=自动覆盖
    wiki_ingest_conflict_policy: str = "ask"

    # MCP Client（Agent 可调用的外部 MCP Server，JSON 数组，见 .env.example）
    mcp_enabled: bool = False
    mcp_servers: str = "[]"
    mcp_max_tool_rounds: int = 6
    mcp_tool_call_timeout_sec: float = 60.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
