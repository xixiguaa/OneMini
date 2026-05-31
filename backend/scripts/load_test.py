#!/usr/bin/env python3
"""OneMini 平台 API 并发压测（本地/CI 可运行）。

示例:
  python scripts/load_test.py --users 100 --requests 5
  python scripts/load_test.py --base http://127.0.0.1:8000 --users 100
"""

from __future__ import annotations

import argparse
import asyncio
import statistics
import time
import uuid
from dataclasses import dataclass, field

import httpx

DEFAULT_BASE = "http://127.0.0.1:8000"
PREFIX = "/api/platform"


@dataclass
class RequestResult:
    ok: bool
    status: int
    latency_ms: float
    error: str = ""


@dataclass
class ScenarioStats:
    name: str
    total: int = 0
    ok: int = 0
    latencies_ms: list[float] = field(default_factory=list)
    errors: dict[str, int] = field(default_factory=dict)

    def add(self, r: RequestResult) -> None:
        self.total += 1
        self.latencies_ms.append(r.latency_ms)
        if r.ok:
            self.ok += 1
        else:
            key = r.error or f"HTTP {r.status}"
            self.errors[key] = self.errors.get(key, 0) + 1

    def report(self) -> str:
        if not self.latencies_ms:
            return f"  {self.name}: 无请求"
        lat = sorted(self.latencies_ms)
        p50 = lat[len(lat) // 2]
        p95 = lat[int(len(lat) * 0.95)] if len(lat) > 1 else lat[0]
        p99 = lat[int(len(lat) * 0.99)] if len(lat) > 1 else lat[0]
        err_lines = ""
        if self.errors:
            err_lines = "\n    错误: " + ", ".join(f"{k}×{v}" for k, v in self.errors.items())
        return (
            f"  {self.name}: {self.ok}/{self.total} 成功 ({100 * self.ok / self.total:.1f}%)\n"
            f"    延迟 ms — min={min(lat):.0f} p50={p50:.0f} p95={p95:.0f} p99={p99:.0f} max={max(lat):.0f}"
            f"{err_lines}"
        )


async def one_request(
    client: httpx.AsyncClient,
    method: str,
    path: str,
    *,
    headers: dict[str, str] | None = None,
) -> RequestResult:
    url = f"{PREFIX}{path}"
    t0 = time.perf_counter()
    try:
        resp = await client.request(method, url, headers=headers)
        ms = (time.perf_counter() - t0) * 1000
        ok = 200 <= resp.status_code < 300
        err = ""
        if not ok:
            err = (resp.text or "")[:120]
        return RequestResult(ok=ok, status=resp.status_code, latency_ms=ms, error=err)
    except Exception as exc:
        ms = (time.perf_counter() - t0) * 1000
        return RequestResult(ok=False, status=0, latency_ms=ms, error=type(exc).__name__)


async def user_session(
    client: httpx.AsyncClient,
    user_index: int,
    requests_per_user: int,
    stats: dict[str, ScenarioStats],
) -> None:
    uid = f"loadtest-{user_index:04d}-{uuid.uuid4().hex[:8]}"
    headers = {"X-User-Id": uid}

    for _ in range(requests_per_user):
        for name, method, path, hdrs in (
            ("health-live", "GET", "/health/live", None),
            ("create-history-list", "GET", "/create-history", headers),
            ("conversations-list", "GET", "/conversations", headers),
        ):
            r = await one_request(client, method, path, headers=hdrs)
            stats[name].add(r)


async def burst_create_history_writes(
    client: httpx.AsyncClient,
    writers: int,
    stats: ScenarioStats,
) -> None:
    """同一用户并发写入，检测 JSON 文件竞态。"""

    uid = f"loadtest-write-race-{uuid.uuid4().hex[:8]}"
    headers = {"X-User-Id": uid, "Content-Type": "application/json"}

    async def post_one(i: int) -> RequestResult:
        body = {
            "id": str(uuid.uuid4()),
            "prompt": f"并发写入 #{i}",
            "type": "image",
            "url": "https://example.com/placeholder.png",
            "status": "DONE",
            "createdAt": int(time.time() * 1000) + i,
        }
        t0 = time.perf_counter()
        try:
            resp = await client.post(f"{PREFIX}/create-history", json=body, headers=headers)
            ms = (time.perf_counter() - t0) * 1000
            ok = resp.status_code in (200, 201)
            err = "" if ok else (resp.text or "")[:120]
            return RequestResult(ok=ok, status=resp.status_code, latency_ms=ms, error=err)
        except Exception as exc:
            ms = (time.perf_counter() - t0) * 1000
            return RequestResult(ok=False, status=0, latency_ms=ms, error=type(exc).__name__)

    results = await asyncio.gather(*[post_one(i) for i in range(writers)])
    for r in results:
        stats.add(r)

    # 校验最终条数
    list_resp = await client.get(f"{PREFIX}/create-history", headers=headers)
    if list_resp.status_code == 200:
        n = len(list_resp.json().get("items") or [])
        if n != writers:
            stats.add(
                RequestResult(
                    ok=False,
                    status=200,
                    latency_ms=0,
                    error=f"写入丢失: 期望 {writers} 条, 实际 {n} 条",
                )
            )


async def run_load_test(
    base_url: str,
    users: int,
    requests_per_user: int,
    write_race: int,
    timeout: float,
) -> int:
    limits = httpx.Limits(max_connections=users * 4, max_keepalive_connections=users * 2)
    stats: dict[str, ScenarioStats] = {
        "health-live": ScenarioStats("GET /health/live"),
        "create-history-list": ScenarioStats("GET /create-history"),
        "conversations-list": ScenarioStats("GET /conversations"),
    }
    write_stats = ScenarioStats(f"POST /create-history 竞态×{write_race}")

    async with httpx.AsyncClient(
        base_url=base_url,
        timeout=timeout,
        limits=limits,
    ) as client:
        t0 = time.perf_counter()
        await asyncio.gather(
            *[user_session(client, i, requests_per_user, stats) for i in range(users)]
        )
        elapsed_read = time.perf_counter() - t0

        t1 = time.perf_counter()
        await burst_create_history_writes(client, write_race, write_stats)
        elapsed_write = time.perf_counter() - t1

    total_read = sum(s.total for s in stats.values())
    ok_read = sum(s.ok for s in stats.values())

    print(f"\n=== OneMini 压测 base={base_url} ===")
    print(f"模拟用户: {users}，每用户每接口 {requests_per_user} 次")
    print(f"读压测总请求: {total_read}，耗时 {elapsed_read:.2f}s，约 {total_read / elapsed_read:.0f} req/s")
    for s in stats.values():
        print(s.report())

    print(f"\n写压测: {write_stats.report()}（耗时 {elapsed_write:.2f}s）")

    read_pass = ok_read == total_read
    write_pass = write_stats.ok == write_stats.total
    print("\n--- 结论 ---")
    if read_pass and write_pass:
        print(f"✓ 读接口 {users} 并发通过；创作历史并发写入无丢失")
        return 0
    if not read_pass:
        print(f"✗ 读接口失败 {total_read - ok_read}/{total_read}")
    if not write_pass:
        print(f"✗ 写接口/数据完整性未通过")
    return 1


def main() -> None:
    p = argparse.ArgumentParser(description="OneMini API 并发压测")
    p.add_argument("--base", default=DEFAULT_BASE, help="后端根地址")
    p.add_argument("--users", type=int, default=100, help="并发用户数")
    p.add_argument("--requests", type=int, default=3, help="每用户每接口请求次数")
    p.add_argument("--write-race", type=int, default=50, help="同用户并发 POST 条数")
    p.add_argument("--timeout", type=float, default=30.0, help="单请求超时秒")
    args = p.parse_args()

    raise SystemExit(
        asyncio.run(
            run_load_test(
                args.base.rstrip("/"),
                args.users,
                args.requests,
                args.write_race,
                args.timeout,
            )
        )
    )


if __name__ == "__main__":
    main()
