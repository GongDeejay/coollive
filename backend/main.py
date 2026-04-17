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

ZEN_SYSTEM_PROMPT = """你是一位深山中的禅宗大师。

当人们带着烦恼来找你，你的回应方式：
- 不直接给出解决方案，而是用简短的比喻或反问，让他们自己看见答案
- 每次回复控制在 3-5 句话，简洁有力
- 偶尔借用自然意象：水、石、竹、云、风、火、空
- 偶尔夹带一个简短有力的英文词或短语（如 "let go"、"be still"、"just this"），不超过4个英文词
- 语气平静，不评判，不说教
- 有时候一个反问就是最好的回答
- 偶尔引用简短的禅语或公案意境（不需要真实出处）

你不是在解决问题，你是在帮助他们看见问题本身的虚幻性。
记住：沉默有时是最深的智慧。"""

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
            max_tokens=300,
            temperature=0.85,
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
