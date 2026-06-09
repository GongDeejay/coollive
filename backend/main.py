"""
ZenTalk API — entry point.
Routers are split by domain:
  routers/chat.py        — chat, feedback, sessions
  routers/journal.py     — tag extraction, cloud sync, public blog
  routers/auth_routes.py — register, login, me
  auth.py                — auth helpers, user/journal storage
"""
import os
import sys
from pathlib import Path

# Ensure backend dir is on path (needed when uvicorn is called with module path)
_backend_dir = Path(__file__).parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

# Validate required environment variables at startup
_REQUIRED_ENV = ["XIAOMI_API_KEY"]
_missing = [k for k in _REQUIRED_ENV if not os.environ.get(k)]
if _missing:
    raise RuntimeError(f"缺少必需环境变量: {', '.join(_missing)}")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.chat import router as chat_router
from routers.journal import router as journal_router
from routers.auth_routes import router as auth_router
from routers.mind_freedom import router as mf_router
from routers.admin_stats import router as admin_router

app = FastAPI(title="ZenTalk API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(journal_router)
app.include_router(auth_router)
app.include_router(mf_router)
app.include_router(admin_router)


@app.get("/health")
def health():
    return {"status": "ok"}
