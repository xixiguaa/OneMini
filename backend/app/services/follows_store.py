"""用户关注关系。"""

from __future__ import annotations

import time
from typing import Any

from sqlalchemy import func, select

from app.db.models import UserFollowRow, UserRow
from app.db.session import get_session


def _now_ms() -> int:
    return int(time.time() * 1000)


def _ensure_user_exists(user_id: str) -> None:
    with get_session() as session:
        if not session.get(UserRow, user_id):
            raise ValueError("用户不存在")


def follow(follower_id: str, following_id: str) -> dict[str, Any]:
    follower_id = (follower_id or "").strip()
    following_id = (following_id or "").strip()
    if not follower_id or not following_id:
        raise ValueError("用户无效")
    if follower_id == following_id:
        raise ValueError("不能关注自己")

    _ensure_user_exists(following_id)

    with get_session() as session:
        existing = session.scalar(
            select(UserFollowRow.id).where(
                UserFollowRow.follower_id == follower_id,
                UserFollowRow.following_id == following_id,
            ).limit(1)
        )
        if existing:
            return get_follow_stats(following_id, viewer_id=follower_id)

        row = UserFollowRow(
            follower_id=follower_id,
            following_id=following_id,
            created_at=_now_ms(),
        )
        session.add(row)
        session.flush()

    return get_follow_stats(following_id, viewer_id=follower_id)


def unfollow(follower_id: str, following_id: str) -> dict[str, Any]:
    follower_id = (follower_id or "").strip()
    following_id = (following_id or "").strip()
    if not follower_id or not following_id:
        raise ValueError("用户无效")
    if follower_id == following_id:
        raise ValueError("不能取消关注自己")

    with get_session() as session:
        row = session.scalar(
            select(UserFollowRow).where(
                UserFollowRow.follower_id == follower_id,
                UserFollowRow.following_id == following_id,
            ).limit(1)
        )
        if row:
            session.delete(row)
            session.flush()

    return get_follow_stats(following_id, viewer_id=follower_id)


def is_following(follower_id: str, following_id: str) -> bool:
    follower_id = (follower_id or "").strip()
    following_id = (following_id or "").strip()
    if not follower_id or not following_id or follower_id == following_id:
        return False
    with get_session() as session:
        return session.scalar(
            select(UserFollowRow.id).where(
                UserFollowRow.follower_id == follower_id,
                UserFollowRow.following_id == following_id,
            ).limit(1)
        ) is not None


def _count_followers(session, user_id: str) -> int:
    return int(
        session.scalar(
            select(func.count())
            .select_from(UserFollowRow)
            .where(UserFollowRow.following_id == user_id)
        )
        or 0
    )


def _count_following(session, user_id: str) -> int:
    return int(
        session.scalar(
            select(func.count())
            .select_from(UserFollowRow)
            .where(UserFollowRow.follower_id == user_id)
        )
        or 0
    )


def get_follow_stats(user_id: str, viewer_id: str | None = None) -> dict[str, Any]:
    user_id = (user_id or "").strip()
    if not user_id:
        raise ValueError("用户无效")

    with get_session() as session:
        if not session.get(UserRow, user_id):
            raise ValueError("用户不存在")
        follower_count = _count_followers(session, user_id)
        following_count = _count_following(session, user_id)
        is_following_viewer = False
        if viewer_id and viewer_id.strip() and viewer_id != user_id:
            is_following_viewer = session.scalar(
                select(UserFollowRow.id).where(
                    UserFollowRow.follower_id == viewer_id.strip(),
                    UserFollowRow.following_id == user_id,
                ).limit(1)
            ) is not None

    return {
        "userId": user_id,
        "followerCount": follower_count,
        "followingCount": following_count,
        "isFollowing": is_following_viewer,
    }
