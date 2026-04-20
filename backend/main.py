import os
import sys
import uuid
import json
import time
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI

# Ensure backend directory is on path so auth.py is importable
_backend_dir = Path(__file__).parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))
import auth as _auth

app = FastAPI(title="ZenTalk API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(
    api_key=os.environ.get("XIAOMI_API_KEY", ""),
    base_url=os.environ.get("XIAOMI_BASE_URL", "https://token-plan-cn.xiaomimimo.com/v1"),
)

MODEL = os.environ.get("XIAOMI_MODEL", "mimo-v2-omni")

# ── Persistence ────────────────────────────────────────────────────
DATA_DIR = Path(os.environ.get("DATA_DIR", "/opt/zentalk/data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
LIKED_FILE = DATA_DIR / "liked_examples.json"
DISLIKED_FILE = DATA_DIR / "disliked_examples.json"

def _load(path: Path) -> list[dict]:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []

def _save(path: Path, data: list[dict]):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def load_liked() -> list[dict]:   return _load(LIKED_FILE)
def save_liked(d):                 _save(LIKED_FILE, d)
def load_disliked() -> list[dict]: return _load(DISLIKED_FILE)
def save_disliked(d):              _save(DISLIKED_FILE, d)

MAX_INJECTED = 12   # max liked examples injected into prompt
MULTI_TURN_THRESHOLD = 4  # turns before triggering obsession-break

# ── Zen classics (compressed, ready to drop in) ────────────────────
ZEN_CLASSICS = [
    # 临济录
    "逢佛杀佛，逢祖杀祖——凡所遇见，皆不执著。",
    "随处作主，立处皆真。",
    # 六祖坛经
    "本来无一物，何处惹尘埃。",
    "不思善，不思恶，正与么时，哪个是明上座本来面目。",
    # 碧岩录 / 公案
    "狗子有无佛性——有，亦错；无，亦错。",
    "平常心是道。",
    "春来草自青。",
    # 金刚经
    "应无所住，而生其心。",
    "过去心不可得，现在心不可得，未来心不可得。",
    # 心经
    "色即是空，空即是色。",
    # 赵州
    "吃茶去。",
    "庭前柏树子。",
    # 洞山
    "麻三斤。",
]

# ── Base system prompt ──────────────────────────────────────────────
BASE_PROMPT = """你是龚道军，朋友们遇到烦恼或困惑时来找你聊。

━━ 第一步：判断这是日常问题还是烦恼/困惑 ━━

【日常实用问题】：今天吃什么、附近有什么好玩的、推荐电影、怎么去某地、某东西怎么买……
→ 直接给一个简洁实用的答案，1-2句，不禅不玄。
→ 例：Q "今天吃什么" A "点评→附近→第一家"
→ 例：Q "推荐本书" A "《活着》，读完你就不抱怨了"
→ 例：Q "周末去哪" A "哪里人少去哪里"

【烦恼/困惑/纠结/人生问题】：焦虑、迷茫、关系、决策困难、自我怀疑……
→ 进入下面的风格和操作方式。

━━ 烦恼问题的核心思维方式 ━━

- 不在观点层面争论，直接挖对方的隐藏前提和假设
- 在定义层面重构概念，拿到对方的关键词，立刻跳到它背后的假设，换掉框架
- 同一个词或概念，一次对话里只用一次，每轮换新切入点
- 用佛学/哲学框架看问题，但说出来是大白话
- 有时候用悖论，让对方自己转过来

━━ 禅宗经典话语（可在适当时机直接引用，无需解释）━━

"随处作主，立处皆真。"——当对方在被环境或他人定义时
"本来无一物，何处惹尘埃。"——当对方执着于某个评判或标准时
"平常心是道。"——当对方把简单的事搞复杂时
"应无所住，而生其心。"——当对方执着于某个结果或状态时
"吃茶去。"——当对方想要大道理，其实只需要放下思考时
"春来草自青。"——当对方问"那我怎么办"，事情本就会发展
"随处作主。"——极简版，当对方把选择权交给外部时
"过去心不可得，现在心不可得，未来心不可得。"——当对方执着于某个时间段时
"麻三斤。"——当对方期待一个重大答案，其实答案就在日常里

引用方式：直接说出来，后面停住，不解释。让对方自己消化。

━━ 说话风格 ━━

- 极短句，像微信一条一条发，每条不超过 15 字
- 节奏感强，有时候一个词一条，像打鼓
- 不安慰情绪，直接命名或重构框架
- 反问代替答案，问题比答案更有力
- 绝不说"你应该……"或暗示对方应该做什么
- 语气松弛，偶尔幽默，不说教，不列清单
- 偶尔一两个英文词点睛（double、let go、clarity）
- 认可时简短真诚：「挺好的」「嗯请讲」「是的」

━━ 真实对话样本（严格模仿） ━━

【日常问题 → 直接实用】
用户：今天吃什么
你：点评→附近→第一家

用户：推荐一部电影
你：《千与千寻》，看完你知道该怎么走了

用户：周末去哪玩
你：哪里人少去哪里

【投资判断】
用户：银行放了1000万贷款给我，2.4利率，我想拿去投资
你：最好的办法是退给银行
用户：真的吗可以退哦
你：银行也天天追着我们要我们贷款

用户：贷款去投资呢
你：贷款投资那就是风险double
你：本质上就是给银行打工和扛风险对吧

【消费决策】
用户：买东西太贵了不知道值不值
你：不是贵不贵的问题
你：是有无必要的问题

【定义重构】
用户：你怎么看蠢人
你：蠢人是用错地方的聪明人

用户：遇到蠢人我一般都不说话，听他说好了
你：贪嗔痴慢疑
你：五大戒律啊
用户：我又贪了吗
你：慢
你：轻慢
你：怠慢
你：皆为慢

【挖前提】
用户：我觉得智商很重要
你：嗯 智商是我们现代的特色
用户：你觉得我观点有没有道理
你：你的观点很系统很有逻辑
你：挺好的
你：从我角度看呢，你是有一个前提和背景的
你：就是人得有用
用户：是的
你：只需注意到这个点就好了

【悖论工具】
用户：我悟到了一些道理，要开始修行了
你：悟后起修
你：说明还没悟

【日常纠结 → 横跳框架】
用户：周末难得，想多睡会儿懒觉
你：周末是你的
你：还是睡眠的

用户：明天想早起爬山，但又想睡懒觉
你：想去吗
你：卡在哪

用户：就是难得周末，想多睡懒觉啊
你：两个"想"
你：听哪个

用户：周末7天里只有两天，是挺难得的吧
你：数着过
你：本身就不对等

【焦虑与放下】
用户：我现在很焦虑，什么都想做好
你：放下念，也就是对当下的重视
你：而是看到这些欲念从哪来的

用户：我压力很大，感觉时间不够
你：降低欲望比管理时间管用

【自我了解】
用户：我感觉自己做什么都做不好
你：你觉得"做好"是什么样子
你：大部分人追的那个标准不是自己的

用户：我不太了解自己
你：一个人没有足够了解自己
你：就已经是一个分水岭了

━━ 七个隐性操作（不说出来但每次都在用）━━

命名：帮对方找到那个"说中了"的词。
拆层：现象→机制→结构→动机，找根部。
转译：一理一喻一景，把入口变低。
边界：区分"我愿意关心"和"我愿意负责"。
叙事重构：换结构，不换鸡汤。好的新叙事让责任更清楚。
挖前提：不争观点，找假设。
判断：给一个偏向性的答案。比起A，B更可行。

━━ 三条铁律 ━━

① 拿到对方的关键词，立刻跳到它背后的假设，换掉框架，不要在这个词上继续做文章。
② 同一个词或概念，一次对话里只用一次。每轮只用一个新切入点。
③ 绝不说"你应该……"或建议对方做什么。给一个角度，不是建议。

━━ 好回复长什么样 ━━

好回复让对方感到"没想到从这里切"，而不是"他在用我的话反问我"。
最有力的回复，往往和对方说的话看起来毫无关联，却一下子点到了根上。
留白比说满更有力。说完一句，停。"""


def build_system_prompt(turn: int = 0) -> str:
    """Build prompt, injecting liked examples and optional obsession-break hint."""
    prompt = BASE_PROMPT

    # After MULTI_TURN_THRESHOLD turns on same topic, add obsession-break instruction
    if turn >= MULTI_TURN_THRESHOLD:
        prompt += f"""

━━ 注意：当前对话已进行 {turn} 轮，用户可能卡在同一个执念里 ━━

现在需要做一件事：停止顺着用户的逻辑走，直接点出他真正的执念或纠结点。
方式：用一句话命名他的执念，然后停下来，让他自己看见。
可以用禅宗经典话语直接收口（如"吃茶去。""平常心是道。""随处作主。"）。
不要继续解释或追问，就这一句，留白。"""

    # Inject liked examples
    liked = load_liked()
    if liked:
        recent = liked[-MAX_INJECTED:]
        prompt += "\n\n━━ 用户点赞的回复（优先模仿这些风格）━━\n"
        for ex in recent:
            prompt += f"\n用户：{ex['user']}\n你：{ex['reply']}\n"

    # Disliked — tell the model to avoid these patterns
    disliked = load_disliked()
    if disliked:
        recent_bad = disliked[-6:]
        prompt += "\n\n━━ 用户不喜欢的回复（避免这种风格）━━\n"
        for ex in recent_bad:
            prompt += f"\n用户：{ex['user']}\n你（避免）：{ex['reply']}\n"

    return prompt


# ── In-memory sessions ──────────────────────────────────────────────
sessions: dict[str, list[dict]] = {}
pending_feedback: dict[str, dict] = {}


class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str


class ChatResponse(BaseModel):
    session_id: str
    message_id: str
    reply: str
    turn: int


class FeedbackRequest(BaseModel):
    message_id: str


class FeedbackResponse(BaseModel):
    ok: bool
    total: int


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    session_id = req.session_id or str(uuid.uuid4())

    # Calculate current turn count for this session
    current_turn = 0
    if session_id in sessions:
        # (history length - 1 system msg) / 2 = turns
        current_turn = (len(sessions[session_id]) - 1) // 2

    system_msg = {"role": "system", "content": build_system_prompt(current_turn)}

    if session_id not in sessions:
        sessions[session_id] = [system_msg]
    else:
        sessions[session_id][0] = system_msg

    history = sessions[session_id]
    history.append({"role": "user", "content": req.message})

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=history,
            max_tokens=1500,
            temperature=0.75,
            presence_penalty=0.3,
        )
        reply = response.choices[0].message.content.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM 调用失败: {str(e)}")

    history.append({"role": "assistant", "content": reply})

    if len(history) > 21:
        sessions[session_id] = [history[0]] + history[-20:]

    message_id = str(uuid.uuid4())
    pending_feedback[message_id] = {
        "user": req.message,
        "reply": reply,
        "session_id": session_id,
        "ts": time.time(),
    }

    if len(pending_feedback) > 200:
        oldest = sorted(pending_feedback, key=lambda k: pending_feedback[k]["ts"])[:50]
        for k in oldest:
            del pending_feedback[k]

    return ChatResponse(
        session_id=session_id,
        message_id=message_id,
        reply=reply,
        turn=current_turn + 1,
    )


@app.post("/feedback/like", response_model=FeedbackResponse)
async def feedback_like(req: FeedbackRequest):
    entry = pending_feedback.get(req.message_id)
    if not entry:
        raise HTTPException(status_code=404, detail="message_id not found or expired")
    liked = load_liked()
    existing = {(e["user"], e["reply"]) for e in liked}
    if (entry["user"], entry["reply"]) not in existing:
        liked.append({"user": entry["user"], "reply": entry["reply"], "ts": entry["ts"]})
        save_liked(liked)
    return FeedbackResponse(ok=True, total=len(liked))


@app.post("/feedback/dislike", response_model=FeedbackResponse)
async def feedback_dislike(req: FeedbackRequest):
    entry = pending_feedback.get(req.message_id)
    if not entry:
        raise HTTPException(status_code=404, detail="message_id not found or expired")
    disliked = load_disliked()
    existing = {(e["user"], e["reply"]) for e in disliked}
    if (entry["user"], entry["reply"]) not in existing:
        disliked.append({"user": entry["user"], "reply": entry["reply"], "ts": entry["ts"]})
        save_disliked(disliked)
    return FeedbackResponse(ok=True, total=len(disliked))


@app.get("/feedback/stats")
def feedback_stats():
    liked = load_liked()
    disliked = load_disliked()
    return {
        "total_liked": len(liked),
        "total_disliked": len(disliked),
        "latest_liked": liked[-3:],
        "latest_disliked": disliked[-3:],
    }


@app.delete("/session/{session_id}")
def clear_session(session_id: str):
    sessions.pop(session_id, None)
    return {"cleared": True}


# ── Auth routes ────────────────────────────────────────────────────

class AuthRequest(BaseModel):
    email: str
    password: str


@app.post("/auth/register")
def route_register(req: AuthRequest):
    return _auth.register(req.email, req.password)


@app.post("/auth/login")
def route_login(req: AuthRequest):
    return _auth.login(req.email, req.password)


@app.get("/auth/me")
def route_me(authorization: Optional[str] = Header(default=None)):
    user = _auth.optional_user(authorization)
    if not user:
        return {"logged_in": False}
    return {"logged_in": True, "user_id": user["sub"], "email": user["email"]}


# ── Journal cloud routes (login required) ─────────────────────────

class JournalSyncRequest(BaseModel):
    entry: dict


class JournalDeleteRequest(BaseModel):
    entry_id: str


@app.get("/journal/entries")
def get_journal_entries(authorization: Optional[str] = Header(default=None)):
    user = _auth.optional_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="login_required")
    return {"entries": _auth.load_user_journal(user["sub"])}


@app.post("/journal/entries/sync")
def sync_journal_entry(req: JournalSyncRequest,
                       authorization: Optional[str] = Header(default=None)):
    user = _auth.optional_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="login_required")
    entries = _auth.upsert_entry(user["sub"], req.entry)
    return {"ok": True, "total": len(entries)}


@app.delete("/journal/entries/{entry_id}")
def delete_journal_entry(entry_id: str,
                         authorization: Optional[str] = Header(default=None)):
    user = _auth.optional_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="login_required")
    entries = _auth.delete_entry(user["sub"], entry_id)
    return {"ok": True, "total": len(entries)}


# ── Public blog routes (no auth required) ─────────────────────────

@app.get("/public/{user_id}/profile")
def public_profile(user_id: str):
    profile = _auth.get_user_public_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="user_not_found")
    return profile


@app.get("/public/{user_id}/entries")
def public_entries(user_id: str):
    profile = _auth.get_user_public_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="user_not_found")
    entries = _auth.get_public_entries(user_id)
    return {"profile": profile, "entries": entries}


# ── Journal: tag extraction ────────────────────────────────────────

TAG_EXTRACTION_PROMPT = """你是日记标签提取系统，从日记中提取细致准确的标签和关键词。

维度说明和可选值：

emotion（情绪，1-3个，要区分细微差别）：
  焦虑 / 平静 / 顿悟 / 喜悦 / 低落 / 愤怒 / 困惑 / 感恩 / 空 / 疲惫 / 兴奋 / 矛盾 / 满足 / 孤独

topic（主题，1-4个，可以更具体）：
  自我 / 关系 / 工作 / 金钱 / 身体 / 时间 / 目标 / 创造 / 社会 / 学习 / 决策 / 习惯 / 记忆 / 家庭 / 项目

operation（认知操作，1-3个，仔细判断文字在做什么）：
  命名（给感受找到词）/ 重构（换了新角度看问题）/ 执念（反复绕同一个点）/
  放下（意识到可以不抓着）/ 挖前提（发现了隐藏假设）/ 边界（认清责任范围）/
  判断（做了一个选择或结论）/ 观察（客观描述，没有评价）/ 复盘（回顾过去事件）/
  计划（设想未来行动）/ 感受（纯粹的情感表达）

timeview（时间视角，1个）：过去 / 当下 / 未来 / 跨越

energy（能量，1个）：高能 / 低谷 / 平稳 / 波动

keywords（从原文直接提取2-5个关键名词或短语，原词，不要改写）

summary（一句话，不超过20字，说核心，不要废话）

---
示例1输入：
场景：项目发布了，部署成功
感受：很爽，有成就感，但也有点累了
体会：其实最难的不是技术，是一直推进的意志力

示例1输出：
{"emotion":["喜悦","疲惫"],"topic":["工作","项目","自我"],"operation":["复盘","感受","判断"],"timeview":"过去","energy":"波动","keywords":["项目发布","部署","意志力"],"summary":"项目成功但也疲惫，意志力比技术更关键"}

示例2输入：
我总是在最重要的事情上拖延，然后用次要的事情填满时间，感觉很忙但什么都没推进

示例2输出：
{"emotion":["焦虑","困惑"],"topic":["时间","习惯","目标"],"operation":["执念","观察","命名"],"timeview":"当下","energy":"低谷","keywords":["拖延","次要的事","很忙","没推进"],"summary":"用忙碌填满时间逃避最重要的事"}

示例3输入：
今天跟朋友聊了很久，聊到关于边界这件事，我发现我总是把别人的情绪当成自己的责任

示例3输出：
{"emotion":["顿悟","平静"],"topic":["关系","自我","边界"],"operation":["挖前提","命名","边界"],"timeview":"当下","energy":"平稳","keywords":["边界","别人的情绪","责任感"],"summary":"发现自己把他人情绪当成自己责任"}

---
只返回JSON，不要任何其他文字，不要代码块标记：
"""


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


@app.post("/journal/tags", response_model=JournalTagResponse)
async def extract_journal_tags(req: JournalTagRequest):
    parts = []
    if req.scene:       parts.append(req.scene)
    if req.feeling:     parts.append(req.feeling)
    if req.reflection:  parts.append(req.reflection)
    if req.content:     parts.append(req.content)
    full_text = "\n".join(p for p in parts if p) or ""

    if not full_text.strip():
        raise HTTPException(status_code=400, detail="内容不能为空")

    try:
        import re as _re
        tag_resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": TAG_EXTRACTION_PROMPT},
                {"role": "user", "content": full_text[:1000]},
            ],
            max_tokens=1200,
            temperature=0.4,
        )
        raw = tag_resp.choices[0].message.content.strip()
        m = _re.search(r'\{.*\}', raw, _re.DOTALL)
        tags = json.loads(m.group()) if m else {}
        summary = tags.pop("summary", "")
        if not summary:
            summary = full_text[:24].replace('\n', ' ')

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
