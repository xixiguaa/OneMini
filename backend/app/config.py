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

    jwt_secret: str = "onemini-dev-jwt-change-in-production"
    jwt_expire_seconds: int = 60 * 60 * 24 * 7  # 7 天

    milvus_host: str = "127.0.0.1"
    milvus_port: int = 19530
    milvus_collection: str = "onemini_knowledge"
    milvus_chat_collection: str = "onemini_chat"

    embedding_model: str = "BAAI/bge-small-zh-v1.5"

    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    chat_model: str = "gpt-4o-mini"

    # 用户模型密钥保险库（加密文件，权限建议 600）
    secrets_file: str = "data/secrets.vault"
    secrets_master_key: str = ""

    rag_top_k: int = 5
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
