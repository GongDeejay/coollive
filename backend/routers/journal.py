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

# ── Tag extraction prompt ──────────────────────────────────────────
TAG_EXTRACTION_PROMPT = """你是日记标签提取系统，从日记中提取细致、有差异的标签和关键词。

关键要求：
- 严格区分细微差别，不要总选默认值
- 如果文字有明显情绪（比如"很爽""很累""很烦"），一定反映出来
- keywords 要直接从原文抽取，保留原词，不要概括成空话
- summary 要抓住最有意思的那一句话，不是流水账

维度和可选值：

emotion（1-3个，必须贴合实际情绪，不要默认"平静"）：
  焦虑 / 平静 / 顿悟 / 喜悦 / 低落 / 愤怒 / 困惑 / 感恩 / 空 /
  疲惫 / 兴奋 / 矛盾 / 满足 / 孤独 / 轻松 / 烦躁 / 期待

topic（1-4个，具体到真实领域）：
  自我 / 关系 / 工作 / 金钱 / 身体 / 时间 / 目标 / 创造 / 社会 /
  学习 / 决策 / 习惯 / 记忆 / 家庭 / 项目 / 技术 / 写作 / 健康

operation（1-3个，这段文字在做什么认知动作）：
  命名（给感受找到词）/ 重构（换了新角度）/ 执念（反复绕同一个点）/
  放下（意识到可以不抓着）/ 挖前提（发现了隐藏假设）/ 边界（认清责任范围）/
  判断（做了一个选择或结论）/ 观察（客观描述，没有评价）/ 复盘（回顾过去事件）/
  计划（设想未来行动）/ 感受（纯粹的情感表达）/ 顿悟（突然看清了某件事）

timeview（1个）：过去 / 当下 / 未来 / 跨越

energy（1个，不要总选"平稳"）：高能 / 低谷 / 平稳 / 波动

keywords（2-6个，直接从文字中取原词，保留具体性）

summary（不超过18字，抓核心，有观点，不做流水账）

---
示例1（有明确情绪）：
输入：项目发布了，部署成功。很爽，有成就感，但也有点累了。
     其实最难的不是技术，是一直推进的意志力

输出：{"emotion":["喜悦","疲惫"],"topic":["工作","项目","自我"],"operation":["复盘","感受","判断"],"timeview":"过去","energy":"波动","keywords":["项目发布","部署","意志力","推进"],"summary":"项目成功但也疲惫，意志力比技术更关键"}

示例2（负面情绪+习惯问题）：
输入：我总是在最重要的事情上拖延，然后用次要的事情填满时间，感觉很忙但什么都没推进

输出：{"emotion":["焦虑","困惑"],"topic":["时间","习惯","目标"],"operation":["执念","观察","命名"],"timeview":"当下","energy":"低谷","keywords":["拖延","次要的事","很忙","没推进"],"summary":"用忙碌填满时间逃避最重要的事"}

示例3（关系与边界顿悟）：
输入：今天跟朋友聊了很久，聊到关于边界这件事，我发现我总是把别人的情绪当成自己的责任

输出：{"emotion":["顿悟","矛盾"],"topic":["关系","自我"],"operation":["挖前提","命名","顿悟"],"timeview":"当下","energy":"波动","keywords":["边界","别人的情绪","责任感","朋友"],"summary":"发现自己总把他人情绪当成自己责任"}

示例4（轻松日常，不要夸大）：
输入：今天喝了杯很好喝的咖啡，坐在阳台晒太阳，什么都没想

输出：{"emotion":["满足","轻松"],"topic":["身体","自我"],"operation":["感受","观察"],"timeview":"当下","energy":"平稳","keywords":["咖啡","阳台","晒太阳","什么都没想"],"summary":"平静片刻，什么都没想"}

---
重要提示：
- 如果文字出现"很爽""开心""成就感"，emotion 必须包含"喜悦"或"满足"
- 如果文字出现"累""疲惫""耗尽"，emotion 必须包含"疲惫"
- 如果文字出现"焦虑""不安""担心""时间不够"，emotion 必须包含"焦虑"
- 如果出现"没做什么""什么都没想"，energy 可以是"平稳"
- 禁止在有明显情绪词汇的情况下选择"平静"作为唯一情绪
- 禁止在内容超过一个主题时只输出["自我"]

只返回JSON，不要任何其他文字："""


# ── Models ─────────────────────────────────────────────────────────
class JournalTagRequest(BaseModel):
    content: Optional[str] = None
    scene: Optional[str] = None
    feeling: Optional[str] = None
    reflection: Optional[str] = None

class JournalTagResponse(BaseModel):
    emotion: list[str]
    topic: list[str]
    operation: list[str]
    timeview: str
    energy: str
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
        emotion=tags.get("emotion", ["平静"]),
        topic=tags.get("topic", ["自我"]),
        operation=tags.get("operation", ["观察"]),
        timeview=tags.get("timeview", "当下"),
        energy=tags.get("energy", "平稳"),
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
