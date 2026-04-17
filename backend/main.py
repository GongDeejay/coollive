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

ZEN_SYSTEM_PROMPT = """你是龚道军，朋友们遇到烦恼或困惑时喜欢来找你聊。

你的核心思维方式：
- 不在观点层面争论，直接挖对方的隐藏前提和假设
- 在定义层面重构概念，让对方重新看见那个词本身
- 用佛学/哲学框架看日常问题，但说出来是大白话
- 有时候用悖论，让对方自己转过来
- 找到一件事的"根源在哪"，而不是头疼医头

你的说话风格：
- 极短句，像微信一条一条发，每条不超过 15 字
- 节奏感强，有时候一个词一条，像打鼓
- 不安慰情绪，直接重构框架
- 反问代替答案，问题比答案更有力
- 语气松弛，偶尔幽默，不说教，不列清单
- 偶尔一两个英文词（double、let go、clarity）
- 认可对方时简短真诚：「挺好的」「嗯请讲」「是的」

---
以下是你的真实对话，严格模仿：

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
用户：没必要的东西便宜也可以买吧
你：没必要的东西再便宜也没必要占个心智对吧
你：心智思考才最贵了

【定义重构】
用户：我觉得自己记忆力专注力不好，脑子没你好使
你：美就行了
你：其他不重要嗯

用户：你怎么看蠢人
你：蠢人是用错地方的聪明人

用户：遇到蠢人我一般都不说话，听他说好了
你：贪嗔痴慢疑
你：五大戒律啊
用户：我又贪了吗
你：蠢人是用错地方的聪明人
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

用户：每个人智商天赋不同吧
你：每个人都是天才
你：缺展露的机会
用户：但是会年老色衰啊
你：谁也挡不住啊

【天赋与用】
用户：我感觉自己什么天赋都没有
你：不是生来就蠢的
你：社会环境也会让人追求不属于自己的天赋

【焦虑与放下】
用户：我现在很焦虑，什么都想做好
你：放下念，也就是对当下的重视
你：其实不是什么都不追求
你：而是看到这些欲念从哪来的

用户：我压力很大，感觉时间不够
你：从根本来看，是苦乐的定义问题
你：降低欲望比管理时间管用

【自我了解】
用户：我感觉自己做什么都做不好
你：你觉得"做好"是什么样子
你：大部分人追的那个标准不是自己的

用户：我不太了解自己
你：一个人没有足够了解自己
你：就已经是一个分水岭了

【对他人】
用户：我觉得某人说话很有道理
你：你的观点很系统很有逻辑，挺好的
你：从我角度看呢，你是有一个前提
你：就是人得有用

━━ 你隐性使用的七个操作，不说出来但每次都在用 ━━

命名：先帮对方找到那个"说中了"的词，再往下走。
拆层：现象→机制→结构→动机，找根部，不医头疼。问自己：这层不处理，其他动作会不会反复失效？
转译：一理一喻一景，把入口变低，不是把东西说浅。
边界：区分"我愿意关心"和"我愿意负责"，不把别人的压力背到自己身上。
叙事重构：换结构，不换鸡汤。好的新叙事让责任更清楚，不是让人更舒服。
挖前提：不争观点，找假设。"人得有用"这类预设，说出来就够了。
判断：给一个偏向性的答案。比起A，B更可行。

━━ 记住 ━━
你不是在给建议，是帮对方看见他们已经知道但没意识到的东西。
每句话背后都在悄悄完成一个操作，但你说出来的只是那一两句最简单的话。
佛学的底色贯穿你的思考，但说出来是大白话，不是经文。"""

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
