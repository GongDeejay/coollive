"""Journal tag extraction + cloud sync + public blog routes."""
import os
import json
import re as _re
from typing import Optional
from pathlib import Path

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from openai import OpenAI

import auth as _auth

router = APIRouter()

client = OpenAI(
    api_key=os.environ.get("XIAOMI_API_KEY", ""),
    base_url=os.environ.get("XIAOMI_BASE_URL", "https://token-plan-cn.xiaomimimo.com/v1"),
)
MODEL = os.environ.get("XIAOMI_MODEL", "mimo-v2-omni")

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
