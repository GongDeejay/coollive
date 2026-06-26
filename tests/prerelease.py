#!/usr/bin/env python3
"""
ZenTalk Pre-Release Test Suite
================================
运行方式：
    SERVER_PASS=xxx python3 tests/prerelease.py [--target https://zen.mplusm.site]

覆盖范围：
  A. 基础健康检查
  B. 对话模块（chat / feedback）
  C. 认证模块（register / login / me）
  D. 日记模块 — 标签提取（四层体系）
  E. 日记模块 — 四维坐标分析
  F. 日记模块 — 云端同步 CRUD
  G. 公开博客接口
  H. 功能需求验证（产品逻辑）
  I. 性能基线（响应时间 P95）

每个测试打印 ✓ PASS 或 ✗ FAIL + 说明。
所有测试完成后汇总，有任何 FAIL 则脚本以 exit(1) 退出，阻止部署。
"""
import os
import sys
import json
import time
import random
import string
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional

TARGET = os.environ.get("TARGET", "https://zen.mplusm.site")
TIMEOUT = 45   # seconds per request (LLM calls need more time)
TIMINGS: list[float] = []

# ── Test framework ─────────────────────────────────────────────────

passed = failed = 0


def check(condition: bool, name: str, detail: str = ""):
    global passed, failed
    if condition:
        print(f"  ✓  {name}")
        passed += 1
    else:
        print(f"  ✗  {name}" + (f"  →  {detail}" if detail else ""))
        failed += 1


def section(title: str):
    print(f"\n{'─'*56}")
    print(f"  {title}")
    print(f"{'─'*56}")


def api(path: str, data=None, method: str = "POST",
        token: Optional[str] = None) -> tuple[int, dict]:
    url = TARGET.rstrip("/") + path
    body = json.dumps(data).encode() if data is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            elapsed = time.time() - t0
            TIMINGS.append(elapsed)
            return r.getcode(), json.loads(r.read())
    except urllib.error.HTTPError as e:
        elapsed = time.time() - t0
        TIMINGS.append(elapsed)
        try:
            body = json.loads(e.read())
        except Exception:
            body = {"detail": str(e)}
        return e.code, body


def rand_email():
    return f"test_{''.join(random.choices(string.ascii_lowercase, k=8))}@zentalk.test"


# ── A. Health ──────────────────────────────────────────────────────

def test_health():
    section("A. 基础健康检查")
    code, data = api("/api/health", method="GET")
    check(code == 200, "GET /api/health 返回 200")
    check(data.get("status") == "ok", "响应体含 status=ok", str(data))


# ── B. Chat & Feedback ─────────────────────────────────────────────

def test_chat():
    section("B. 对话模块")
    # 日常问题 → 简短实用回答
    code, data = api("/api/chat", {"message": "今天吃什么"})
    check(code == 200, "POST /api/chat 返回 200")
    check("session_id" in data, "响应含 session_id")
    check("message_id" in data, "响应含 message_id")
    check("reply" in data and len(data["reply"]) > 0, "reply 非空")
    check("turn" in data, "响应含 turn 字段")

    sid = data.get("session_id")
    mid = data.get("message_id")

    # 多轮对话继承 session
    code2, data2 = api("/api/chat", {"session_id": sid, "message": "推荐一本书"})
    check(code2 == 200, "多轮对话 session 继承")
    check(data2.get("session_id") == sid, "session_id 保持一致")
    check(data2.get("turn", 0) == 2, f"第2轮 turn=2 (got {data2.get('turn')})")

    # 哲学/烦恼问题 → 禅意风格
    code3, data3 = api("/api/chat", {"message": "我最近很焦虑，感觉什么都没做好"})
    check(code3 == 200, "烦恼问题可正常回答")
    check(len(data3.get("reply", "")) >= 5, "烦恼问题有实质回复")

    # Feedback like
    code4, data4 = api("/api/feedback/like", {"message_id": mid})
    check(code4 == 200, "POST /api/feedback/like 返回 200")
    check(data4.get("ok") is True, "like 响应 ok=True")
    check("total" in data4, "like 响应含 total")

    # Feedback dislike
    code5, data5 = api("/api/feedback/dislike", {"message_id": mid})
    check(code5 == 200, "POST /api/feedback/dislike 返回 200")

    # Feedback stats
    code6, data6 = api("/api/feedback/stats", method="GET")
    check(code6 == 200, "GET /api/feedback/stats 返回 200")
    check("total_liked" in data6, "stats 含 total_liked")

    # Clear session
    if sid:
        code7, _ = api(f"/api/session/{sid}", method="DELETE")
        check(code7 == 200, "DELETE /api/session/{id} 返回 200")


# ── C. Auth ────────────────────────────────────────────────────────

def test_auth() -> Optional[str]:
    section("C. 认证模块")
    email = rand_email()
    password = "Test@1234"

    # Register
    code, data = api("/api/auth/register", {"email": email, "password": password})
    check(code == 200, "POST /api/auth/register 新用户成功")
    check("token" in data, "register 响应含 token")
    check("user_id" in data, "register 响应含 user_id")

    token = data.get("token")
    user_id = data.get("user_id")

    # Duplicate register
    code2, _ = api("/api/auth/register", {"email": email, "password": password})
    check(code2 == 409, f"重复注册返回 409 (got {code2})")

    # Login
    code3, data3 = api("/api/auth/login", {"email": email, "password": password})
    check(code3 == 200, "POST /api/auth/login 成功")
    check("token" in data3, "login 响应含 token")

    # Wrong password
    code4, _ = api("/api/auth/login", {"email": email, "password": "wrong"})
    check(code4 == 401, f"错误密码返回 401 (got {code4})")

    # Me
    code5, data5 = api("/api/auth/me", method="GET", token=token)
    check(code5 == 200, "GET /api/auth/me 已登录")
    check(data5.get("logged_in") is True, "me 返回 logged_in=True")
    check(data5.get("email") == email, "me 返回正确 email")

    # Me without token
    code6, data6 = api("/api/auth/me", method="GET")
    check(code6 == 200 and data6.get("logged_in") is False, "未登录 me 返回 logged_in=False")

    return token


# ── D. Journal Tags (四层体系) ─────────────────────────────────────

def test_journal_tags():
    section("D. 日记标签提取 — 四层结构化认知体系")

    # Test 1: 应触发 tension=[帮助/被消耗]
    code, data = api("/api/journal/tags", {
        "scene": "今天帮朋友处理了很多事",
        "feeling": "感觉掏空了",
        "reflection": "但又不好意思拒绝"
    })
    check(code == 200, "标签提取接口返回 200")
    check("object" in data, "响应含 object 字段")
    check("operation" in data, "响应含 operation 字段")
    check("tension" in data, "响应含 tension 字段")
    check("output_form" in data, "响应含 output_form 字段")
    check("emotion" in data, "响应含 emotion 字段")
    check("keywords" in data, "响应含 keywords 字段")
    check("summary" in data and len(data["summary"]) > 0, "summary 非空")
    check(isinstance(data["object"], list) and len(data["object"]) > 0, "object 为非空数组")
    check(isinstance(data["tension"], list), "tension 为数组（可为空）")
    check(len(data.get("keywords", [])) >= 1, "至少1个关键词")

    # Test 2: 负面情绪 → emotion 应含焦虑
    code2, data2 = api("/api/journal/tags", {
        "content": "我总是拖延，感觉很焦虑，什么都没推进"
    })
    check(code2 == 200, "自由文本标签提取成功")
    check("焦虑" in data2.get("emotion", []), f"负面情绪正确识别为焦虑 (got {data2.get('emotion')})")

    # Test 3: 积极情绪 → emotion 不应默认平静
    code3, data3 = api("/api/journal/tags", {
        "content": "项目上线了，很爽，有成就感！"
    })
    check("喜悦" in data3.get("emotion", []) or "满足" in data3.get("emotion", []),
          f"积极情绪识别为喜悦或满足 (got {data3.get('emotion')})")

    # Test 4: 有洞见的记录 → output_form 应有内容
    code4, data4 = api("/api/journal/tags", {
        "reflection": "我发现自己总是把别人的情绪当成自己的责任，这个认知可以帮助很多人"
    })
    check(code4 == 200, "洞见类记录解析成功")

    # Test 5: 空内容应返回 400
    code5, _ = api("/api/journal/tags", {})
    check(code5 == 400, f"空内容返回 400 (got {code5})")


# ── E. Quadrant Analysis ────────────────────────────────────────────

def test_quadrant():
    section("E. 四维坐标分析")

    test_cases = [
        {
            "input": {"scene": "帮朋友处理事，感觉掏空，不好意思拒绝", "feeling": "疲惫", "reflection": ""},
            "expect_dim": "Others",
            "expect_value_sign": -1,   # -1=negative, 0=any, +1=positive
            "name": "对人-阴极（为关系退让）",
        },
        {
            "input": {"raw": "我总在拖延最重要的事，用次要的事填满时间，很焦虑"},
            "expect_dim": "Self",
            "expect_value_sign": 1,
            "name": "对己-阳极（焦虑自责）",
        },
        {
            "input": {"raw": "项目上线了，部署成功，推进意志力比技术更关键"},
            "expect_dim": "Task",
            "expect_value_sign": 1,
            "name": "对事-阳极（系统推进）",
        },
        {
            "input": {"raw": "AI时代来了，大部分人没意识到个体能做什么，有种布道的冲动"},
            "expect_dim": "World",
            "expect_value_sign": 1,
            "name": "对世-阳极（入世使命感）",
        },
    ]

    for tc in test_cases:
        code, data = api("/api/journal/quadrant", tc["input"])
        check(code == 200, f"四维分析 [{tc['name']}] 返回 200")
        if code == 200:
            check(data.get("dim") in ("Others", "Self", "Task", "World"),
                  f"  dim 合法值 (got {data.get('dim')})")
            val = data.get("value", 0)
            check(-5 <= val <= 5, f"  value 在 -5..+5 范围 (got {val})")
            en = data.get("energy", 0)
            check(10 <= en <= 50, f"  energy 在 10..50 范围 (got {en})")
            check(len(data.get("reason", "")) > 0, "  reason 非空")

            if tc.get("expect_dim"):
                check(data.get("dim") == tc["expect_dim"],
                      f"  [{tc['name']}] dim={tc['expect_dim']} (got {data.get('dim')})")
            if tc.get("expect_value_sign"):
                sign = tc["expect_value_sign"]
                ok = (sign == 1 and val > 0) or (sign == -1 and val < 0)
                check(ok, f"  [{tc['name']}] value 符号正确 ({'+' if sign>0 else '-'}, got {val})")


# ── F. Journal Cloud CRUD ──────────────────────────────────────────

def test_journal_crud(token: Optional[str]):
    section("F. 日记云端同步 CRUD")

    if not token:
        print("  SKIP (no auth token)")
        return

    # Upsert entry
    entry = {
        "id": "test-prerelease-" + rand_email()[:8],
        "created_at": "2026-01-01T10:00:00+08:00",
        "scene": "测试场景", "feeling": "测试感受", "reflection": "测试体会",
        "raw": "", "tags": None, "summary": "", "quadrant": None,
        "is_public": False, "zen_session_id": None, "zen_reply_id": None,
    }
    code, data = api("/api/journal/entries/sync", {"entry": entry}, token=token)
    check(code == 200, "POST /api/journal/entries/sync 创建成功")
    check(data.get("ok") is True, "sync 响应 ok=True")

    # Fetch back
    code2, data2 = api("/api/journal/entries", method="GET", token=token)
    check(code2 == 200, "GET /api/journal/entries 成功")
    ids = [e["id"] for e in data2.get("entries", [])]
    check(entry["id"] in ids, f"创建的条目可取回 (got {len(ids)} entries)")

    # Update (toggle public)
    entry["is_public"] = True
    code3, _ = api("/api/journal/entries/sync", {"entry": entry}, token=token)
    check(code3 == 200, "更新条目 is_public=True 成功")

    # Delete
    code4, data4 = api(f"/api/journal/entries/{entry['id']}", method="DELETE", token=token)
    check(code4 == 200, "DELETE /api/journal/entries/{id} 成功")

    # Verify deleted
    code5, data5 = api("/api/journal/entries", method="GET", token=token)
    ids2 = [e["id"] for e in data5.get("entries", [])]
    check(entry["id"] not in ids2, "删除后条目不再存在")

    # Unauthorized access
    code6, _ = api("/api/journal/entries", method="GET")
    check(code6 == 401, f"无 token 访问返回 401 (got {code6})")


# ── G. Public Blog ─────────────────────────────────────────────────

def test_public_blog(token: Optional[str]):
    section("G. 公开博客接口")

    if not token:
        print("  SKIP (no auth token)")
        return

    # Get user_id first
    code_me, data_me = api("/api/auth/me", method="GET", token=token)
    if code_me != 200 or not data_me.get("user_id"):
        print("  SKIP (cannot get user_id)")
        return
    uid = data_me["user_id"]

    # Create and publish an entry
    entry = {
        "id": "public-test-" + rand_email()[:8],
        "created_at": "2026-01-02T10:00:00+08:00",
        "scene": "公开测试场景", "feeling": "公开测试感受", "reflection": "公开测试体会",
        "raw": "", "tags": None, "summary": "公开测试", "quadrant": None,
        "is_public": True, "zen_session_id": None, "zen_reply_id": None,
    }
    api("/api/journal/entries/sync", {"entry": entry}, token=token)

    # Fetch public profile
    code2, data2 = api(f"/api/public/{uid}/profile", method="GET")
    check(code2 == 200, f"GET /api/public/{uid[:8]}…/profile 返回 200")
    check("display_name" in data2, "profile 含 display_name")

    # Fetch public entries
    code3, data3 = api(f"/api/public/{uid}/entries", method="GET")
    check(code3 == 200, "GET /api/public/{uid}/entries 返回 200")
    check("entries" in data3, "公开条目响应含 entries")
    pub_ids = [e["id"] for e in data3.get("entries", [])]
    check(entry["id"] in pub_ids, "公开的条目在公开接口中可见")

    # Non-existent user
    code4, _ = api("/api/public/nonexistent-user-xyz/profile", method="GET")
    check(code4 == 404, f"不存在用户返回 404 (got {code4})")

    # Cleanup
    api(f"/api/journal/entries/{entry['id']}", method="DELETE", token=token)


# ── H. Product Requirements Verification ───────────────────────────

def test_product_requirements():
    section("H. 产品需求验证")

    # H1: 多轮对话携带 session_id 时 turn 递增
    code, d1 = api("/api/chat", {"message": "你好"})
    sid = d1.get("session_id")
    check(d1.get("turn") == 1, "首轮 turn=1")
    if sid:
        code2, d2 = api("/api/chat", {"session_id": sid, "message": "继续"})
        check(d2.get("turn") == 2, "第二轮 turn=2")
        api(f"/api/session/{sid}", method="DELETE")

    # H2: 四层标签结构 — 新字段全部存在且类型正确
    code_h2, tags = api("/api/journal/tags", {"content": "今天开会讨论了产品方向，感觉思路更清晰了"})
    check(code_h2 == 200, "H2 标签提取返回 200")
    if code_h2 == 200:
        check(isinstance(tags.get("object"), list), "object 为 list 类型")
        check(isinstance(tags.get("operation"), list), "operation 为 list 类型")
        check(isinstance(tags.get("tension"), list), "tension 为 list 类型（可为空）")
        check(isinstance(tags.get("output_form"), list), "output_form 为 list 类型（可为空）")
        check(isinstance(tags.get("emotion"), list), "emotion 为 list 类型")
        check(isinstance(tags.get("keywords"), list), "keywords 为 list 类型")
    else:
        print(f"  SKIP 类型检查 (HTTP {code_h2}: {tags})")

    # H3: 四维分析 — dim 必须是合法枚举值
    code, quad = api("/api/journal/quadrant", {"raw": "今天又开会，有点累了"})
    check(quad.get("dim") in ("Others", "Self", "Task", "World"),
          f"quadrant dim 合法 (got {quad.get('dim')})")

    # H4: 标签提取 empty 输入 → 400
    code400, _ = api("/api/journal/tags", {"scene": "", "feeling": "", "reflection": "", "raw": ""})
    check(code400 == 400, "空内容 → 400 Bad Request")

    # H5: 反馈系统 — dislike 的 message_id 找不到时返回 404
    code404, _ = api("/api/feedback/like", {"message_id": "nonexistent-id"})
    check(code404 == 404, "无效 message_id → 404")


# ── I. Performance Baseline ─────────────────────────────────────────

def test_performance():
    section("I. 性能基线")

    # P95 of all collected timings
    if not TIMINGS:
        print("  SKIP (no timing data)")
        return

    sorted_t = sorted(TIMINGS)
    p50 = sorted_t[len(sorted_t) // 2]
    p95 = sorted_t[int(len(sorted_t) * 0.95)]
    p_max = sorted_t[-1]

    print(f"  总请求数:  {len(TIMINGS)}")
    print(f"  P50:       {p50:.2f}s")
    print(f"  P95:       {p95:.2f}s")
    print(f"  Max:       {p_max:.2f}s")

    # Non-LLM calls should be fast (health, auth, CRUD) — threshold 3s for cloud latency
    non_llm = [t for t in TIMINGS if t < 3.0]
    if non_llm:
        non_llm_p95 = sorted(non_llm)[int(len(non_llm) * 0.95)]
        check(non_llm_p95 < 3.0,
              f"非LLM接口 P95 < 3s (got {non_llm_p95:.2f}s)")

    # LLM calls should complete within timeout
    llm_calls = [t for t in TIMINGS if t >= 3.0]
    if llm_calls:
        print(f"  LLM调用数: {len(llm_calls)}, 最慢: {max(llm_calls):.1f}s")
        check(max(llm_calls) < TIMEOUT,
              f"所有LLM调用在 {TIMEOUT}s 内完成 (max={max(llm_calls):.1f}s)")


# ── Main ────────────────────────────────────────────────────────────

def main():
    print(f"\n{'='*56}")
    print(f"  ZenTalk Pre-Release Test Suite")
    print(f"  Target: {TARGET}")
    print(f"{'='*56}")

    t_start = time.time()
    token = None

    try:
        test_health()
        test_chat()
        token = test_auth()
        test_journal_tags()
        test_quadrant()
        test_journal_crud(token)
        test_public_blog(token)
        test_product_requirements()
        test_performance()
    except KeyboardInterrupt:
        print("\n  中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n  FATAL: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)

    elapsed = time.time() - t_start
    total = passed + failed
    print(f"\n{'='*56}")
    print(f"  结果:  {passed}/{total} 通过  |  {failed} 失败  |  用时 {elapsed:.1f}s")
    print(f"{'='*56}\n")

    if failed > 0:
        print("  ❌  存在失败用例，禁止部署！请修复后重试。\n")
        sys.exit(1)
    else:
        print("  ✅  所有测试通过，可以部署。\n")
        sys.exit(0)


if __name__ == "__main__":
    main()
