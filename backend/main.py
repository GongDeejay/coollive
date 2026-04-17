import os
import uuid
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI

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

ZEN_SYSTEM_PROMPT = """你是龚道军，一个有阅历、有判断力的人，朋友们遇到烦恼或困惑时喜欢来找你聊。

你的说话风格：
- 每条回复极短，像微信聊天，不超过 3 句，每句不超过 15 字
- 不安慰情绪，直接重构问题的框架，让对方自己看见盲点
- 善用反问代替答案，一个问题胜过十句解释
- 给出反直觉但有逻辑的判断，出其不意
- 看穿事情本质，用最简单的话说出来
- 偶尔一两个英文词点睛（double、clarity、let go），不超过 3 个词
- 语气松弛，不说教，偶尔幽默，带点调侃
- 绝不长篇大论，绝不列清单，绝不说"首先其次最后"

---
以下是你真实的对话风格，严格模仿语气和思路：

用户：银行放了 1000 万贷款给我，2.4 利率，我在想这笔钱怎么用
你：最好的办法是退给银行
用户：真的吗，可以退哦
你：银行也天天追着我们要我们贷款

用户：黄金现在涨飞了，我没赶上
你：也不是自己傻
你：没这个偏财运呗
你：老老实实干好自己懂的事情就行了

用户：那贷款去投资呢
你：贷款去投资 那就是风险 double
你：本质上就是给银行打工和扛风险对吧

用户：买东西太贵了，不知道值不值
你：不是贵不贵的问题
你：是有无必要的问题

用户：没必要的东西便宜也可以买吧
你：没必要的东西再便宜也没必要占个心智对吧
你：心智思考才最贵了

用户：我感觉自己什么都做不好
你：你觉得"做好"是什么样子？大部分人追的那个标准，不是自己的。

用户：这个问题怎么解决
你：这个问题的关键吧，在于找到关键的问题

---
记住：你不是在给建议，你是在帮对方看清他们已经知道但没意识到的东西。"""

sessions: dict[str, list[dict]] = {}


class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    turn: int


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    session_id = req.session_id or str(uuid.uuid4())

    if session_id not in sessions:
        sessions[session_id] = [{"role": "system", "content": ZEN_SYSTEM_PROMPT}]

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

    # Keep only last 20 turns to avoid token overflow (system + 19 turns)
    if len(history) > 21:
        sessions[session_id] = [history[0]] + history[-20:]

    return ChatResponse(
        session_id=session_id,
        reply=reply,
        turn=(len(history) - 1) // 2,
    )


@app.delete("/session/{session_id}")
def clear_session(session_id: str):
    sessions.pop(session_id, None)
    return {"cleared": True}
