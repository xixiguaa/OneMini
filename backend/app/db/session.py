"""PostgreSQL 连接与会话（凭证仅从环境变量 / Settings 读取）。"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator
from urllib.parse import quote_plus

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings, get_settings
from app.db.models import Base

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def build_database_url(settings: Settings) -> str:
    if settings.database_url.strip():
        return settings.database_url.strip()
    password = settings.db_password
    if not password:
        raise ValueError(
            "未配置数据库密码：请设置 DATABASE_URL 或 DB_PASSWORD（勿写入代码，使用 .env）"
        )
    user = quote_plus(settings.db_user)
    pwd = quote_plus(password)
    host = settings.db_host
    port = settings.db_port
    name = settings.db_name
    return f"postgresql+psycopg2://{user}:{pwd}@{host}:{port}/{name}"


def get_engine(settings: Settings | None = None) -> Engine:
    global _engine, _SessionLocal
    if _engine is not None:
        return _engine
    settings = settings or get_settings()
    url = build_database_url(settings)
    _engine = create_engine(
        url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )
    _SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
    return _engine


def get_session_factory(settings: Settings | None = None) -> sessionmaker[Session]:
    get_engine(settings)
    assert _SessionLocal is not None
    return _SessionLocal


@contextmanager
def get_session(settings: Settings | None = None) -> Iterator[Session]:
    factory = get_session_factory(settings)
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db(settings: Settings | None = None) -> None:
    engine = get_engine(settings)
    Base.metadata.create_all(bind=engine)


def ping_postgres(settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    try:
        if not settings.database_url.strip() and not settings.db_password:
            return {
                "ok": False,
                "error": "未配置 DB_PASSWORD 或 DATABASE_URL",
            }
        with get_engine(settings).connect() as conn:
            row = conn.execute(text("SELECT version()")).scalar()
        return {
            "ok": True,
            "host": settings.db_host,
            "port": settings.db_port,
            "database": settings.db_name,
            "version": str(row)[:120] if row else None,
        }
    except Exception as exc:
        return {
            "ok": False,
            "host": settings.db_host,
            "port": settings.db_port,
            "database": settings.db_name,
            "error": str(exc),
        }
