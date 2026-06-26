"""Mind Freedom questionnaire routes.

Endpoints:
  GET  /mind-freedom/questions?test_idx=N  — Return one of 5 pre-generated sets
  POST /mind-freedom/analyze               — LLM analysis of 12 answers
  GET  /mind-freedom/results               — Cloud history (auth required)
  POST /mind-freedom/results/save          — Save result to cloud (auth required)
  DELETE /mind-freedom/results/{result_id} — Delete a result (auth required)

Data files (DATA_DIR):
  mind_freedom_sets.json        — 5 question sets, lazy-generated once
  assessments/{user_id}.json    — per-user results array
"""

import os
import json
import uuid
import time
import random
import math
import re as _re
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from openai import OpenAI

import auth as _auth

# ── Structured logger for this module ──────────────────────────────
logger = logging.getLogger("mind_freedom")
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter(
        "%(asctime)s [MF] %(levelname)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    ))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)

router = APIRouter()

# ── LLM client ─────────────────────────────────────────────────────
client = OpenAI(
    api_key=os.environ.get("XIAOMI_API_KEY", ""),
    base_url=os.environ.get("XIAOMI_BASE_URL", "https://token-plan-cn.xiaomimimo.com/v1"),
    default_headers={"api-key": os.environ.get("XIAOMI_API_KEY", "")},
    timeout=float(os.environ.get("XIAOMI_TIMEOUT", "60")),
)
MODEL = os.environ.get("XIAOMI_MODEL", "mimo-v2.5")

# ── Storage paths ───────────────────────────────────────────────────
DATA_DIR        = Path(os.environ.get("DATA_DIR", "/opt/zentalk/data"))
SETS_FILE       = DATA_DIR / "mind_freedom_sets.json"
ASSESSMENTS_DIR = DATA_DIR / "assessments"
DATA_DIR.mkdir(parents=True, exist_ok=True)
ASSESSMENTS_DIR.mkdir(parents=True, exist_ok=True)

# ── 12 question cores (fixed intent, varied phrasing per set) ──────
QUESTION_CORES = [
    {"id": "Q1",  "intent": "发现自己过度思考时，通常采用的应对方式或行动", "dim": "在场自由度"},
    {"id": "Q2",  "intent": "最害怕自己成为的那种人", "dim": "自我叙事"},
    {"id": "Q3",  "intent": "对真正自由的理解——不是什么，而是什么", "dim": "取舍自由度"},
    {"id": "Q4",  "intent": "别人无法理解自己想表达的复杂意思时，内心深处的感受", "dim": "认知自由度"},
    {"id": "Q5",  "intent": "权力对自己既是什么，也是什么——双重理解", "dim": "取舍自由度"},
    {"id": "Q6",  "intent": "回顾过去大量努力，发现背后真正在做的事是什么", "dim": "自我结构"},
    {"id": "Q7",  "intent": "需要推动别人改变，而对方很慢时的内心状态和做法", "dim": "取舍自由度"},
    {"id": "Q8",  "intent": "对成功的理解，正在从什么变成什么", "dim": "成功观"},
    {"id": "Q9",  "intent": "最难放下的不是某个具体东西，而是某种更深的东西", "dim": "认知自由度"},
    {"id": "Q10", "intent": "当谈到开悟或境界提升时，真正想追问的是什么", "dim": "意义结构"},
    {"id": "Q11", "intent": "如果不再需要证明自己，可能会去做的事", "dim": "证明欲"},
    {"id": "Q12", "intent": "希望未来的自己既能做到某事，又能做到某事——理想的双向整合", "dim": "未来整合"},
]

QUESTION_GEN_PROMPT = """你是心智自由度问卷设计助手。

以下是12道问题的核心意图，每道题采用中文句子完成题格式（句末用"……"表示填空）。

请为每道题生成5个不同措辞的版本，要求：
- 措辞自然流畅，有中文书写质感
- 每个版本用词和切入角度有明显差异
- 保持句子完成题格式（含填空感，不要变成疑问句）
- 字数适中，10-25字之间

核心意图列表（编号、意图、考察维度）：
""" + "\n".join(
    f"{c['id']}（{c['dim']}）: {c['intent']}" for c in QUESTION_CORES
) + """

请以JSON格式输出5套，每套包含12道题：
{"sets":[[{"id":"Q1","text":"句子完成题……","dim":"维度"},{"id":"Q2",...},...12道],第2套,...,第5套]}

只返回JSON，不要任何其他文字。"""

# ── Analysis prompt ────────────────────────────────────────────────
ANALYSIS_PROMPT = """你是一个结合哲学、心理学、成人发展理论和交互设计的心智自由度分析助手。

请基于用户对12个句子完成题的回答，分析其当前"心智自由度"。

心智自由度包含三个维度：
1. 认知自由度（Cognitive Freedom）：不被单一解释、单一模型、单一因果链困住的能力。
2. 取舍自由度（Discernment Freedom）：在责任、欲望、关系、行动之间把握有所为有所不为的能力。
3. 在场自由度（Presence Freedom）：从抽象思考、自我执著和意义压力中回到身体、行动、关系与生活现场的能力。

请注意：
- 本测试不是心理诊断，不要给用户贴人格标签
- 不要判断用户是否开悟，不要制造高低优劣感
- 分数是探索性画像，不代表绝对能力
- 重点分析用户当前可调用的心智结构，而非日常稳定状态
- 所有建议必须具体、可执行，不要给出抽象鸡汤

请严格输出以下JSON格式，不要其他文字：
{
  "scores": {
    "cognitive": <0-100整数>,
    "discernment": <0-100整数>,
    "presence": <0-100整数>
  },
  "summary": "<总体画像，150-300字>",
  "dimension_analysis": {
    "cognitive": "<认知自由度解释，100-150字>",
    "discernment": "<取舍自由度解释，100-150字>",
    "presence": "<在场自由度解释，100-150字>"
  },
  "key_quotes": [
    {"question_id": "<Q1-Q12>", "quote": "<用户原文片段>", "interpretation": "<一句话解读>"}
  ],
  "strengths": ["<优势1>", "<优势2>", "<优势3>"],
  "risks": ["<风险1>", "<风险2>", "<风险3>"],
  "recommendations": ["<具体建议1>", "<具体建议2>", "<具体建议3>"],
  "disclaimer": "本结果不是医学或心理诊断，仅作为自我观察参考。分数为探索性画像，不代表绝对能力水平。"
}"""


# ── Question set helpers ────────────────────────────────────────────

def _load_sets() -> list:
    """Return 5 question sets from file (generates lazily on first call)."""
    if SETS_FILE.exists():
        try:
            data = json.loads(SETS_FILE.read_text(encoding="utf-8"))
            if len(data.get("sets", [])) == 5:
                logger.info("Question sets loaded from cache: %s", SETS_FILE)
                return data["sets"]
            else:
                logger.warning("Cached sets file malformed (got %d sets), regenerating", len(data.get("sets", [])))
        except Exception as e:
            logger.warning("Failed to load cached sets: %s", e)
    logger.info("No valid cache found, generating question sets via LLM...")
    return _generate_and_save_sets()


def _generate_and_save_sets() -> list:
    """Call LLM once to generate 5 × 12 questions, persist to disk."""
    logger.info("Calling LLM to generate 5 question sets (model=%s)...", MODEL)
    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": "你是问卷设计助手，只输出JSON。"},
                {"role": "user", "content": QUESTION_GEN_PROMPT},
            ],
            max_tokens=6000,
            temperature=0.7,
        )
        raw = resp.choices[0].message.content.strip()
        logger.info("LLM response received, length=%d chars", len(raw))
        m = _re.search(r'\{.*\}', raw, _re.DOTALL)
        if not m:
            logger.error("No JSON found in LLM response: %s", raw[:200])
            return _static_fallback_sets()
        data = json.loads(m.group())
        sets = data.get("sets", [])
        logger.info("Parsed %d sets, sizes: %s", len(sets), [len(s) for s in sets])
        if len(sets) == 5 and all(len(s) == 12 for s in sets):
            SETS_FILE.write_text(
                json.dumps({"generated_at": time.time(), "sets": sets},
                           ensure_ascii=False, indent=2),
                encoding="utf-8"
            )
            logger.info("Question sets saved to %s", SETS_FILE)
            return sets
        else:
            logger.warning("Invalid sets structure, using fallback")
    except Exception as e:
        logger.error("LLM question generation failed: %s", e, exc_info=True)
    return _static_fallback_sets()


def _static_fallback_sets() -> list:
    """One static set duplicated 5 times as a safety fallback."""
    static = [
        {"id": c["id"], "text": _STATIC_QUESTIONS[c["id"]], "dim": c["dim"]}
        for c in QUESTION_CORES
    ]
    return [static] * 5


_STATIC_QUESTIONS = {
    "Q1":  "当我发现自己又开始过度思考时，我通常会……",
    "Q2":  "我最害怕自己变成一种……的人。",
    "Q3":  "对我来说，真正的自由不是……，而是……",
    "Q4":  "当别人不能理解我想表达的复杂意思时，我内心深处会……",
    "Q5":  "权力对我来说，既是……，也是……",
    "Q6":  "我现在越来越能看见，自己过去很多努力其实是在……",
    "Q7":  "当我必须推动别人改变，而别人又很慢的时候，我会……",
    "Q8":  '我对"成功"的理解，正在从……变成……',
    "Q9":  "我最难放下的不是某个具体东西，而是……",
    "Q10": '当我说"开悟"或者"境界提升"时，我真正想追问的是……',
    "Q11": "如果我不再需要证明自己，我可能会……",
    "Q12": "我希望未来的自己，既能……，又能……",
}


# ── Assessment storage helpers ──────────────────────────────────────

def _assessment_path(user_id: str) -> Path:
    return ASSESSMENTS_DIR / f"{user_id}.json"


def _load_user_assessments(user_id: str) -> list:
    path = _assessment_path(user_id)
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def _save_user_assessments(user_id: str, results: list):
    _assessment_path(user_id).write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ── Score calculation ───────────────────────────────────────────────

def _compute_overall(cognitive: float, discernment: float, presence: float) -> int:
    avg = (cognitive + discernment + presence) / 3
    mean = avg
    variance = ((cognitive - mean)**2 + (discernment - mean)**2 + (presence - mean)**2) / 3
    std_dev = math.sqrt(variance)
    balance = max(0, 100 - std_dev * 1.5)
    overall = avg * 0.7 + balance * 0.3
    return max(0, min(100, round(overall)))


# ── Pydantic models ─────────────────────────────────────────────────

class AnswerItem(BaseModel):
    question_id: str
    question_text: str
    answer: str


class AnalyzeRequest(BaseModel):
    answers: list[AnswerItem]


class SaveResultRequest(BaseModel):
    result: dict


# ── Routes ─────────────────────────────────────────────────────────

@router.get("/mind-freedom/questions")
async def get_questions(test_idx: int = 0):
    """Return 12 questions. test_idx 0-4 → fixed set; 5+ → random mix."""
    logger.info("GET /mind-freedom/questions test_idx=%d", test_idx)
    try:
        sets = _load_sets()
    except Exception as e:
        logger.error("_load_sets() raised: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="题目加载失败，请稍后重试")
    if test_idx < 5:
        questions = sets[test_idx]
        set_index = test_idx
    else:
        questions = [random.choice([s[i] for s in sets]) for i in range(12)]
        set_index = -1
    logger.info("Returning %d questions for set_index=%d", len(questions), set_index)
    return {"questions": questions, "set_index": set_index}


@router.post("/mind-freedom/analyze")
async def analyze_answers(req: AnalyzeRequest):
    """Submit 12 answers, get LLM analysis with scores and insights."""
    logger.info("POST /mind-freedom/analyze answers=%d", len(req.answers))
    if len(req.answers) < 3:
        raise HTTPException(status_code=400, detail="至少需要3条回答才能分析")

    answers_text = "\n".join(
        f"{a.question_id}. {a.question_text}\n回答：{a.answer}"
        for a in req.answers
        if a.answer.strip()
    )

    if not answers_text.strip():
        raise HTTPException(status_code=400, detail="回答内容不能为空")

    user_prompt = f"以下是用户对12道心智自由度问卷题的回答：\n\n{answers_text}\n\n请按要求格式输出分析结果。"

    try:
        logger.info("Calling LLM for analysis (model=%s, chars=%d)", MODEL, len(user_prompt))
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": ANALYSIS_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=4000,
            temperature=0.5,
        )
        raw = resp.choices[0].message.content.strip()
        logger.info("Analysis LLM response length=%d", len(raw))
        m = _re.search(r'\{.*\}', raw, _re.DOTALL)
        if not m:
            logger.error("No JSON in analysis response: %s", raw[:300])
            raise ValueError("LLM did not return valid JSON")
        data = json.loads(m.group())
        logger.info("Analysis parsed OK, scores=%s", data.get("scores"))
    except Exception as e:
        logger.error("Analysis failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI 分析失败: {str(e)}")

    # Validate and clamp scores
    scores_raw = data.get("scores", {})
    cognitive    = max(0, min(100, int(scores_raw.get("cognitive",    50))))
    discernment  = max(0, min(100, int(scores_raw.get("discernment",  50))))
    presence     = max(0, min(100, int(scores_raw.get("presence",     50))))
    overall      = _compute_overall(cognitive, discernment, presence)

    result = {
        "id":                str(uuid.uuid4()),
        "created_at":        time.strftime("%Y-%m-%dT%H:%M:%S+08:00"),
        "scores": {
            "cognitive":    cognitive,
            "discernment":  discernment,
            "presence":     presence,
            "overall":      overall,
        },
        "summary":           data.get("summary", ""),
        "dimension_analysis":data.get("dimension_analysis", {}),
        "key_quotes":        data.get("key_quotes", [])[:6],
        "strengths":         data.get("strengths", [])[:4],
        "risks":             data.get("risks", [])[:4],
        "recommendations":   data.get("recommendations", [])[:4],
        "disclaimer":        data.get("disclaimer", "本结果不是医学或心理诊断，仅作为自我观察参考。"),
        "journal_entry_id":  None,   # Reserved for future journal integration
    }
    return result


@router.get("/mind-freedom/results")
def get_results(authorization: Optional[str] = Header(default=None)):
    """Get all saved results for the authenticated user."""
    user = _auth.optional_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="login_required")
    results = _load_user_assessments(user["sub"])
    return {"results": results}


@router.post("/mind-freedom/results/save")
def save_result(req: SaveResultRequest,
                authorization: Optional[str] = Header(default=None)):
    """Save a result to the user's cloud storage."""
    user = _auth.optional_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="login_required")
    results = _load_user_assessments(user["sub"])
    # Deduplicate by id
    existing_ids = {r["id"] for r in results}
    if req.result.get("id") not in existing_ids:
        results.insert(0, req.result)
        _save_user_assessments(user["sub"], results)
    return {"ok": True, "total": len(results)}


@router.delete("/mind-freedom/results/{result_id}")
def delete_result(result_id: str,
                  authorization: Optional[str] = Header(default=None)):
    """Delete a result from the user's cloud storage."""
    user = _auth.optional_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="login_required")
    results = [r for r in _load_user_assessments(user["sub"]) if r.get("id") != result_id]
    _save_user_assessments(user["sub"], results)
    return {"ok": True, "total": len(results)}
