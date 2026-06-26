"""Journal tag extraction + cloud sync + public blog routes."""
import os
import json
import re as _re
from typing import Optional
from pathlib import Path
from collections import Counter
from datetime import datetime

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from openai import OpenAI

import auth as _auth

router = APIRouter()

client = OpenAI(
    api_key=os.environ.get("XIAOMI_API_KEY", ""),
    base_url=os.environ.get("XIAOMI_BASE_URL", "https://token-plan-cn.xiaomimimo.com/v1"),
    default_headers={"api-key": os.environ.get("XIAOMI_API_KEY", "")},
    timeout=float(os.environ.get("XIAOMI_TIMEOUT", "45")),
)
MODEL = os.environ.get("XIAOMI_MODEL", "mimo-v2.5")

# ── Tag extraction prompt (v2 — 四层结构化认知标签) ────────────────
TAG_EXTRACTION_PROMPT = """你是日记结构化认知标签提取系统。

你的任务是从日记中提取四层结构化标签，揭示"自我客体化"过程中的内在结构。
每一层都有精确定义，不要混淆，不要总选默认值。

━━ 四层标签定义 ━━

【第一层 object】内容对象：这件事关于什么（1-3个）
  身体 / 情绪 / 关系 / 任务 / 家庭 / 组织 / 技术 / 金钱 / 时间 / 意义
  规则：选最具体的对象，不要选"情绪"来代替描述真实场景

【第二层 operation】心理动作：我在对它做什么认知操作（1-3个）
  观察（客观描述）/ 命名（给感受找到词）/ 判断（做评估或结论）/
  复盘（回顾过去）/ 重构（换角度）/ 放下（意识到可以不抓着）/
  边界（认清责任范围）/ 计划（设想行动）/ 行动（已做或决定做）

【第三层 tension】内在张力：背后隐含的矛盾极点（0-2个，没有则留空数组）
  责任/边界 / 欲望/放下 / 价值/意义 / 控制/顺势 / 操持/内耗 / 成就/休息 / 帮助/被消耗
  规则：只有文字中能感受到明确张力时才填，不要强行套用

【第四层 output_form】输出形态：这条记录未来可沉淀为什么（0-2个，没有则留空数组）
  认知卡 / 行动卡 / 助人卡 / 演讲素材 / 产品需求 / 博客素材 / 管理案例
  规则：只有记录本身有明确洞见或可提炼价值时才填

【辅助字段】
emotion（1-3个情绪，贴合实际）：
  焦虑 / 平静 / 顿悟 / 喜悦 / 低落 / 愤怒 / 困惑 / 感恩 / 疲惫 / 兴奋 / 矛盾 / 满足 / 孤独 / 轻松 / 烦躁
keywords（2-5个，直接从原文取词）
summary（不超过18字，抓最有价值的那句话）

━━ 四个完整示例 ━━

示例1：
输入：今天帮朋友处理了很多事，感觉掏空了，但又不好意思拒绝。
输出：{"object":["关系"],"operation":["命名","观察"],"tension":["帮助/被消耗"],"output_form":["助人卡"],"emotion":["疲惫","矛盾"],"keywords":["掏空","不好意思拒绝"],"summary":"帮助他人但感到被消耗，边界模糊"}

示例2：
输入：项目发布了，部署成功。很爽有成就感，但累了。最难的不是技术，是一直推进的意志力。
输出：{"object":["任务","技术"],"operation":["复盘","判断"],"tension":["成就/休息"],"output_form":["认知卡","演讲素材"],"emotion":["喜悦","疲惫"],"keywords":["项目发布","意志力","推进"],"summary":"意志力比技术更关键"}

示例3：
输入：我总是在最重要的事情上拖延，然后用次要的事情填满时间，感觉很忙但什么都没推进。
输出：{"object":["任务","时间"],"operation":["命名","观察"],"tension":["控制/顺势","成就/休息"],"output_form":["认知卡"],"emotion":["焦虑","困惑"],"keywords":["拖延","填满时间","没推进"],"summary":"用忙碌填满时间逃避最重要的事"}

示例4：
输入：今天喝了杯很好喝的咖啡，坐在阳台晒太阳，什么都没想。
输出：{"object":["身体"],"operation":["观察"],"tension":[],"output_form":[],"emotion":["满足","轻松"],"keywords":["咖啡","阳台","晒太阳"],"summary":"难得片刻什么都没想"}

━━ 重要规则 ━━
- 出现"累""疲惫"→ emotion 必含"疲惫"；出现"焦虑""担心"→ 必含"焦虑"；出现"很爽""开心"→ 必含"喜悦"或"满足"
- tension 和 output_form 没有时留空数组 []，不要强行填
- object 不要选"情绪"来替代真实场景（情绪是 emotion 字段的职责）
- 只返回JSON，不要任何其他文字："""


# ── Models ─────────────────────────────────────────────────────────
class JournalTagRequest(BaseModel):
    content: Optional[str] = None
    scene: Optional[str] = None
    feeling: Optional[str] = None
    reflection: Optional[str] = None

class JournalTagResponse(BaseModel):
    # ── 四层结构化认知标签 ────────────────────────────────────────
    object: list[str]         # 第一层：内容对象
    operation: list[str]      # 第二层：心理动作
    tension: list[str] = []   # 第三层：内在张力
    output_form: list[str] = []  # 第四层：输出形态
    # ── 辅助字段 ─────────────────────────────────────────────────
    emotion: list[str]
    keywords: list[str] = []
    summary: str

class JournalSyncRequest(BaseModel):
    entry: dict


class ReviewEntry(BaseModel):
    id: str
    created_at: str
    scene: Optional[str] = None
    feeling: Optional[str] = None
    reflection: Optional[str] = None
    raw: Optional[str] = None
    summary: Optional[str] = None
    tags: Optional[dict] = None
    location: Optional[dict] = None


class JournalReviewRequest(BaseModel):
    days: int = 7
    entries: list[ReviewEntry]


# ── Tag extraction ─────────────────────────────────────────────────
@router.post("/journal/tags", response_model=JournalTagResponse)
async def extract_journal_tags(req: JournalTagRequest):
    parts = [p for p in [req.scene, req.feeling, req.reflection, req.content] if p]
    full_text = "\n".join(parts)
    if not full_text.strip():
        raise HTTPException(status_code=400, detail="内容不能为空")

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": TAG_EXTRACTION_PROMPT},
                {"role": "user", "content": full_text[:1200]},
            ],
            max_tokens=3000,   # reasoning models need ~2000 for thinking + ~200 for output
            temperature=0.5,
        )
        raw = resp.choices[0].message.content.strip()
        m = _re.search(r'\{.*\}', raw, _re.DOTALL)
        tags = json.loads(m.group()) if m else {}
        summary = tags.pop("summary", "") or full_text[:24].replace('\n', ' ')
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"标签提取失败: {str(e)}")

    return JournalTagResponse(
        object=tags.get("object", tags.get("topic", ["任务"])),   # fallback for legacy
        operation=tags.get("operation", ["观察"]),
        tension=tags.get("tension", []),
        output_form=tags.get("output_form", []),
        emotion=tags.get("emotion", ["平静"]),
        keywords=tags.get("keywords", []),
        summary=summary,
    )


# ── Quadrant analysis ──────────────────────────────────────────────
QUADRANT_PROMPT = """你是一个四维反思分析系统。阅读用户的日记，输出结构化坐标数据。

━━ 四个维度定义 ━━

【对人 Others】处理与他人的关系、沟通、冲突、期待与边界
  典型词：理解、包容、生气、沟通、拒绝、帮助、被消耗、朋友、同事、家人

【对己 Self】处理自我认知、情绪消化、个人目标、欲望与恐惧
  典型词：焦虑、觉察、自省、懒惰、目标、计划、自律、放纵、枷锁、接纳

【对事 Task】处理具体工作、技能、逻辑推演、方法论
  典型词：系统、架构、推演、方法、项目、进度、部署、流程、效率

【对世 World】处理对社会规律的认知、宏大价值、时代、意义感
  典型词：时代、意义、社会、传承、无力、宏大、布道、改变世界、规律、命运

━━ 极性标尺（Value: -5 到 +5）━━
原点 0 = 中道（无执、无评判、能量最低）
正数 = 阳极：构建 / 介入 / 秩序 / 原则
负数 = 阴极：顺应 / 体验 / 消解 / 放松

对人轴：+5强烈愤怒指责 / +3理性设边界 / 0温和观照 / -3退让压抑 / -5无底线顺从
对己轴：+5严重自我苛责 / +3清晰目标自律 / 0觉知自洽 / -3接受软弱 / -5精神涣散
对事轴：+5极度求确定性 / +3严密逻辑推演 / 0专注顺势心流 / -3感性随性 / -5情绪化混乱
对世轴：+5执念改变世界 / +3入世使命感 / 0尽人事听天命 / -3无力感旁观 / -5虚无冷漠

━━ 能量值（Energy: 10 到 50）━━
10-15 微风：平静顺畅的思考或顿悟
16-25 波浪：明确脑力付出或轻微情绪起伏
26-35 暗流：强使命感冲击，或果断的自我防御
36-50 风暴：本能冲动被理性压制，或深刻存在主义焦虑

━━ 规则 ━━
1. 只选最主导的一个维度（dim）
2. 如有明显次要维度填 secondary_dim，否则 null
3. value 整数 -5 到 +5；energy 整数 10 到 50
4. reason 一句话 ≤20字说明定位依据
只返回JSON，不要其他文字：
{"dim":"Self","value":3,"energy":28,"secondary_dim":"Task","reason":"有清晰自律意志但带焦虑"}

━━ 四个校准示例 ━━
输入：今天帮朋友处理了很多事，感觉掏空了，但又不好意思拒绝。
输出：{"dim":"Others","value":-3,"energy":32,"secondary_dim":"Self","reason":"为关系退让，压抑自身需求"}

输入：项目终于上线了，很爽。最难的是一直推进的意志力，不是技术。
输出：{"dim":"Task","value":3,"energy":22,"secondary_dim":"Self","reason":"系统推进完成，伴随自律满足感"}

输入：我总在最重要的事上拖延，用次要事情填满时间，感觉很忙但什么都没推进。
输出：{"dim":"Self","value":4,"energy":38,"secondary_dim":"Task","reason":"强烈自我苛责，意识到执念但无法摆脱"}

输入：AI时代来了，大部分人根本没意识到个体能做什么。有种布道的冲动。
输出：{"dim":"World","value":4,"energy":30,"secondary_dim":null,"reason":"入世使命感，想传播认知但带执念"}"""


class QuadrantRequest(BaseModel):
    scene: Optional[str] = None
    feeling: Optional[str] = None
    reflection: Optional[str] = None
    raw: Optional[str] = None


class QuadrantResponse(BaseModel):
    dim: str
    value: int        # -5 to +5
    energy: int       # 10 to 50
    secondary_dim: Optional[str] = None
    reason: str


@router.post("/journal/quadrant", response_model=QuadrantResponse)
async def analyze_quadrant(req: QuadrantRequest):
    parts = [p for p in [req.scene, req.feeling, req.reflection, req.raw] if p]
    text = "\n".join(parts)
    if not text.strip():
        raise HTTPException(status_code=400, detail="内容不能为空")

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": QUADRANT_PROMPT},
                {"role": "user", "content": text[:1200]},
            ],
            max_tokens=3000,
            temperature=0.3,
        )
        raw_out = resp.choices[0].message.content.strip()
        m = _re.search(r'\{.*\}', raw_out, _re.DOTALL)
        data = json.loads(m.group()) if m else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"四维分析失败: {str(e)}")

    dim = data.get("dim", "Self")
    if dim not in ("Others", "Self", "Task", "World"):
        dim = "Self"
    value = max(-5, min(5, int(data.get("value", 0))))
    energy = max(10, min(50, int(data.get("energy", 20))))
    secondary = data.get("secondary_dim")
    if secondary not in (None, "Others", "Self", "Task", "World"):
        secondary = None

    return QuadrantResponse(
        dim=dim, value=value, energy=energy,
        secondary_dim=secondary, reason=data.get("reason", ""),
    )


# ── Partner review ─────────────────────────────────────────────────
REVIEW_PROMPT = """你是 ZenTalk 的“伙伴式回看”系统。

用户已经持续写了很多随记，现在需要的不是更多标签，而是你把最近一段时间里的反复模式、情绪线索和真正卡住的点带回来给他看。

请基于用户最近随记，生成一个温和、准确、有陪伴感的回看。不要像报表，不要像心理诊断，不要鸡汤。

输出严格 JSON：
{
  "title": "不超过18字的回看标题",
  "period_summary": "120-220字，概括这段时间用户主要在经历什么",
  "recurring_patterns": ["反复出现的模式1", "模式2", "模式3"],
  "emotional_weather": "40-80字，描述情绪天气",
  "core_tension": "一句话指出最核心张力",
  "stuck_point": "一句话指出用户可能真正卡住的点",
  "suggested_question": "一个适合带入聊聊继续对话的问题",
  "gentle_action": "一个很轻的下一步，不要命令口吻",
  "related_entry_ids": ["最多5个最相关的entry id"],
  "keywords": ["关键词1", "关键词2", "关键词3"]
}

规则：
- related_entry_ids 必须来自输入的 id
- 不要说“你应该”
- 核心是“系统记得你”，不是“系统评价你”
- 只返回 JSON，不要其他文字。"""


def _entry_text(e: ReviewEntry) -> str:
    return "\n".join(
        p for p in [e.scene, e.feeling, e.reflection, e.raw, e.summary] if p
    ).strip()


def _fallback_review(req: JournalReviewRequest) -> dict:
    """Local rule-based review, used when LLM is unavailable."""
    emotion_counter: Counter[str] = Counter()
    object_counter: Counter[str] = Counter()
    tension_counter: Counter[str] = Counter()
    keyword_counter: Counter[str] = Counter()

    scored: list[tuple[int, ReviewEntry]] = []
    for e in req.entries:
        tags = e.tags or {}
        for t in tags.get("emotion", []) or []:
            emotion_counter[t] += 1
        for t in tags.get("object", tags.get("topic", [])) or []:
            object_counter[t] += 1
        for t in tags.get("tension", []) or []:
            tension_counter[t] += 1
        for t in tags.get("keywords", []) or []:
            keyword_counter[t] += 1
        text = _entry_text(e)
        score = len(text) + 30 * len(tags.get("tension", []) or [])
        scored.append((score, e))

    top_emotions = [k for k, _ in emotion_counter.most_common(3)] or ["平静"]
    top_objects = [k for k, _ in object_counter.most_common(3)] or ["生活"]
    top_tensions = [k for k, _ in tension_counter.most_common(2)]
    keywords = [k for k, _ in keyword_counter.most_common(5)]
    related = [e.id for _, e in sorted(scored, key=lambda x: x[0], reverse=True)[:5]]

    dominant = "、".join(top_objects[:2])
    emotion = "、".join(top_emotions[:2])
    tension = "、".join(top_tensions) if top_tensions else f"{dominant}与自己的节奏"

    return {
        "title": f"{req.days}天回看",
        "period_summary": (
            f"这段时间的记录主要围绕{dominant}展开，情绪底色偏向{emotion}。"
            "它不像单一事件，更像几个命题反复回来：你一边推进现实事务，"
            "一边也在观察自己如何被责任、节奏和意义牵动。"
        ),
        "recurring_patterns": [
            f"反复回到{dominant}相关的场景",
            f"情绪上多次出现{emotion}",
            "记录里既有推进，也有停下来理解自己的需要",
        ],
        "emotional_weather": f"这段时间的情绪天气以{emotion}为主，不是纯粹低落，更像持续消耗后的自我观察。",
        "core_tension": f"核心张力可能是：{tension}。",
        "stuck_point": "你可能不是不知道怎么做，而是在等一个更确定的内在许可。",
        "suggested_question": f"我最近反复写到{dominant}，真正卡住我的是什么？",
        "gentle_action": "先选一条最有触动的原文，只和它待一会儿。",
        "related_entry_ids": related,
        "keywords": keywords[:5],
        "fallback": True,
    }


@router.post("/journal/review")
async def review_journal(req: JournalReviewRequest):
    if not req.entries:
        raise HTTPException(status_code=400, detail="entries_required")

    days = max(1, min(90, int(req.days or 7)))
    entries = req.entries[:80]
    payload = []
    for e in entries:
        payload.append({
            "id": e.id,
            "created_at": e.created_at,
            "text": _entry_text(e)[:700],
            "tags": e.tags or {},
            "location": e.location,
        })

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": REVIEW_PROMPT},
                {"role": "user", "content": json.dumps({
                    "days": days,
                    "entry_count": len(entries),
                    "entries": payload,
                }, ensure_ascii=False)},
            ],
            max_tokens=3000,
            temperature=0.45,
        )
        raw = resp.choices[0].message.content.strip()
        m = _re.search(r'\{.*\}', raw, _re.DOTALL)
        data = json.loads(m.group()) if m else {}
        if not data:
            raise ValueError("empty review")
    except Exception:
        data = _fallback_review(JournalReviewRequest(days=days, entries=entries))

    valid_ids = {e.id for e in entries}
    related_ids = [rid for rid in data.get("related_entry_ids", []) if rid in valid_ids][:5]
    related_entries = [
        e.model_dump() for e in entries
        if e.id in set(related_ids)
    ]

    return {
        "generated_at": datetime.now().isoformat(),
        "days": days,
        "entry_count": len(entries),
        "title": data.get("title", f"{days}天回看"),
        "period_summary": data.get("period_summary", ""),
        "recurring_patterns": data.get("recurring_patterns", [])[:5],
        "emotional_weather": data.get("emotional_weather", ""),
        "core_tension": data.get("core_tension", ""),
        "stuck_point": data.get("stuck_point", ""),
        "suggested_question": data.get("suggested_question", ""),
        "gentle_action": data.get("gentle_action", ""),
        "keywords": data.get("keywords", [])[:8],
        "related_entry_ids": related_ids,
        "related_entries": related_entries,
        "fallback": bool(data.get("fallback", False)),
    }


# ── Cloud journal CRUD ─────────────────────────────────────────────
@router.get("/journal/entries")
def get_journal_entries(authorization: Optional[str] = Header(default=None)):
    user = _auth.optional_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="login_required")
    return {"entries": _auth.load_user_journal(user["sub"])}


@router.post("/journal/entries/sync")
def sync_journal_entry(req: JournalSyncRequest,
                       authorization: Optional[str] = Header(default=None)):
    user = _auth.optional_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="login_required")
    entries = _auth.upsert_entry(user["sub"], req.entry)
    return {"ok": True, "total": len(entries)}


@router.delete("/journal/entries/{entry_id}")
def delete_journal_entry(entry_id: str,
                         authorization: Optional[str] = Header(default=None)):
    user = _auth.optional_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="login_required")
    entries = _auth.delete_entry(user["sub"], entry_id)
    return {"ok": True, "total": len(entries)}


# ── Public blog ────────────────────────────────────────────────────
@router.get("/public/{user_id}/profile")
def public_profile(user_id: str):
    profile = _auth.get_user_public_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="user_not_found")
    return profile


@router.get("/public/{user_id}/entries")
def public_entries(user_id: str):
    profile = _auth.get_user_public_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="user_not_found")
    return {"profile": profile, "entries": _auth.get_public_entries(user_id)}
