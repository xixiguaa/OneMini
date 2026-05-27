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


@lru_cache
def get_settings() -> Settings:
    return Settings()
