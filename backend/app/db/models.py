"""PostgreSQL 主库表模型（用户、创作历史、公共画廊）。"""

from __future__ import annotations

import json

from sqlalchemy import BigInteger, Index, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class UserRow(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)


class UserFollowRow(Base):
    __tablename__ = "user_follows"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    follower_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    following_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)

    __table_args__ = (
        Index("ix_user_follows_pair", "follower_id", "following_id", unique=True),
    )


class CreateHistoryItemRow(Base):
    __tablename__ = "create_history_items"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    prompt: Mapped[str] = mapped_column(Text, default="", nullable=False)
    media_type: Mapped[str] = mapped_column(String(16), default="image", nullable=False)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    preview_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    job_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="DONE", nullable=False)
    model_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    session_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    parent_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    aspect_ratio: Mapped[str | None] = mapped_column(String(32), nullable=True)
    edit_action: Mapped[str | None] = mapped_column(String(64), nullable=True)
    storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    reference_urls: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (Index("ix_create_history_user_created", "user_id", "created_at"),)

    @property
    def reference_urls_list(self) -> list[str]:
        if not self.reference_urls:
            return []
        try:
            parsed = json.loads(self.reference_urls)
            if isinstance(parsed, list):
                return [str(u) for u in parsed if u]
        except (json.JSONDecodeError, TypeError):
            pass
        return []


class PublicGalleryItemRow(Base):
    __tablename__ = "public_gallery_items"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    published_by: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    prompt: Mapped[str] = mapped_column(Text, default="", nullable=False)
    title: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    media_type: Mapped[str] = mapped_column(String(16), default="image", nullable=False)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    preview_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="DONE", nullable=False)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    aspect_ratio: Mapped[str | None] = mapped_column(String(32), nullable=True)
    storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)


class AgentSkillRow(Base):
    __tablename__ = "agent_skills"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    minio_key: Mapped[str] = mapped_column(String(512), nullable=False)
    is_global_enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[int] = mapped_column(BigInteger, nullable=False)


class UserAgentRow(Base):
    __tablename__ = "user_agents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    avatar: Mapped[str] = mapped_column(String(128), nullable=False)
    bundle: Mapped[str] = mapped_column(Text, nullable=False) # JSON serialized AgentConfigBundle
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[int] = mapped_column(BigInteger, nullable=False)



